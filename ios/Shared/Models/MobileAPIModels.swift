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
    /// From metricsData — the routine's display name ("EMOM 20 done").
    public let sequenceName: String?
    /// Server-enriched 5-zone seconds (lib/zones.ts ordering) — present once
    /// the sync enrichment ran over the row's HR stream; §03 zones card.
    public let timeInZonesSeconds: [Int]?

    enum CodingKeys: String, CodingKey {
        case id, startedAt, endedAt, durationMinutes, workoutType, description
        case caloriesBurned, distanceMeters, avgHeartRateBpm, maxHeartRateBpm
        case externalSource, externalId, source, exercises, metricsData
    }

    private struct RowMetrics: Decodable {
        let sequenceId: String?
        let sequenceName: String?
        let timeInZones: RowZones?

        struct RowZones: Decodable {
            let seconds: [Int]?
        }
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
        let metrics = (try? c.decodeIfPresent(RowMetrics.self, forKey: .metricsData)) ?? nil
        sequenceId = metrics?.sequenceId
        sequenceName = metrics?.sequenceName
        timeInZonesSeconds = metrics?.timeInZones?.seconds
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
    /// §Trails (2026-08-28, additive): set when the session started from a
    /// saved trail. Optional so queue files written by older builds decode.
    public let trailId: String?

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
        deviceType: String? = "apple_watch",
        trailId: String? = nil
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
        self.trailId = trailId
    }
}

// MARK: - Named trails (§Trails, 2026-08-28)

/// GET /api/mobile/trails row — lib/trails.ts TrailPayload field names are
/// the contract; renames go through deferred-items, never adapted here.
public struct TrailSummary: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let aliases: [String]
    public let distanceMeters: Double?
    public let elevationGainM: Double?
    public let summaryPolyline: String?
    public let startLat: Double?
    public let startLng: Double?
    public let runCount: Int
    public let lastRun: TrailLastRunPayload?
    /// Round 3 §05: present only on near-ranked queries — "94% match".
    public let matchPct: Int?
}

public struct TrailLastRunPayload: Codable, Hashable, Sendable {
    public let workoutId: String
    public let workoutExternalId: String?
    public let startedAt: Date
    public let durationMinutes: Int
    public let distanceMeters: Double?
    public let elevationGainM: Double?
    public let avgHeartRateBpm: Int?
}

public struct TrailListResponse: Codable, Sendable {
    public let trails: [TrailSummary]
    public let updatedAt: Date
}

public struct TrailSaveRequest: Codable, Sendable {
    public let name: String?
    public let trailId: String?
    public let workoutExternalId: String?
    public init(name: String? = nil, trailId: String? = nil, workoutExternalId: String? = nil) {
        self.name = name
        self.trailId = trailId
        self.workoutExternalId = workoutExternalId
    }
}

public struct TrailSaveResponse: Codable, Sendable {
    public struct Ref: Codable, Sendable {
        public let id: String
        public let name: String
    }
    public let trail: Ref
    public let created: Bool
    public let linked: Bool
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
    /// Hero metrics coda (Round 1+2 §02 contract, lib/mobile-summary.ts) —
    /// optional until prod redeploys with the endpoint.
    public let summary: HeroMetricsPayload?
    /// Post-run verdict + previous-run stats for the routine just synced
    /// (§03 deltas + §07 progression); null on freeform runs.
    public let routine: RoutineCodaPayload?
}

// MARK: - Hero metrics + routine coda (Round 1+2 handoff §02/§03/§07)

/// lib/mobile-summary.ts HeroMetrics — field names are the contract
/// (streakDays, weight7dAvgKg, weight7dDeltaKg, z2WeeklyMinutes); renames go
/// through deferred-items, never adapted watch-side.
public struct HeroMetricsPayload: Codable, Hashable, Sendable {
    /// Consecutive local days with any food log (the Today screen streak —
    /// NOT a training streak).
    public let streakDays: Int
    /// Mean of the last 7 days of weight logs; null with no data.
    public let weight7dAvgKg: Double?
    /// vs the 7 days before that window; null until both windows have data.
    public let weight7dDeltaKg: Double?
    /// Zone-2 minutes summed over the current Mon-start week.
    public let z2WeeklyMinutes: Int

