// Local personal-record engine. The SERVER is the source of truth
// (per docs/watch-contract.md): baselines come from GET /api/mobile/prs and
// are cached to disk for offline cold-starts; the sync response's `prs`
// array carries server-confirmed celebrations. This engine keeps only what
// the wrist needs instantly and offline — evaluate a set the moment it's
// logged (haptic), estimate session PRs when a finish can't reach the
// server, and absorb finished sessions so back-to-back offline workouts
// compare against today's numbers.
//
// Semantics mirror lib/prs.ts:
//   weight — heaviest load ever used on the canonical exercise
//   volume — best single-entry tonnage (sets × reps × weightKg)

import Foundation

public struct PRBest: Codable, Hashable, Sendable {
    public var weightKg: Double
    public var volume: Double
}

public struct PRBaselines: Sendable {
    public private(set) var best: [String: PRBest] = [:]

    public init() {}

    /// Build from server personal_records rows (GET /api/mobile/prs).
    public init(records: [PersonalRecordRow]) {
        for record in records {
            var current = best[record.exercise] ?? PRBest(weightKg: 0, volume: 0)
            switch record.kind {
            case "weight": current.weightKg = max(current.weightKg, record.value)
            case "volume": current.volume = max(current.volume, record.value)
            default: continue
            }
            best[record.exercise] = current
        }
    }

    public init(cached: [String: PRBest]) {
        best = cached
    }

    // MARK: - Live evaluation

    public struct SetResult: Sendable {
        public let isWeightPR: Bool
        public let previousWeightKg: Double?
    }

    /// Evaluate one just-logged set against the baseline. Weight PRs fire
    /// immediately (the on-wrist haptic moment); volume PRs are session-level
    /// and evaluated at finish.
    public func evaluate(exerciseId: String, weightKg: Double) -> SetResult {
        let prior = best[exerciseId]?.weightKg ?? 0
        return SetResult(
            isWeightPR: weightKg > prior,
            previousWeightKg: prior > 0 ? prior : nil
        )
    }

    public struct SessionPR: Hashable, Sendable {
        public let exerciseId: String
        public let exerciseName: String
        public let kind: String // "weight" | "volume" — matches personal_records.kind
        public let value: Double
        public let previousValue: Double?
    }

    /// Offline estimate of a finished session's PRs, mirroring lib/prs.ts
    /// extraction. Used only when the sync response (server truth) isn't
    /// available; the server result replaces it on the next successful sync.
    public func sessionPRs(entries: [ExerciseEntry]) -> [SessionPR] {
        struct Candidate { var name: String; var weight = 0.0; var volume = 0.0 }
        var perExercise: [String: Candidate] = [:]

        for entry in entries {
            guard
                let def = ExerciseCatalog.normalize(entry.name),
                let weight = entry.weightKg, weight > 0
            else { continue }
            var c = perExercise[def.id] ?? Candidate(name: def.name)
            c.weight = max(c.weight, weight)
            if let sets = entry.sets, let reps = entry.reps, sets > 0, reps > 0 {
                c.volume = max(c.volume, Double(sets * reps) * weight)
            }
            perExercise[def.id] = c
        }

        var out: [SessionPR] = []
        for (id, c) in perExercise {
            let prior = best[id]
            if c.weight > (prior?.weightKg ?? 0) {
                out.append(SessionPR(
                    exerciseId: id, exerciseName: c.name, kind: "weight",
                    value: c.weight,
                    previousValue: prior.map(\.weightKg).flatMap { $0 > 0 ? $0 : nil }
                ))
            }
            if c.volume > 0, c.volume > (prior?.volume ?? 0) {
                out.append(SessionPR(
                    exerciseId: id, exerciseName: c.name, kind: "volume",
                    value: c.volume,
                    previousValue: prior.map(\.volume).flatMap { $0 > 0 ? $0 : nil }
                ))
            }
        }
        return out.sorted { $0.exerciseName < $1.exerciseName }
    }

    /// Fold a finished session's entries into the local baseline so the very
    /// next offline workout compares against today's numbers.
    public mutating func absorb(entries: [ExerciseEntry]) {
        for entry in entries {
            guard
                let def = ExerciseCatalog.normalize(entry.name),
                let weight = entry.weightKg, weight > 0
            else { continue }
            var current = best[def.id] ?? PRBest(weightKg: 0, volume: 0)
            current.weightKg = max(current.weightKg, weight)
            if let sets = entry.sets, let reps = entry.reps, sets > 0, reps > 0 {
                current.volume = max(current.volume, Double(sets * reps) * weight)
            }
            best[def.id] = current
        }
    }
}

// MARK: - Disk cache (offline cold-start)

public actor PRBaselineCache {
    private let fileURL: URL

    public init(filename: String = "pr-baselines.json") throws {
        let supportURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        fileURL = supportURL.appendingPathComponent(filename)
    }

    public func load() -> [String: PRBest]? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode([String: PRBest].self, from: data)
    }

    public func save(_ best: [String: PRBest]) {
        if let data = try? JSONEncoder().encode(best) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    public func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
