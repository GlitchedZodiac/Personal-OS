// Wire types for /api/mobile/* — shapes verified against live prod responses
// (2026-08-09 session), not the schema comments. Notable realities:
//  - timestamps arrive as ISO8601 WITH fractional seconds ("….863Z"), which
//    Foundation's stock .iso8601 strategy rejects → PitayaJSON coders below.
//  - GET /api/mobile/workouts returns raw workout_logs rows: most fields are
//    null somewhere in real history (externalId is null on manual rows,
//    endedAt on open ones, …) → everything optional except id/workoutType.
//  - `exercises` is heterogeneous: strength rows hold {name, sets, reps,
//    weightKg} entries, Strava rows hold activity metadata objects → each
//    element decodes tolerantly and non-matching elements are dropped.

import Foundation

// MARK: - Auth

public struct DeviceSessionInfo: Codable, Hashable, Sendable {
    public let id: String
    public let deviceLabel: String
    public let platform: String?
    public let deviceType: String?
    public let expiresAt: Date
    public let refreshExpiresAt: Date
}

public struct DeviceSessionResponse: Codable, Hashable, Sendable {
    public let session: DeviceSessionInfo
    public let accessToken: String
    public let refreshToken: String
}

public struct DeviceSessionRequest: Codable, Hashable, Sendable {
    public let pin: String
    public let deviceLabel: String
    public let platform: String
    public let deviceType: String
}

public struct TokenRefreshRequest: Codable, Hashable, Sendable {
    public let refreshToken: String
}

// MARK: - Exercises (the kettlebell set payload)

/// One line of the workout's `exercises` JSON — the exact shape
/// lib/prs.ts extracts PRs from: {name, sets, reps, weightKg}.
public struct ExerciseEntry: Codable, Hashable, Sendable {
    public let name: String
    public let sets: Int?
    public let reps: Int?
    public let weightKg: Double?

    public init(name: String, sets: Int?, reps: Int?, weightKg: Double?) {
        self.name = name
        self.sets = sets
        self.reps = reps
        self.weightKg = weightKg
    }

    enum CodingKeys: String, CodingKey {
        case name, sets, reps, weightKg
    }

    // Web-written values are occasionally strings ("20") — accept both.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        sets = Self.flexibleInt(c, .sets)
        reps = Self.flexibleInt(c, .reps)
        weightKg = Self.flexibleDouble(c, .weightKg)
    }

    private static func flexibleDouble(
        _ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys
    ) -> Double? {
        if let d = try? c.decodeIfPresent(Double.self, forKey: key) { return d }
        if let s = try? c.decodeIfPresent(String.self, forKey: key) { return Double(s) }
        return nil
    }

    private static func flexibleInt(
        _ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys
    ) -> Int? {
        flexibleDouble(c, key).map { Int($0) }
    }
}

/// Decodes an `exercises` array, silently dropping elements that aren't
/// set-shaped (e.g. Strava metadata blobs living in the same column).
struct TolerantExerciseList: Decodable {
    let entries: [ExerciseEntry]

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [ExerciseEntry] = []
        while !c.isAtEnd {
            if let entry = try? c.decode(ExerciseEntry.self), entry.name.isEmpty == false {
                out.append(entry)
            } else {
                _ = try? c.decode(AnyIgnored.self)
            }
        }
        entries = out
    }

    private struct AnyIgnored: Decodable {}
}

// MARK: - Workouts: server rows (GET)

public struct MobileWorkoutRow: Decodable, Hashable, Identifiable, Sendable {
    public let id: String
    public let startedAt: Date
    public let endedAt: Date?
    public let durationMinutes: Int
    public let workoutType: String
    public let description: String?
    public let caloriesBurned: Double?
    public let distanceMeters: Double?
    public let avgHeartRateBpm: Int?
    public let maxHeartRateBpm: Int?
    public let externalSource: String?
    public let externalId: String?
    public let source: String?
    public let exercises: [ExerciseEntry]
    /// From metricsData — links a run to its routine (due rotation, deltas).
    public let sequenceId: String?

    enum CodingKeys: String, CodingKey {
        case id, startedAt, endedAt, durationMinutes, workoutType, description
        case caloriesBurned, distanceMeters, avgHeartRateBpm, maxHeartRateBpm
        case externalSource, externalId, source, exercises, metricsData
    }

