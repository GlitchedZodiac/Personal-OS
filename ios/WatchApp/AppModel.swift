// App-level state machine for the watch app: pairing → home → workout list /
// sequences → live → summary, plus the offline sync queue, the local PR
// engine, the EMOM runner, and the idle-nudge watchdog. Views stay thin;
// every action the UI can take routes through here (the DEBUG smoke harness
// drives these same methods, so self-smoke exercises real paths).

#if os(watchOS)
import Foundation
import HealthKit
import SwiftUI
import WatchKit

// MARK: - Workout kinds

public enum WorkoutKind: String, CaseIterable, Identifiable {
    case kettlebell, walk, run, hike, other

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .kettlebell: return "Kettlebell"
        case .walk: return "Walk"
        case .run: return "Run"
        case .hike: return "Hike"
        case .other: return "Other"
        }
    }

    /// workout_logs.workoutType value — matches what the web app writes
    /// ("strength" for kettlebell sessions, per live data).
    public var workoutTypeString: String {
        switch self {
        case .kettlebell: return "strength"
        case .walk: return "walk"
        case .run: return "run"
        case .hike: return "hike"
        case .other: return "other"
        }
    }

    public var isOutdoor: Bool {
        switch self {
        case .walk, .run, .hike: return true
        case .kettlebell, .other: return false
        }
    }

    public var activityType: HKWorkoutActivityType {
        switch self {
        case .kettlebell: return .functionalStrengthTraining
        case .walk: return .walking
        case .run: return .running
        case .hike: return .hiking
        case .other: return .other
        }
    }
}

// MARK: - Kettlebell session state

public struct LoggedSet: Identifiable, Hashable {
    public let id = UUID()
    public let exercise: ExerciseDef
    public let weightKg: Double
    public let reps: Int
    public let at: Date
    public let isWeightPR: Bool
}

// MARK: - Summary

public struct WorkoutSummary {
    public let kind: WorkoutKind
    public let durationSeconds: TimeInterval
    public let calories: Double?
    public let avgHeartRate: Double?
    public let distanceMeters: Double?
    public let totalVolumeKg: Double
    public let setCount: Int
    public let roundsCompleted: Int?
    public let sequenceName: String?
    public var prs: [PRBaselines.SessionPR]
}

// MARK: - App model

@MainActor
public final class AppModel: ObservableObject {
    public enum Phase: Equatable {
        case loading
        case welcome
        case pinEntry
        case pairedIntro
        case home              // design 04 — tile grid
        case workoutList       // design 05
        case sequences         // design 06
        case sequenceDetail(SequenceDef) // design 07
        case live(WorkoutKind)           // freeform live pages
        case liveSequence(SequenceDef)   // design 09 — EMOM runner
        case summary
    }

    public enum SyncState: Equatable {
        case idle, unsaved, syncing, synced, queued(Int), failed(String)
    }

    @Published public private(set) var phase: Phase = .loading
    @Published public var pairError: String?
    @Published public private(set) var isPairing = false
    @Published public private(set) var historyCount = 0
    @Published public private(set) var prExerciseCount = 0
    @Published public private(set) var lastKettlebell: Date?
    @Published public private(set) var lastRun: (at: Date, km: Double)?
    @Published public private(set) var sequences: [SequenceDef] = []
    @Published public private(set) var syncState: SyncState = .idle
    @Published public private(set) var summary: WorkoutSummary?

    // Kettlebell live state
    @Published public private(set) var loggedSets: [LoggedSet] = []
    @Published public var currentExercise: ExerciseDef = ExerciseCatalog.kettlebell.first
        ?? ExerciseDef(id: "kb-swing", name: "Kettlebell Swing", category: .kettlebell, aliases: [])
    @Published public var weightKg: Double = 16
    @Published public var reps: Int = 10
    @Published public private(set) var prFlash: LoggedSet?

    // EMOM runner state
    @Published public private(set) var emomRound = 0
    @Published public private(set) var emomSecondsLeft = 60

    // Idle nudge — "still training?" after minutes without a signal
    @Published public var idleNudgeActive = false
    private var lastActivityAt = Date()
    private var idleWatchdog: Task<Void, Never>?
    private static let idleThreshold: TimeInterval = 8 * 60

    public let recorder = WorkoutRecorder()

