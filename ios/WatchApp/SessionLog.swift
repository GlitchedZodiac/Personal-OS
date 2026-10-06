// Session-side types for the two 2026-10-05 features: the jump rope
// protocol he dials before Start, and the per-entry voice log a freestyle or
// strength session builds as he talks. Pure value types + two small disk
// stores; the state machine that drives them lives in AppModel.

#if os(watchOS)
import Foundation

// MARK: - Jump rope protocol

/// What he sets before Start. Remembered between sessions — he mostly does
/// the same 30/30, so the setup screen should open already right.
struct RopeConfig: Codable, Equatable, Sendable {
    var intervals = true
    var workSeconds = 30
    var restSeconds = 30
    /// 0 = open-ended (he ends it from the controls page).
    var rounds = 20

    private static let key = "rope.config"

    static func load() -> RopeConfig {
        guard let data = UserDefaults.standard.data(forKey: key),
              let config = try? JSONDecoder().decode(RopeConfig.self, from: data)
        else { return RopeConfig() }
        return config
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    /// "30/30" — the same key the phone groups sessions by.
    var protocolLabel: String {
        intervals ? "\(workSeconds)/\(restSeconds)" : "continuous"
    }

    /// Planned session length, when it has one.
    var plannedSeconds: Int? {
        guard intervals, rounds > 0 else { return nil }
        return rounds * (workSeconds + restSeconds)
    }
}

enum RopePhase: Equatable, Sendable { case work, rest }

// MARK: - Voice entries (live state)

/// One thing he said. A single clip can name several movements ("10 swings
/// and 5 push-ups"), so `parsed` is a list.
struct VoiceEntryState: Identifiable, Equatable, Sendable {
    enum Status: String, Sendable {
        /// Uploaded, waiting on the server.
        case working
        case ok
        /// Parsed, but the server was not sure — the phone asks him.
        case review
        /// No connection: the audio is on disk and will be sent later.
        case queued
        /// Recognised nothing usable.
        case failed
    }

    let id: String
    /// Elapsed seconds into the workout when he said it.
    let t: Int
    let at: Date
    var status: Status
    var parsed: [ParsedVoiceEntryPayload] = []
    var transcript: String?
    /// File name inside VoicePendingStore's directory while queued.
    var audioFile: String?
    /// A one-off message that replaces the usual line (mic not allowed).
    var note: String?

    /// What the wrist shows: the server's short lines, or the state.
    var lines: [String] {
        if let note { return [note] }
        switch status {
        case .working: return ["Got it…"]
        case .queued: return ["Saved · adds when online"]
        case .failed: return ["Didn't catch that"]
        case .ok, .review: return parsed.map(\.display)
        }
    }
}

// MARK: - The per-entry log (mirror of lib/set-log.ts)

enum SetLog {
    /// Flatten live voice entries into the wire log. A clip that produced
    /// two movements becomes two entries sharing its timestamp.
    static func payload(from entries: [VoiceEntryState]) -> [SetLogEntryPayload] {
        var out: [SetLogEntryPayload] = []
        for entry in entries {
            switch entry.status {
            case .ok, .review:
                for (index, parsed) in entry.parsed.enumerated() {
                    out.append(logEntry(
                        id: index == 0 ? entry.id : "\(entry.id)#\(index + 1)",
                        t: entry.t, at: entry.at, parsed: parsed,
                        transcript: entry.transcript
                    ))
                }
            case .queued, .working:
                // Still on the wrist: a placeholder the late upload resolves.
                out.append(SetLogEntryPayload(
                    id: entry.id, t: entry.t, at: entry.at, source: "voice",
                    status: "queued", name: "Voice entry"
                ))
            case .failed:
                out.append(SetLogEntryPayload(
                    id: entry.id, t: entry.t, at: entry.at, source: "voice",
                    status: "failed", name: "Voice entry",
                    transcript: entry.transcript
                ))
            }
        }
        return out
    }

    /// Tapped sets join the log too — each one with its own time, which the
    /// aggregated movement list throws away.
    static func payload(taps: [LoggedSet], startedAt: Date) -> [SetLogEntryPayload] {
        taps.map { set in
            SetLogEntryPayload(
                id: set.id.uuidString,
                t: max(0, Int(set.at.timeIntervalSince(startedAt))), at: set.at,
                source: "tap", status: "ok", name: set.exercise.name,
                exercise: set.exercise.id, reps: set.reps, sets: 1,
                weightKg: set.weightKg
            )
        }
    }

    static func logEntry(
        id: String, t: Int, at: Date, parsed: ParsedVoiceEntryPayload, transcript: String?
    ) -> SetLogEntryPayload {
        SetLogEntryPayload(
            id: id, t: t, at: at, source: "voice",
            status: parsed.needsReview ? "review" : "ok",
            name: parsed.name, exercise: parsed.exercise, reps: parsed.reps,
            sets: parsed.sets, weightKg: parsed.weightKg, seconds: parsed.seconds,
            perSide: parsed.perSide, load: parsed.load, transcript: transcript,
            confidence: parsed.confidence, reason: parsed.reason
        )
    }