    private struct RowMetrics: Decodable {
        let sequenceId: String?
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        startedAt = try c.decode(Date.self, forKey: .startedAt)
        endedAt = try c.decodeIfPresent(Date.self, forKey: .endedAt)
        durationMinutes = try c.decodeIfPresent(Int.self, forKey: .durationMinutes) ?? 0
        workoutType = try c.decodeIfPresent(String.self, forKey: .workoutType) ?? "other"
        description = try c.decodeIfPresent(String.self, forKey: .description)
        caloriesBurned = try c.decodeIfPresent(Double.self, forKey: .caloriesBurned)
        distanceMeters = try c.decodeIfPresent(Double.self, forKey: .distanceMeters)
        avgHeartRateBpm = try c.decodeIfPresent(Int.self, forKey: .avgHeartRateBpm)
        maxHeartRateBpm = try c.decodeIfPresent(Int.self, forKey: .maxHeartRateBpm)
        externalSource = try c.decodeIfPresent(String.self, forKey: .externalSource)
        externalId = try c.decodeIfPresent(String.self, forKey: .externalId)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        exercises = (try? c.decodeIfPresent(TolerantExerciseList.self, forKey: .exercises))??.entries ?? []
        sequenceId = (try? c.decodeIfPresent(RowMetrics.self, forKey: .metricsData))??.sequenceId
    }
}

public struct MobileWorkoutListResponse: Decodable, Sendable {
    public let deviceSessionId: String
    public let entries: [MobileWorkoutRow]
}

// MARK: - Workouts: sync payload (POST)

public struct WorkoutSyncItem: Codable, Hashable, Identifiable, Sendable {
    public var id: String { externalId }
    public let externalId: String
    public let externalSource: String
    public let startedAt: Date
    public let endedAt: Date?
    public let durationMinutes: Int
    public let workoutType: String
    public let description: String?
    public let caloriesBurned: Double?
    public let distanceMeters: Double?
    public let stepCount: Int?
    public let avgHeartRateBpm: Int?
    public let maxHeartRateBpm: Int?
    public let elevationGainM: Double?
    public let exercises: [ExerciseEntry]?
    public let metricsData: WorkoutMetricsData?
    public let routeData: WorkoutRouteData?
    public let source: String
    public let syncStatus: String
    public let deviceType: String?

    public init(
        externalId: String = UUID().uuidString,
        externalSource: String = "app_watch",
        startedAt: Date,
        endedAt: Date?,
        durationMinutes: Int,
        workoutType: String,
        description: String? = nil,
        caloriesBurned: Double? = nil,
        distanceMeters: Double? = nil,
        stepCount: Int? = nil,
        avgHeartRateBpm: Int? = nil,
        maxHeartRateBpm: Int? = nil,
        elevationGainM: Double? = nil,
        exercises: [ExerciseEntry]? = nil,
        metricsData: WorkoutMetricsData? = nil,
        routeData: WorkoutRouteData? = nil,
        source: String = "mobile",
        syncStatus: String = "synced",
        deviceType: String? = "apple_watch"
    ) {
        self.externalId = externalId
        self.externalSource = externalSource
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.durationMinutes = durationMinutes
        self.workoutType = workoutType
        self.description = description
        self.caloriesBurned = caloriesBurned
        self.distanceMeters = distanceMeters
        self.stepCount = stepCount
        self.avgHeartRateBpm = avgHeartRateBpm
        self.maxHeartRateBpm = maxHeartRateBpm
        self.elevationGainM = elevationGainM
        self.exercises = exercises
        self.metricsData = metricsData
        self.routeData = routeData
        self.source = source
        self.syncStatus = syncStatus
        self.deviceType = deviceType
    }
}

public struct WorkoutSyncRequest: Codable, Sendable {
    public let items: [WorkoutSyncItem]
    public init(items: [WorkoutSyncItem]) { self.items = items }
}

/// One new PR as detected server-side (lib/prs.ts NewPR shape).
public struct NewPRPayload: Codable, Hashable, Sendable {
    public let exercise: String
    public let exerciseName: String
    public let kind: String // "weight" | "volume"
    public let value: Double
    public let unit: String
    public let previousValue: Double?
}

/// Per-item PR results in the sync response.
public struct SyncPRResult: Codable, Hashable, Sendable {
    public let externalId: String?
    public let newPRs: [NewPRPayload]
}

public struct WorkoutSyncResponse: Codable, Hashable, Sendable {
    public let created: Int
    public let updated: Int
    public let total: Int
    /// Server-side PR detection per synced item (2026-08-09 contract);
    /// optional so an older server never breaks decode.
    public let prs: [SyncPRResult]?
}

// MARK: - Personal records (GET /api/mobile/prs)

/// A personal_records row — same payload as /api/health/prs.
public struct PersonalRecordRow: Codable, Hashable, Sendable {
    public let exercise: String // canonical id
    public let exerciseName: String
    public let kind: String // "weight" | "volume"
    public let value: Double
    public let unit: String
    public let previousValue: Double?
    public let achievedAt: Date
}

public struct PRListResponse: Codable, Sendable {
    public let records: [PersonalRecordRow]
    public let recent: [PersonalRecordRow]
}

// MARK: - Sequences (GET /api/mobile/sequences — read-only on the wrist)

