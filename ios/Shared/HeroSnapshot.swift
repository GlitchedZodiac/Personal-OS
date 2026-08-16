// Hero-metrics snapshot for the glance surfaces (§02 watch complication +
// §09 2f iPhone widgets). The extension fetches the bearer API itself — the
// session rides the shared keychain access group (free personal teams allow
// keychain sharing; app groups they don't) — and caches last-good in its own
// container so offline shows "as of Tue", never blank.

import Foundation

/// Everything the glance families render, cacheable as last-good.
public struct ComplicationData: Codable {
    public var streakDays: Int
    public var weight7dAvgKg: Double?
    public var weight7dDeltaKg: Double?
    public var z2WeeklyMinutes: Int
    public var dueName: String?
    public var trainedAt: Date?
    public var trainedName: String?
    public var weekSessionDays: Int
    public var weekTonnageKg: Double
    public var weekPRCount: Int
    public var fetchedAt: Date

    /// The mock's exact numbers — placeholder/snapshot render the design.
    public static let sample = ComplicationData(
        streakDays: 23, weight7dAvgKg: 84.1, weight7dDeltaKg: -0.4,
        z2WeeklyMinutes: 142, dueName: "KB Block A", trainedAt: nil,
        trainedName: nil, weekSessionDays: 4, weekTonnageKg: 12480,
        weekPRCount: 1, fetchedAt: Date()
    )

    public static let empty = ComplicationData(
        streakDays: 0, weight7dAvgKg: nil, weight7dDeltaKg: nil,
        z2WeeklyMinutes: 0, dueName: nil, trainedAt: nil, trainedName: nil,
        weekSessionDays: 0, weekTonnageKg: 0, weekPRCount: 0,
        fetchedAt: .distantPast
    )

    /// Trained-today only counts if trainedAt is actually today — a cached
    /// yesterday-receipt must fall back to the due state.
    public var trainedToday: Date? {
        guard let trainedAt, Calendar.current.isDateInToday(trainedAt) else { return nil }
        return trainedAt
    }

    public var isStale: Bool {
        !Calendar.current.isDateInToday(fetchedAt)
    }

    /// "as of Tue" — the offline marker (spec: last-good, never blank).
    public var asOfLine: String? {
        guard isStale, fetchedAt > .distantPast else { return nil }
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return "as of \(f.string(from: fetchedAt))"
    }
}

// MARK: - Extension-container cache

public enum ComplicationStore {
    private static var fileURL: URL? {
        guard let dir = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        ).first else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("complication.json")
    }

    public static func load() -> ComplicationData? {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? PitayaJSON.decoder().decode(ComplicationData.self, from: data)
    }

    public static func save(_ data: ComplicationData) {
        guard let url = fileURL, let encoded = try? PitayaJSON.encoder().encode(data) else { return }
        try? encoded.write(to: url, options: .atomic)
    }
}

// MARK: - Fetch

public enum ComplicationFetcher {
    /// Overlay-refresh: each endpoint that answers updates its slice; the
    /// rest keeps the previous value. /api/mobile/summary 404s until the
    /// main lane deploys — hero metrics stay cached until then while the
    /// week/due slice refreshes from the endpoints that exist.
    /// `service`: the keychain service holding the bearer session — the
    /// watch app's by default; the iPhone companion's for its widgets.
    public static func refresh(
        previous: ComplicationData?,
        service: String = "net.blacksheepglobal.pitaya.session"
    ) async -> ComplicationData? {
        let store = KeychainSessionStore(
            service: service, accessGroup: PitayaKeychain.sharedGroup
        )
        guard await store.load() != nil else { return nil } // not paired
        let api = MobileAPIClient(sessionStore: store)

        var data = previous ?? .empty
        var freshened = false

        if let summary = try? await api.fetchSummary() {
            data.streakDays = summary.streakDays
            data.weight7dAvgKg = summary.weight7dAvgKg
            data.weight7dDeltaKg = summary.weight7dDeltaKg
            data.z2WeeklyMinutes = summary.z2WeeklyMinutes
            freshened = true
        }

        async let workoutsCall = try? api.fetchWorkouts(limit: 50)
        async let sequencesCall = try? api.fetchSequences()
        async let prsCall = try? api.fetchPRs()
        let (workouts, sequences, prs) = await (workoutsCall, sequencesCall, prsCall)

        if let rows = workouts?.entries {
            var calendar = Calendar.current
            calendar.firstWeekday = 2 // Mon-start weeks, same as the app
            let now = Date()
            var weekDays = Set<Int>()
            var weekTonnage = 0.0
            var todayRow: MobileWorkoutRow?
            var lastRunBySequence: [String: Date] = [:]

            for row in rows {
                if calendar.isDate(row.startedAt, equalTo: now, toGranularity: .weekOfYear) {
                    weekDays.insert(calendar.component(.weekday, from: row.startedAt))
                    weekTonnage += row.exercises.reduce(0) {
                        $0 + Double($1.sets ?? 0) * Double($1.reps ?? 0) * ($1.weightKg ?? 0)
                    }
                }
                if calendar.isDateInToday(row.startedAt) {
                    if let existing = todayRow {
                        if row.startedAt < existing.startedAt { todayRow = row }
                    } else {
                        todayRow = row
                    }
                }
                if let sequenceId = row.sequenceId {
                    let prior = lastRunBySequence[sequenceId] ?? .distantPast
                    lastRunBySequence[sequenceId] = max(prior, row.startedAt)
                }
            }

            data.weekSessionDays = weekDays.count
            data.weekTonnageKg = weekTonnage
            data.trainedAt = todayRow?.startedAt
            data.trainedName = todayRow.flatMap {
                $0.sequenceName ?? $0.description
            } ?? todayRow.map { $0.workoutType.capitalized }

            // Due = rotation, the least-recently-run routine (1d note:
            // "no new schedule API").
            if let list = sequences?.sequences, !list.isEmpty {
                data.dueName = list.min { a, b in
                    (lastRunBySequence[a.id] ?? .distantPast)
                        < (lastRunBySequence[b.id] ?? .distantPast)
                }?.name
            }
            freshened = true
        }

        if let recent = prs?.recent {
            var calendar = Calendar.current
            calendar.firstWeekday = 2
            data.weekPRCount = recent.filter {
                calendar.isDate($0.achievedAt, equalTo: Date(), toGranularity: .weekOfYear)
            }.count
        }

        guard freshened else { return nil }
        data.fetchedAt = Date()
        return data
    }
}