    public init(
        streakDays: Int, weight7dAvgKg: Double?, weight7dDeltaKg: Double?,
        z2WeeklyMinutes: Int
    ) {
        self.streakDays = streakDays
        self.weight7dAvgKg = weight7dAvgKg
        self.weight7dDeltaKg = weight7dDeltaKg
        self.z2WeeklyMinutes = z2WeeklyMinutes
    }
}

/// GET /api/mobile/summary — {timeZone, ...HeroMetrics} spread flat.
public struct SummaryResponse: Codable, Hashable, Sendable {
    public let timeZone: String
    public let streakDays: Int
    public let weight7dAvgKg: Double?
    public let weight7dDeltaKg: Double?
    public let z2WeeklyMinutes: Int

    public var metrics: HeroMetricsPayload {
        HeroMetricsPayload(
            streakDays: streakDays, weight7dAvgKg: weight7dAvgKg,
            weight7dDeltaKg: weight7dDeltaKg, z2WeeklyMinutes: z2WeeklyMinutes
        )
    }
}

/// lib/mobile-summary.ts LastRunStats — the run BEFORE the one just synced.
/// Also constructed locally from cached workout rows so the §03 deltas render
/// pre-save; the server's coda replaces it after sync (server wins on drift).
public struct LastRunStats: Codable, Hashable, Sendable {
    public let startedAt: Date
    public let durationMinutes: Int?
    public let volumeKg: Double
    public let caloriesBurned: Double?
    public let avgHeartRateBpm: Int?
    public let roundsCompleted: Int?

    public init(
        startedAt: Date, durationMinutes: Int?, volumeKg: Double,
        caloriesBurned: Double?, avgHeartRateBpm: Int?, roundsCompleted: Int?
    ) {
        self.startedAt = startedAt
        self.durationMinutes = durationMinutes
        self.volumeKg = volumeKg
        self.caloriesBurned = caloriesBurned
        self.avgHeartRateBpm = avgHeartRateBpm
        self.roundsCompleted = roundsCompleted
    }
}

/// lib/mobile-summary.ts RoutineCoda. Verdict only — the server never
/// mutates the routine; "take the raise" stays an explicit user action.
public struct RoutineCodaPayload: Codable, Hashable, Sendable {
    public let sequenceId: String
    public let sequenceName: String?
    /// "raise" | "hold" | "deload"
    public let verdict: String
    public let reason: String?
    public let lastRun: LastRunStats?
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
    /// Work the set to failure rather than to a rep count or a clock.
    /// Added 2026-08-26 — a step now carries exactly one of reps, seconds or
    /// toFailure. Optional so a routine saved before this decodes unchanged.
    public let toFailure: Bool?
    public let weightKg: Double?
    public let restSeconds: Int?

    /// Whether this step stops at failure rather than at a number.
    public var isToFailure: Bool { toFailure == true }

    /// Leading dose for a watch label — "10 ", "MAX ", or "".
    /// "MAX" rather than "to failure": the wrist has no room for three words,
    /// and it is the word he would say mid-set.
    public var dosePrefix: String {
        if isToFailure { return "MAX " }
        if let reps { return "\(reps) " }
        return ""
    }