    private let sessionStore: any SessionStore
    private let api: MobileAPIClient
    private let queue: OfflineWorkoutQueue?
    private let prCache: PRBaselineCache?
    /// Smoke runs set this to "watch_smoke" so test rows NEVER share the real
    /// app's externalSource namespace — cleanup can then target watch_smoke
    /// alone (a real 07:28 row was once deleted by an app_watch-wide sweep;
    /// never again).
    var externalSourceOverride: String?
    private var baselines = PRBaselines()
    private var prFlashTask: Task<Void, Never>?
    private var workoutStartedAt = Date()
    private var pendingItem: WorkoutSyncItem?
    private var activeSequence: SequenceDef?
    private var engineTask: Task<Void, Never>?
    private var sequencePausedAccum: TimeInterval = 0
    private var sequencePauseStartedAt: Date?

    public init(
        sessionStore: (any SessionStore)? = nil,
        baseURL: URL = MobileAPIClient.productionBaseURL
    ) {
        let store = sessionStore ?? KeychainSessionStore()
        self.sessionStore = store
        self.api = MobileAPIClient(baseURL: baseURL, sessionStore: store)
        self.queue = try? OfflineWorkoutQueue()
        self.prCache = try? PRBaselineCache()
    }

    // MARK: - Boot & pairing

    public func bootstrap() async {
        if await sessionStore.load() != nil {
            // Cached baselines synchronously, network in the background — the
            // home screen must never wait on two cold Vercel round-trips
            // (that was the 5–10 s "black screen" Michael hit on wrist).
            if let cached = await prCache?.load() {
                baselines = PRBaselines(cached: cached)
                prExerciseCount = baselines.best.count
            }
            phase = .home
            Task { [weak self] in
                await self?.refreshHistory()
                await self?.drainQueue()
            }
        } else {
            phase = .welcome
        }
        await Smoke.runIfRequested(on: self)
    }

    public func beginPairing() {
        pairError = nil
        phase = .pinEntry
    }

    public func pair(pin: String) async {
        guard !isPairing else { return }
        isPairing = true
        pairError = nil
        do {
            let device = WKInterfaceDevice.current()
            try await api.pair(
                pin: pin,
                deviceLabel: "\(device.name) (\(device.model))",
                platform: "watchos",
                deviceType: "apple_watch"
            )
            await refreshHistory()
            WKInterfaceDevice.current().play(.success)
            phase = .pairedIntro
        } catch {
            pairError = friendlyError(error)
            WKInterfaceDevice.current().play(.failure)
        }
        isPairing = false
    }

    public func finishIntro() {
        phase = .home
    }

    public func unpair() async {
        await sessionStore.clear()
        await prCache?.clear()
        historyCount = 0
        baselines = PRBaselines()
        sequences = []
        phase = .welcome
    }

    /// Refresh server-truth PR baselines, sequences, and home-screen facts.
    /// Offline keeps the last known state (cached baselines survive).
    public func refreshHistory() async {
        do {
            let prList = try await api.fetchPRs()
            baselines = PRBaselines(records: prList.records)
            prExerciseCount = Set(prList.records.map(\.exercise)).count
            await prCache?.save(baselines.best)
        } catch MobileAPIClient.ClientError.unauthorized {
            await unpair()
            return
        } catch {
            // Offline is fine — cached baselines stand.
        }

        if let list = try? await api.fetchSequences() {
            sequences = list.sequences
        }

        do {
            let list = try await api.fetchWorkouts(limit: 50)
            historyCount = list.entries.count
            lastKettlebell = list.entries.first {
                $0.workoutType == "strength" && !$0.exercises.isEmpty
            }?.startedAt
            lastRun = list.entries.first {
                ($0.workoutType == "run" || $0.workoutType == "cardio")
                    && ($0.distanceMeters ?? 0) > 0
            }.flatMap { row in
                row.distanceMeters.map { (row.startedAt, $0 / 1000) }
            }
        } catch {
            // Offline — home facts stay stale, nothing breaks.
        }
    }

    // MARK: - Navigation

    public func openWorkoutList() { phase = .workoutList }
    public func openSequences() { phase = .sequences }
    public func openSequence(_ sequence: SequenceDef) { phase = .sequenceDetail(sequence) }
    public func backToHome() { phase = .home }
    public func backToWorkoutList() { phase = .workoutList }
    public func backToSequences() { phase = .sequences }

    // MARK: - Freeform workout flow