public struct SequenceStep: Codable, Hashable, Sendable {
    public let exercise: String // canonical id
    public let exerciseName: String
    public let reps: Int?
    public let seconds: Int?
    public let weightKg: Double?
    public let restSeconds: Int?

    public init(
        exercise: String, exerciseName: String, reps: Int?, seconds: Int?,
        weightKg: Double?, restSeconds: Int?
    ) {
        self.exercise = exercise
        self.exerciseName = exerciseName
        self.reps = reps
        self.seconds = seconds
        self.weightKg = weightKg
        self.restSeconds = restSeconds
    }
}

public struct SequenceDef: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let kind: String // "straight" | "emom" | "tabata" | "circuit"
    public let restSecondsDefault: Int?
    public let durationMinutes: Int?
    /// Round count for circuit kind — decodes nil until the main lane ships
    /// the field (filed 2026-08-10); the runner falls back to 3.
    public let rounds: Int?
    public let steps: [SequenceStep]
    public let updatedAt: Date

    public init(
        id: String, name: String, kind: String, restSecondsDefault: Int?,
        durationMinutes: Int?, rounds: Int?, steps: [SequenceStep], updatedAt: Date
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.restSecondsDefault = restSecondsDefault
        self.durationMinutes = durationMinutes
        self.rounds = rounds
        self.steps = steps
        self.updatedAt = updatedAt
    }
}

public struct SequenceListResponse: Codable, Sendable {
    public let sequences: [SequenceDef]
}

/// Extra run metadata carried in workout_logs.metricsData. Raw streams go
/// up unprocessed — the SERVER runs the same downsample/zones/load math as
/// the Strava import (streams contract, 2026-08-11); never pre-compute
/// zones on-wrist.
public struct WorkoutMetricsData: Codable, Hashable, Sendable {
    public let sequenceId: String?
    public let sequenceName: String?
    public let roundsCompleted: Int?
    /// Total working seconds per step index (circuit runs: start→Done deltas
    /// summed across rounds) — Michael's "track how long each move takes".
    public let stepSeconds: [Int]?
    /// Raw HR samples (bpm) at HealthKit's natural cadence (~1/5 s).
    public let hrStream: [Int]?
    /// Elapsed seconds from session start, parallel to hrStream.
    public let timeStream: [Int]?
    /// Relative altitude (m) parallel to timeStream — outdoor sessions only.
    public let altitudeStream: [Double]?

    public init(
        sequenceId: String? = nil, sequenceName: String? = nil,
        roundsCompleted: Int? = nil, stepSeconds: [Int]? = nil,
        hrStream: [Int]? = nil, timeStream: [Int]? = nil,
        altitudeStream: [Double]? = nil
    ) {
        self.sequenceId = sequenceId
        self.sequenceName = sequenceName
        self.roundsCompleted = roundsCompleted
        self.stepSeconds = stepSeconds
        self.hrStream = hrStream
        self.timeStream = timeStream
        self.altitudeStream = altitudeStream
    }

    public var isEmpty: Bool {
        sequenceId == nil && stepSeconds == nil && hrStream == nil
    }
}

// MARK: - Custom exercises (GET /api/mobile/exercises)

public struct CustomExerciseRow: Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let category: String?
    public let aliases: [String]?
}

public struct CustomExerciseListResponse: Codable, Sendable {
    public let exercises: [CustomExerciseRow]
    public let updatedAt: Date?
}

// MARK: - Daily health snapshot

public struct DailyHealthSnapshotPayload: Codable, Hashable, Sendable {
    public let localDate: String
    public let timeZone: String
    public let steps: Int
    public let restingHeartRateBpm: Int?
    public let activeEnergyKcal: Double?
    public let walkingRunningDistanceMeters: Double?
    public let source: String
    /// Extras riding until dedicated columns ship (announced 2026-08-11):
    /// sleepMinutes, hrvMs, weightKg.
    public let rawData: [String: Double]?

    public init(
        localDate: String,
        timeZone: String,
        steps: Int,
        restingHeartRateBpm: Int? = nil,
        activeEnergyKcal: Double? = nil,
        walkingRunningDistanceMeters: Double? = nil,
        source: String = "apple_health",
        rawData: [String: Double]? = nil
    ) {
        self.localDate = localDate
        self.timeZone = timeZone
        self.steps = steps
        self.restingHeartRateBpm = restingHeartRateBpm
        self.activeEnergyKcal = activeEnergyKcal
        self.walkingRunningDistanceMeters = walkingRunningDistanceMeters
        self.source = source
        self.rawData = rawData
    }
}

// MARK: - JSON coders

/// Shared coders handling the backend's ISO8601-with-milliseconds timestamps
/// (decode accepts both fractional and whole-second forms).
public enum PitayaJSON {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let whole: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = fractional.date(from: raw) ?? whole.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Unrecognized date: \(raw)"
            ))
        }
        return d
    }

    public static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(fractional.string(from: date))
        }
        return e
    }
}