    public init(
        exercise: String, exerciseName: String, reps: Int?, seconds: Int?,
        toFailure: Bool? = nil, weightKg: Double?, restSeconds: Int?
    ) {
        self.exercise = exercise
        self.exerciseName = exerciseName
        self.reps = reps
        self.seconds = seconds
        self.toFailure = toFailure
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
/// Time-in-zone for one session, in the shape the phone's analytics read.
public struct WorkoutZoneBreakdown: Codable, Hashable, Sendable {
    public let seconds: [Int]
    public let pct: [Double]
    public let totalSeconds: Int

    public init(seconds: [Int], pct: [Double], totalSeconds: Int) {
        self.seconds = seconds
        self.pct = pct
        self.totalSeconds = totalSeconds
    }
}

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
    /// Relative altitude (m) parallel to timeStream — outdoor sessions, and
    /// freestyle whenever the barometer has something to say.
    public let altitudeStream: [Double]?
    /// Freestyle contract: computed ON-WRIST from the server's zone
    /// boundaries (the one place the wrist does zone math — every other
    /// path leaves it to the server per the streams contract, and the raw
    /// streams still ride along so the server can always recompute).
    public let timeInZones: WorkoutZoneBreakdown?
    /// Barometric climb, mirrored into metricsData for the phone's
    /// freestyle analytics (also sent top-level on the sync item).
    public let elevationGainM: Double?
    /// Round 3 §07 (additive): per-km seconds banked live on the wrist —
    /// distinct from the server's GPS-derived routeAnalytics.splits.
    public let splits: [Int]?
    /// Round 3 §07 (additive): the 60 s HR-recovery drop and its window.
    public let hrrDelta: Int?
    public let hrrSeconds: Int?
    /// 2026-08-29 (additive): session-mean step cadence from CMPedometer —
    /// collected live since Round 3, persisted now (Strava parity).
    public let avgCadenceSpm: Int?

    public init(
        sequenceId: String? = nil, sequenceName: String? = nil,
        roundsCompleted: Int? = nil, stepSeconds: [Int]? = nil,
        hrStream: [Int]? = nil, timeStream: [Int]? = nil,
        altitudeStream: [Double]? = nil,
        timeInZones: WorkoutZoneBreakdown? = nil,
        elevationGainM: Double? = nil,
        splits: [Int]? = nil,
        hrrDelta: Int? = nil,
        hrrSeconds: Int? = nil,
        avgCadenceSpm: Int? = nil
    ) {
        self.sequenceId = sequenceId
        self.sequenceName = sequenceName
        self.roundsCompleted = roundsCompleted
        self.stepSeconds = stepSeconds
        self.hrStream = hrStream
        self.timeStream = timeStream
        self.altitudeStream = altitudeStream
        self.timeInZones = timeInZones
        self.elevationGainM = elevationGainM
        self.splits = splits
        self.hrrDelta = hrrDelta
        self.hrrSeconds = hrrSeconds
        self.avgCadenceSpm = avgCadenceSpm
    }

    public var isEmpty: Bool {
        sequenceId == nil && stepSeconds == nil && hrStream == nil
            && timeInZones == nil && splits == nil && hrrDelta == nil
    }

    /// Round 3 §07: the HRR numbers land up to 60 s after the item was
    /// built — clone with the capture attached.
    public func withHRR(delta: Int, seconds: Int) -> WorkoutMetricsData {
        WorkoutMetricsData(
            sequenceId: sequenceId, sequenceName: sequenceName,
            roundsCompleted: roundsCompleted, stepSeconds: stepSeconds,
            hrStream: hrStream, timeStream: timeStream,
            altitudeStream: altitudeStream, timeInZones: timeInZones,
            elevationGainM: elevationGainM, splits: splits,
            hrrDelta: delta, hrrSeconds: seconds,
            avgCadenceSpm: avgCadenceSpm
        )
    }
}

public extension WorkoutSyncItem {
    /// Same item, new metrics — the externalId survives, so a re-enqueue
    /// after sync lands as an idempotent UPDATE on the server.
    func replacingMetrics(_ metricsData: WorkoutMetricsData?) -> WorkoutSyncItem {
        WorkoutSyncItem(
            externalId: externalId, externalSource: externalSource,
            startedAt: startedAt, endedAt: endedAt,
            durationMinutes: durationMinutes, workoutType: workoutType,
            description: description, caloriesBurned: caloriesBurned,
            distanceMeters: distanceMeters, stepCount: stepCount,
            avgHeartRateBpm: avgHeartRateBpm, maxHeartRateBpm: maxHeartRateBpm,
            elevationGainM: elevationGainM, exercises: exercises,
            metricsData: metricsData, routeData: routeData, source: source,
            syncStatus: syncStatus, deviceType: deviceType, trailId: trailId
        )
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

/// One HealthKit body-mass reading. The server dedups against existing
/// weigh-ins by near-twin rule (±10 min, ±0.3 kg) and writes the survivors
/// to body_measurements — so sending every sample is safe and correct.
public struct WeightSamplePayload: Codable, Hashable, Sendable {
    public let measuredAt: Date
    public let weightKg: Double
    /// Composition the scale writes alongside the weigh-in. Widened 2026-08-26
    /// — before that the app never asked HealthKit for ANY of these, so every
    /// body-fat and BMI reading his scale produced was thrown away.
    ///
    /// All optional, and JSONEncoder omits nils, so an older server that only
    /// knows measuredAt+weightKg still receives exactly what it used to.
    ///
    /// NOTE: HealthKit has no sample type for muscle mass, bone mass, body
    /// water, protein, visceral fat, BMR or metabolic age. Those columns exist
    /// in body_measurements but can only ever be filled by the VeSync CSV
    /// import — do not add fields here expecting them to arrive.
    public let bodyFatPct: Double?
    public let bmi: Double?
    public let fatFreeWeightKg: Double?
    public let waistCm: Double?
    public let heartRateBpm: Int?

    public init(
        measuredAt: Date,
        weightKg: Double,
        bodyFatPct: Double? = nil,
        bmi: Double? = nil,
        fatFreeWeightKg: Double? = nil,
        waistCm: Double? = nil,
        heartRateBpm: Int? = nil
    ) {
        self.measuredAt = measuredAt
        self.weightKg = weightKg
        self.bodyFatPct = bodyFatPct
        self.bmi = bmi
        self.fatFreeWeightKg = fatFreeWeightKg
        self.waistCm = waistCm
        self.heartRateBpm = heartRateBpm
    }
}

/// What the server reports back about a weigh-in push. Every field optional so
/// an older server's response still decodes.
///
/// TRAP: PitayaJSON.decoder()'s date strategy THROWS on an unrecognised date,
/// and the daily route spreads the whole snapshot row (createdAt, updatedAt)
/// into its response. Undeclared keys are never decoded, so this is safe — but
/// do not casually add a `Date` field here.
public struct BodySyncCounts: Decodable, Hashable, Sendable {
    public let weightsImported: Int?
    public let weightsMerged: Int?
    public let weightsSkipped: Int?
    public let weightsInvalid: Int?

    public var landed: Int { (weightsImported ?? 0) + (weightsMerged ?? 0) }
}

/// Request/response for the historical backfill endpoint.
public struct BodySamplesRequest: Encodable, Sendable {
    public let samples: [WeightSamplePayload]
    public let source: String

    public init(samples: [WeightSamplePayload], source: String = "apple_health") {
        self.samples = samples
        self.source = source
    }
}

public struct BodySamplesResponse: Decodable, Sendable {
    public let received: Int?
    public let imported: Int?
    public let merged: Int?
    public let skipped: Int?
    public let invalid: Int?

    public var landed: Int { (imported ?? 0) + (merged ?? 0) }
}

public struct DailyHealthSnapshotPayload: Codable, Hashable, Sendable {
    public let localDate: String
    public let timeZone: String
    public let steps: Int
    public let restingHeartRateBpm: Int?
    public let activeEnergyKcal: Double?
    public let walkingRunningDistanceMeters: Double?
    /// Promoted to top level 2026-08-17 — these columns shipped long ago,
    /// and the server only reads the nested copies as a legacy fallback
    /// (which it can now drop).
    public let sleepMinutes: Int?
    public let sleepDeepMinutes: Int?
    public let sleepRemMinutes: Int?
    public let hrvMs: Double?
    /// Body mass never belonged in the snapshot: the server routes these to
    /// body_measurements, and it reads ONLY the top-level key — the old
    /// rawData.weightKg was silently dropped on every sync.
    public let weightSamples: [WeightSamplePayload]?
    public let source: String
    /// Anything without a column of its own. No longer carries the promoted
    /// fields above.
    public let rawData: [String: Double]?

    public init(
        localDate: String,
        timeZone: String,
        steps: Int,
        restingHeartRateBpm: Int? = nil,
        activeEnergyKcal: Double? = nil,
        walkingRunningDistanceMeters: Double? = nil,
        sleepMinutes: Int? = nil,
        sleepDeepMinutes: Int? = nil,
        sleepRemMinutes: Int? = nil,
        hrvMs: Double? = nil,
        weightSamples: [WeightSamplePayload]? = nil,
        source: String = "apple_health",
        rawData: [String: Double]? = nil
    ) {
        self.localDate = localDate
        self.timeZone = timeZone
        self.steps = steps
        self.restingHeartRateBpm = restingHeartRateBpm
        self.activeEnergyKcal = activeEnergyKcal
        self.walkingRunningDistanceMeters = walkingRunningDistanceMeters
        self.sleepMinutes = sleepMinutes
        self.sleepDeepMinutes = sleepDeepMinutes
        self.sleepRemMinutes = sleepRemMinutes
        self.hrvMs = hrvMs
        self.weightSamples = weightSamples
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