    /// `useRecorder: false` is the headless-smoke path (no HealthKit sheet in
    /// a simulator run); every user-facing call leaves it true.
    public func startWorkout(_ kind: WorkoutKind, useRecorder: Bool = true) async {
        resetLiveState()
        phase = .live(kind)
        guard useRecorder else { return }
        do {
            try await recorder.start(activityType: kind.activityType, outdoor: kind.isOutdoor)
        } catch {
            // HealthKit refused (denied auth, restricted) — the session still
            // runs on wall clock so a workout is never lost.
        }
    }

    public func logSet() {
        let result = baselines.evaluate(exerciseId: currentExercise.id, weightKg: weightKg)
        let set = LoggedSet(
            exercise: currentExercise,
            weightKg: weightKg,
            reps: reps,
            at: Date(),
            isWeightPR: result.isWeightPR
        )
        loggedSets.append(set)
        markActivity()

        if result.isWeightPR {
            WKInterfaceDevice.current().play(.success)
            prFlash = set
            prFlashTask?.cancel()
            prFlashTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 2_600_000_000)
                if !Task.isCancelled { self?.prFlash = nil }
            }
        } else {
            WKInterfaceDevice.current().play(.click)
        }
    }

    public func repeatLastSet() {
        guard let last = loggedSets.last else { return }
        currentExercise = last.exercise
        weightKg = last.weightKg
        reps = last.reps
        logSet()
    }

    public func finishWorkout(_ kind: WorkoutKind) async {
        let totals = await recorder.finish()
        let entries = aggregatedEntries()
        prepareSummary(
            kind: kind,
            totals: totals,
            entries: entries,
            volume: loggedSets.reduce(0.0) { $0 + $1.weightKg * Double($1.reps) },
            setCount: loggedSets.count,
            rounds: nil,
            sequence: nil,
            description: sessionDescription(kind: kind)
        )
    }

    // MARK: - Sequence (EMOM) flow

    public func startSequence(_ sequence: SequenceDef, useRecorder: Bool = true) async {
        resetLiveState()
        activeSequence = sequence
        emomRound = 0
        emomSecondsLeft = 60
        sequencePausedAccum = 0
        sequencePauseStartedAt = nil
        phase = .liveSequence(sequence)

        if useRecorder {
            do {
                try await recorder.start(activityType: .functionalStrengthTraining, outdoor: false)
            } catch {}
        }

        engineTask?.cancel()
        engineTask = Task { [weak self] in
            await self?.runEMOMEngine(sequence)
        }
    }

    /// One round per minute; steps cycle across minutes (design 09's model,
    /// matching the web builder's EMOM semantics).
    private func runEMOMEngine(_ sequence: SequenceDef) async {
        let totalRounds = max(sequence.durationMinutes ?? sequence.steps.count, 1)
        let startedAt = Date()

        while !Task.isCancelled {
            guard case .liveSequence = phase else { return }

            if recorder.phase == .paused {
                if sequencePauseStartedAt == nil { sequencePauseStartedAt = Date() }
            } else {
                if let pausedAt = sequencePauseStartedAt {
                    sequencePausedAccum += Date().timeIntervalSince(pausedAt)
                    sequencePauseStartedAt = nil
                }
                let elapsed = Date().timeIntervalSince(startedAt) - sequencePausedAccum
                let minuteIndex = Int(elapsed / 60)

                if minuteIndex >= totalRounds {
                    WKInterfaceDevice.current().play(.success)
                    await finishSequence(roundsCompleted: totalRounds)
                    return
                }

                let round = minuteIndex + 1
                if round != emomRound {
                    if emomRound != 0 { WKInterfaceDevice.current().play(.notification) }
                    emomRound = round
                    markActivity()
                }
                emomSecondsLeft = 60 - (Int(elapsed) % 60)
            }

            try? await Task.sleep(nanoseconds: 250_000_000)
        }
    }

    public func currentStep(of sequence: SequenceDef) -> SequenceStep? {
        guard emomRound > 0, !sequence.steps.isEmpty else { return sequence.steps.first }
        return sequence.steps[(emomRound - 1) % sequence.steps.count]
    }

    public func nextStep(of sequence: SequenceDef) -> SequenceStep? {
        guard !sequence.steps.isEmpty else { return nil }
        return sequence.steps[emomRound % sequence.steps.count]
    }

    /// End from controls mid-sequence: the running round counts — you tapped
    /// End after doing the work, not before.
    public func endSequenceEarly() async {
        await finishSequence(roundsCompleted: max(emomRound, 0))
    }

    private func finishSequence(roundsCompleted: Int) async {
        engineTask?.cancel()
        engineTask = nil
        guard let sequence = activeSequence else { return }

        let totals = await recorder.finish()
        let entries = sequenceEntries(sequence: sequence, rounds: roundsCompleted)
        let volume = entries.reduce(0.0) { acc, entry in
            guard let sets = entry.sets, let reps = entry.reps, let weight = entry.weightKg
            else { return acc }
            return acc + Double(sets * reps) * weight
        }

        prepareSummary(
            kind: .kettlebell,
            totals: totals,
            entries: entries,
            volume: volume,
            setCount: entries.reduce(0) { $0 + ($1.sets ?? 0) },
            rounds: roundsCompleted,
            sequence: sequence,
            description: sequence.name
        )
    }

    /// Rounds R cycling S steps → step i performed R/S (+1 for the first
    /// R%S steps) times.
    private func sequenceEntries(sequence: SequenceDef, rounds: Int) -> [ExerciseEntry] {
        let stepCount = sequence.steps.count
        guard stepCount > 0, rounds > 0 else { return [] }
        return sequence.steps.enumerated().compactMap { index, step in
            let times = rounds / stepCount + (index < rounds % stepCount ? 1 : 0)
            guard times > 0 else { return nil }
            return ExerciseEntry(
                name: step.exerciseName,
                sets: times,
                reps: step.reps,
                weightKg: step.weightKg
            )
        }
    }

    // MARK: - Summary, save, discard

    private func prepareSummary(
        kind: WorkoutKind,
        totals: WorkoutRecorder.Totals?,
        entries: [ExerciseEntry],
        volume: Double,
        setCount: Int,
        rounds: Int?,
        sequence: SequenceDef?,
        description: String?
    ) {
        stopIdleWatchdog()
        let started = totals?.startedAt ?? workoutStartedAt
        let ended = totals?.endedAt ?? Date()
        let duration = totals?.durationSeconds ?? ended.timeIntervalSince(started)

        let prs = baselines.sessionPRs(entries: entries)
        baselines.absorb(entries: entries)

        summary = WorkoutSummary(
            kind: kind,
            durationSeconds: duration,
            calories: totals?.activeCalories,
            avgHeartRate: totals?.avgHeartRate,
            distanceMeters: totals?.distanceMeters,
            totalVolumeKg: volume,
            setCount: setCount,
            roundsCompleted: rounds,
            sequenceName: sequence?.name,
            prs: prs
        )

        pendingItem = WorkoutSyncItem(
            externalSource: externalSourceOverride ?? "app_watch",
            startedAt: started,
            endedAt: ended,
            durationMinutes: max(1, Int((duration / 60).rounded())),
            workoutType: kind.workoutTypeString,
            description: description,
            caloriesBurned: totals?.activeCalories.map { ($0 * 10).rounded() / 10 },
            distanceMeters: totals?.distanceMeters.map { $0.rounded() },
            avgHeartRateBpm: totals?.avgHeartRate.map { Int($0.rounded()) },
            maxHeartRateBpm: totals?.maxHeartRate.map { Int($0.rounded()) },
            exercises: entries.isEmpty ? nil : entries,
            metricsData: sequence.map {
                WorkoutMetricsData(
                    sequenceId: $0.id, sequenceName: $0.name, roundsCompleted: rounds
                )
            },
            deviceType: "apple_watch"
        )

        syncState = .unsaved
        phase = .summary
        if !prs.isEmpty {
            WKInterfaceDevice.current().play(.notification)
        }
    }

    /// Michael's ask: explicit Save (vs the old auto-save) so test sessions
    /// and forgotten-running workouts can be thrown away.
    public func saveWorkout() async {
        guard let item = pendingItem else { return }
        pendingItem = nil
        try? await queue?.enqueue(item)
        await drainQueue(reconcilePRsFor: item.externalId)
    }

    public func discardWorkout() {
        pendingItem = nil
        summary = nil
        loggedSets = []
        activeSequence = nil
        syncState = .idle
        phase = .home
    }

    public func dismissSummary() {
        summary = nil
        loggedSets = []
        activeSequence = nil
        phase = .home
        Task { await refreshHistory() }
    }

    // MARK: - Idle nudge

    private func resetLiveState() {
        loggedSets = []
        summary = nil
        pendingItem = nil
        syncState = .idle
        idleNudgeActive = false
        workoutStartedAt = Date()
        markActivity()
        startIdleWatchdog()
    }

    public func markActivity() {
        lastActivityAt = Date()
    }

    public func keepTraining() {
        markActivity()
        idleNudgeActive = false
    }

    private func startIdleWatchdog() {
        stopIdleWatchdog()
        idleWatchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self else { return }
                switch self.phase {
                case .live, .liveSequence: break
                default: return
                }
                // A working heart counts as activity even without taps.
                if let hr = self.recorder.heartRate, hr >= 95 {
                    self.markActivity()
                }
                if !self.idleNudgeActive,
                   Date().timeIntervalSince(self.lastActivityAt) > Self.idleThreshold {
                    self.idleNudgeActive = true
                    WKInterfaceDevice.current().play(.notification)
                }
            }
        }
    }

    private func stopIdleWatchdog() {
        idleWatchdog?.cancel()
        idleWatchdog = nil
        idleNudgeActive = false
    }

    // MARK: - Sync

    public func drainQueue(reconcilePRsFor externalId: String? = nil) async {
        guard let queue else { return }
        let pending = await queue.load()
        guard !pending.isEmpty else { return }

        syncState = .syncing
        do {
            let response = try await api.syncWorkouts(pending)
            try? await queue.removeSynced(pending)
            syncState = .synced
            reconcileSummaryPRs(from: response, matching: externalId)
        } catch {
            syncState = .queued(pending.count)
        }
    }

    /// The server is the PR source of truth: when the just-saved workout's
    /// sync response includes its PR verdict, it replaces the local estimate
    /// on the summary screen (they agree in the common case; the server wins
    /// on any drift — e.g. a web edit the watch hasn't seen).
    private func reconcileSummaryPRs(from response: WorkoutSyncResponse, matching externalId: String?) {
        guard
            let externalId,
            summary != nil,
            let serverResult = response.prs?.first(where: { $0.externalId == externalId })
        else { return }

        summary?.prs = serverResult.newPRs.map { pr in
            PRBaselines.SessionPR(
                exerciseId: pr.exercise,
                exerciseName: pr.exerciseName,
                kind: pr.kind,
                value: pr.value,
                previousValue: pr.previousValue
            )
        }.sorted { $0.exerciseName < $1.exerciseName }
    }

    // MARK: - Helpers

    /// Collapse per-set logs into the server's exercises shape: one entry per
    /// (exercise, weight, reps) group with sets = count, so lib/prs.ts
    /// volume semantics (sets × reps × weightKg per entry) hold.
    public func aggregatedEntries() -> [ExerciseEntry] {
        struct Key: Hashable { let id: String; let weight: Double; let reps: Int }
        var groups: [Key: (def: ExerciseDef, count: Int, firstAt: Date)] = [:]
        for set in loggedSets {
            let key = Key(id: set.exercise.id, weight: set.weightKg, reps: set.reps)
            if var existing = groups[key] {
                existing.count += 1
                groups[key] = existing
            } else {
                groups[key] = (set.exercise, 1, set.at)
            }
        }
        return groups
            .sorted { $0.value.firstAt < $1.value.firstAt }
            .map { key, value in
                ExerciseEntry(
                    name: value.def.name, sets: value.count, reps: key.reps, weightKg: key.weight
                )
            }
    }

    private func sessionDescription(kind: WorkoutKind) -> String? {
        guard kind == .kettlebell, !loggedSets.isEmpty else { return nil }
        let names = loggedSets.reduce(into: [String]()) { acc, set in
            if !acc.contains(set.exercise.name) { acc.append(set.exercise.name) }
        }
        return "Kettlebell — " + names.joined(separator: ", ")
    }

    private func friendlyError(_ error: Error) -> String {
        if let clientError = error as? MobileAPIClient.ClientError {
            switch clientError {
            case .server(401, _): return "Wrong PIN"
            case .server(_, let message): return message
            case .unauthorized: return "Wrong PIN"
            case .invalidResponse: return "Server hiccup — try again"
            case .missingSession: return "Not paired yet"
            }
        }
        return "No connection — check the network"
    }
}
#endif