    /// A queued placeholder, replaced by what its audio turned out to say.
    static func resolve(
        _ log: [SetLogEntryPayload], entryId: String, with response: VoiceEntryResponse
    ) -> [SetLogEntryPayload] {
        guard let index = log.firstIndex(where: { $0.id == entryId }) else { return log }
        let placeholder = log[index]
        var replacement: [SetLogEntryPayload]
        if response.entries.isEmpty {
            var failed = placeholder
            failed.status = "failed"
            failed.transcript = response.transcript
            replacement = [failed]
        } else {
            replacement = response.entries.enumerated().map { i, parsed in
                logEntry(
                    id: i == 0 ? entryId : "\(entryId)#\(i + 1)",
                    t: placeholder.t, at: placeholder.at, parsed: parsed,
                    transcript: response.transcript
                )
            }
        }
        var out = log
        out.replaceSubrange(index...index, with: replacement)
        return out
    }

    /// CONSECUTIVE entries of the same movement, dose and load become one
    /// row with sets added ("10 swings" twice → 2 × 10). A repeat later in
    /// the session stays its own row, in time order. Same rule as the
    /// server's composeExercises — change them together.
    static func compose(_ log: [SetLogEntryPayload]) -> [ExerciseEntry] {
        struct Row {
            var key: String
            var name: String
            var exercise: String?
            var sets: Int
            var reps: Int?
            var seconds: Int?
            var weightKg: Double?
            var perSide: Bool
            var load: EntryLoad?
        }
        var rows: [Row] = []
        for entry in log.filter(\.counted).sorted(by: { $0.t < $1.t }) {
            let key = entry.exercise ?? ExerciseCatalog.fold(entry.name)
            let sets = max(entry.sets ?? 1, 1)
            if var last = rows.last,
               last.key == key, last.reps == entry.reps, last.seconds == entry.seconds,
               last.weightKg == entry.weightKg, last.perSide == (entry.perSide ?? false),
               last.load?.kg == entry.load?.kg {
                last.sets += sets
                rows[rows.count - 1] = last
            } else {
                rows.append(Row(
                    key: key, name: entry.name, exercise: entry.exercise, sets: sets,
                    reps: entry.reps, seconds: entry.seconds, weightKg: entry.weightKg,
                    perSide: entry.perSide ?? false, load: entry.load
                ))
            }
        }
        return rows.map {
            ExerciseEntry(
                name: $0.name, sets: $0.sets, reps: $0.reps, weightKg: $0.weightKg,
                seconds: $0.seconds, exercise: $0.exercise, load: $0.load,
                perSide: $0.perSide ? true : nil
            )
        }
    }
}

// MARK: - Clips recorded out of range

struct PendingClip: Codable, Sendable {
    let entryId: String
    let file: String
}

/// A saved workout still owed one or more voice entries. Kept on disk so a
/// clip recorded with no connection survives the app being closed; when the
/// audio finally uploads, the item is re-sent with the entry filled in (the
/// server's upsert makes that an update, and never overwrites a list he has
/// since corrected on the phone).
struct PendingVoiceWorkout: Codable, Sendable {
    var item: WorkoutSyncItem
    /// The tapped-set rows, kept apart so the voice rows can be recomposed.
    var tapEntries: [ExerciseEntry]
    var clips: [PendingClip]
}

enum VoicePendingStore {
    private static var directory: URL? {
        guard let base = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first else { return nil }
        let dir = base.appendingPathComponent("voice-pending", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static var indexURL: URL? { directory?.appendingPathComponent("index.json") }

    static func audioURL(_ file: String) -> URL? {
        directory?.appendingPathComponent(file)
    }

    /// Move a finished clip out of tmp (which the system may purge) and
    /// return its stored name.
    static func stash(_ tempURL: URL) -> String? {
        guard let dir = directory else { return nil }
        let name = tempURL.lastPathComponent
        let target = dir.appendingPathComponent(name)
        do {
            if FileManager.default.fileExists(atPath: target.path) { return name }
            try FileManager.default.moveItem(at: tempURL, to: target)
            return name
        } catch {
            return nil
        }
    }

    static func deleteAudio(_ file: String?) {
        guard let file, let url = audioURL(file) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static func load() -> [PendingVoiceWorkout] {
        guard let url = indexURL, let data = try? Data(contentsOf: url) else { return [] }
        return (try? PitayaJSON.decoder().decode([PendingVoiceWorkout].self, from: data)) ?? []
    }

    static func save(_ pending: [PendingVoiceWorkout]) {
        guard let url = indexURL else { return }
        if pending.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return
        }
        if let data = try? PitayaJSON.encoder().encode(pending) {
            try? data.write(to: url, options: .atomic)
        }
    }

    /// Patch the stored copy of one workout (HRR or a jump count that landed
    /// after Save must ride the late re-send too, or it would be lost).
    static func update(externalId: String, _ change: (inout WorkoutSyncItem) -> Void) {
        var all = load()
        guard let index = all.firstIndex(where: { $0.item.externalId == externalId }) else { return }
        change(&all[index].item)
        save(all)
    }
}
#endif
