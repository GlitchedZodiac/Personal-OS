// Local personal-record engine — the wrist must celebrate a PR the moment a
// set is logged, including fully offline, so baselines are computed on-watch
// from synced history rather than fetched (`/api/health/prs` is cookie-gated
// and unreachable with a bearer token today; a mobile mirror is a filed ask).
//
// Semantics mirror lib/prs.ts exactly:
//   weight — heaviest load ever used on the canonical exercise
//   volume — best single-entry tonnage (sets × reps × weightKg)

import Foundation

public struct PRBest: Hashable, Sendable {
    public var weightKg: Double
    public var volume: Double
}

public struct PRBaselines: Sendable {
    public private(set) var best: [String: PRBest] = [:]

    public init() {}

    /// Build baselines from server workout history. Only entries whose name
    /// maps to a canonical catalog exercise count — same rule as the server.
    public init(history: [MobileWorkoutRow]) {
        for row in history {
            for entry in row.exercises {
                fold(entry)
            }
        }
    }

    private mutating func fold(_ entry: ExerciseEntry) {
        guard
            let def = ExerciseCatalog.normalize(entry.name),
            let weight = entry.weightKg, weight > 0
        else { return }

        var current = best[def.id] ?? PRBest(weightKg: 0, volume: 0)
        current.weightKg = max(current.weightKg, weight)
        if let sets = entry.sets, let reps = entry.reps, sets > 0, reps > 0 {
            current.volume = max(current.volume, Double(sets * reps) * weight)
        }
        best[def.id] = current
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

    /// Compare a finished session's aggregated entries against baselines,
    /// mirroring lib/prs.ts extraction (best weight + best single-entry
    /// volume per exercise across the session).
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
                    value: c.weight, previousValue: prior.map(\.weightKg).flatMap { $0 > 0 ? $0 : nil }
                ))
            }
            if c.volume > 0, c.volume > (prior?.volume ?? 0) {
                out.append(SessionPR(
                    exerciseId: id, exerciseName: c.name, kind: "volume",
                    value: c.volume, previousValue: prior.map(\.volume).flatMap { $0 > 0 ? $0 : nil }
                ))
            }
        }
        return out.sorted { $0.exerciseName < $1.exerciseName }
    }

    /// Fold a finished session's entries into the local baseline so the very
    /// next workout compares against today's numbers even before a re-fetch.
    public mutating func absorb(entries: [ExerciseEntry]) {
        for entry in entries { fold(entry) }
    }
}
