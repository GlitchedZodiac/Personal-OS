// Live workout capture on the wrist: HKWorkoutSession + HKLiveWorkoutBuilder,
// publishing elapsed / heart rate / active calories for the live screens.
// Rewritten from the blind scaffold: statistics now actually stream (the old
// delegate ignored collected data), pause/resume exists, and finish() reads
// totals from the builder rather than trusting its own wall clock.

#if os(watchOS)
import CoreMotion
import Foundation
import HealthKit

@MainActor
public final class WorkoutRecorder: NSObject, ObservableObject {
    public enum Phase: Equatable {
        case idle, requestingAuth, running, paused, ending
    }

    @Published public private(set) var phase: Phase = .idle
    @Published public private(set) var elapsed: TimeInterval = 0
    @Published public private(set) var heartRate: Double?
    @Published public private(set) var avgHeartRate: Double?
    @Published public private(set) var maxHeartRate: Double?
    @Published public private(set) var activeCalories: Double?
    @Published public private(set) var distanceMeters: Double?
    /// Live barometric climb for the trail page (finalized into Totals).
    @Published public private(set) var elevationGainLive: Double = 0

    // Raw streams for the server's zone/load enrichment (streams contract
    // 2026-08-11): appended at HealthKit's natural HR cadence, cleared on
    // the next start so AppModel can read them after finish().
    public private(set) var hrStream: [Int] = []
    public private(set) var timeStream: [Int] = []
    public private(set) var altitudeStream: [Double] = []

    /// GPS route recording — live for outdoor kinds only.
    public let route = RouteTracker()

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startedAt: Date?
    private var ticker: Timer?
    private var altimeter: CMAltimeter?
    private var latestAltitude: Double?
    private var collectAltitude = false
    private var lastGainAltitude: Double?
    /// Cumulative positive barometric climb (m) — the TRAILS card's "+186 m".
    private var elevationGain: Double = 0
    /// §06 segments/markers, batched into the workout at close.
    private var pendingEvents: [HKWorkoutEvent] = []
    /// Health-detail title (§06 mock: "EMOM 20 — Swings + Press").
    public var sessionTitle: String?
    /// §03 recovery window: stats/streams freeze while HR keeps flowing.
    private var frozen = false
    private var frozenEnd: Date?

    public struct Totals: Sendable {
        public let startedAt: Date
        public let endedAt: Date
        public let durationSeconds: TimeInterval
        public let activeCalories: Double?
        public let avgHeartRate: Double?
        public let maxHeartRate: Double?
        public let distanceMeters: Double?
        public let stepCount: Int?
        public let elevationGainMeters: Double?
        public let routeData: WorkoutRouteData?
    }

    // MARK: - Authorization

    public func requestAuthorization() async throws {
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKSeriesType.workoutRoute()]
        let read: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.stepCount),
        ]
        try await store.requestAuthorization(toShare: share, read: read)
    }

    // MARK: - Lifecycle

    public func start(activityType: HKWorkoutActivityType, outdoor: Bool) async throws {
        guard phase == .idle else { return }
        phase = .requestingAuth
        do {
            try await requestAuthorization()
        } catch {
            phase = .idle
            throw error
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activityType
        configuration.locationType = outdoor ? .outdoor : .indoor

        let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: store, workoutConfiguration: configuration
        )
        session.delegate = self
        builder.delegate = self

        self.session = session
        self.builder = builder

        hrStream = []
        timeStream = []
        altitudeStream = []
        latestAltitude = nil
        lastGainAltitude = nil
        elevationGain = 0
        elevationGainLive = 0
        collectAltitude = outdoor && CMAltimeter.isRelativeAltitudeAvailable()
        if collectAltitude {
            let altimeter = CMAltimeter()
            altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, _ in
                guard let self, let data else { return }
                let altitude = data.relativeAltitude.doubleValue
                self.latestAltitude = altitude
                // Positive deltas only, with a noise floor — barometric gain
                // is what fitness apps report as "elevation".
                if let last = self.lastGainAltitude {
                    let delta = altitude - last
                    if delta > 0.5 {
                        self.elevationGain += delta
                        self.lastGainAltitude = altitude
                        self.elevationGainLive = self.elevationGain
                    } else if delta < -0.5 {
                        self.lastGainAltitude = altitude
                    }
                } else {
                    self.lastGainAltitude = altitude
                }
            }
            self.altimeter = altimeter
        }

        let start = Date()
        startedAt = start
        session.startActivity(with: start)
        try await builder.beginCollection(at: start)

        if outdoor {
            route.start(store: store, at: start)
        }

        phase = .running
        startTicker()
    }

    // MARK: - §06 session tape (segments + markers in Apple Health)

    /// "Round 1 · swings 0:00–0:42" — one HKWorkoutEvent per work interval.
    public func addSegment(name: String, from start: Date, to end: Date) {
        guard builder != nil, end > start else { return }
        pendingEvents.append(HKWorkoutEvent(
            type: .segment,
            dateInterval: DateInterval(start: start, end: end),
            metadata: [HKMetadataKeyWorkoutBrandName: name]
        ))
    }

    /// "Round 14 · swings ◆ PR" — instant marker at the PR set.
    public func addMarker(name: String, at date: Date) {
        guard builder != nil else { return }
        pendingEvents.append(HKWorkoutEvent(
            type: .marker,
            dateInterval: DateInterval(start: date, duration: 0),
            metadata: [HKMetadataKeyWorkoutBrandName: name]
        ))
    }

    /// Flush events + title into the builder just before the workout closes.
    private func flushEventsAndTitle(_ builder: HKLiveWorkoutBuilder) async {
        if !pendingEvents.isEmpty {
            try? await builder.addWorkoutEvents(pendingEvents)
        }
        if let sessionTitle {
            try? await builder.addMetadata([HKMetadataKeyWorkoutBrandName: sessionTitle])
        }
        pendingEvents = []
        sessionTitle = nil
    }

    public func pause() {
        guard phase == .running else { return }
        session?.pause()
        phase = .paused
    }

    public func resume() {
        guard phase == .paused else { return }
        session?.resume()
        phase = .running
    }

    public func finish() async -> Totals? {
        guard let session, let builder, let startedAt else { return nil }
        phase = .ending
        stopTicker()
        altimeter?.stopRelativeAltitudeUpdates()
        altimeter = nil
        // Sensors quiet BEFORE the workout closes: a live route insert racing
        // finishWorkout() deadlocked the save (caught in sim, 2026-08-11).
        route.stop()

        session.end()
        let end = frozenEnd ?? Date()

        var workout: HKWorkout?
        do {
            await flushEventsAndTitle(builder)
            try await builder.endCollection(at: end)
            workout = try await builder.finishWorkout()
        } catch {
            // Simulator/denied-auth runs still produce a usable wall-clock
            // totals object; the workout just isn't persisted to Health.
        }

        let routeData = await route.finish(for: workout)
        // HealthKit's distance is authoritative when it has one; GPS covers
        // the gap when it doesn't (and never overrides a real HK reading).
        let gpsDistance = route.distanceMeters
        let bestDistance = (distanceMeters ?? 0) > 0
            ? distanceMeters
            : (gpsDistance > 0 ? gpsDistance : nil)

        let totals = Totals(
            startedAt: startedAt,
            endedAt: workout?.endDate ?? end,
            durationSeconds: workout?.duration ?? end.timeIntervalSince(startedAt),
            activeCalories: activeCalories,
            avgHeartRate: avgHeartRate,
            maxHeartRate: maxHeartRate,
            distanceMeters: bestDistance,
            stepCount: await queryStepCount(from: startedAt, to: end),
            elevationGainMeters: elevationGain > 1 ? (elevationGain * 10).rounded() / 10 : nil,
            routeData: routeData
        )

        self.session = nil
        self.builder = nil
        self.startedAt = nil
        frozen = false
        frozenEnd = nil
        elapsed = totals.durationSeconds
        phase = .idle
        return totals
    }

    // MARK: - §03 recovery capture (60 s HR descent after the last Done)

    public struct RecoveryCapture: Sendable {
        public let fromBpm: Int
        public let toBpm: Int
        /// Six points, 12 s apart (0 → 60 s) — the summary card's sparkline.
        public let samples: [Int]

        public var drop: Int { fromBpm - toBpm }
        /// Spec bands: quick ≥25 · typical 15–25 · slow <15.
        public var band: String {
            drop >= 25 ? "quick" : (drop >= 15 ? "typical" : "slow")
        }
    }

    /// The workout's numbers END here (duration/kcal/streams freeze at this
    /// instant); HR keeps flowing so completeRecovery() can watch the
    /// descent. Returns snapshot totals so the summary renders immediately.
    /// Indoor sessions only (route/altimeter never ran).
    public func beginRecoveryWindow() async -> Totals? {
        guard let builder, startedAt != nil, phase == .running || phase == .paused
        else { return nil }
        let end = Date()
        frozen = true
        frozenEnd = end
        stopTicker()

        return Totals(
            startedAt: startedAt ?? end,
            endedAt: end,
            durationSeconds: builder.elapsedTime,
            activeCalories: activeCalories,
            avgHeartRate: avgHeartRate,
            maxHeartRate: maxHeartRate,
            distanceMeters: distanceMeters,
            stepCount: await queryStepCount(from: startedAt ?? end, to: end),
            elevationGainMeters: nil,
            routeData: nil
        )
    }

    /// A new session (or a discarded summary) mustn't inherit a live
    /// recovery window — close HealthKit immediately at the frozen end.
    public func abortRecoveryIfNeeded() async {
        guard frozen else { return }
        _ = await finish()
    }

    /// Sample the descent (6 × 12 s), then close HealthKit at the frozen end
    /// date so the recovery minute never inflates the workout.
    public func completeRecovery() async -> RecoveryCapture? {
        guard frozen else { return nil }
        var samples: [Int] = []
        if heartRate != nil {
            for i in 0..<6 {
                if let hr = heartRate { samples.append(Int(hr)) }
                if i < 5 { try? await Task.sleep(nanoseconds: 12_000_000_000) }
            }
        }
        _ = await finish() // closes at frozenEnd; events/title flush inside

        guard let first = samples.first, let last = samples.last, samples.count >= 2
        else { return nil }
        return RecoveryCapture(fromBpm: first, toBpm: last, samples: samples)
    }

    /// Session step total — queried at finish (live-builder statistics don't
    /// reliably carry stepCount across activity types).
    private func queryStepCount(from start: Date, to end: Date) async -> Int? {
        await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: HKQuantityType(.stepCount),
                quantitySamplePredicate: HKQuery.predicateForSamples(
                    withStart: start, end: end
                ),
                options: .cumulativeSum
            ) { _, result, _ in
                let steps = result?.sumQuantity()?.doubleValue(for: .count())
                continuation.resume(returning: steps.map { Int($0) })
            }
            store.execute(query)
        }
    }

    // MARK: - Ticker

    private func startTicker() {
        stopTicker()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let builder = self.builder else { return }
                self.elapsed = builder.elapsedTime
            }
        }
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    private func ingest(_ types: Set<HKSampleType>) {
        guard let builder else { return }

        let hrType = HKQuantityType(.heartRate)
        if types.contains(hrType), let stats = builder.statistics(for: hrType) {
            let bpm = HKUnit.count().unitDivided(by: .minute())
            heartRate = stats.mostRecentQuantity()?.doubleValue(for: bpm)
            // Recovery window (§03): the live bpm keeps updating for the
            // descent sample, but the workout's own numbers are frozen.
            guard !frozen else { return }
            avgHeartRate = stats.averageQuantity()?.doubleValue(for: bpm)
            maxHeartRate = stats.maximumQuantity()?.doubleValue(for: bpm)

            // Append to the raw streams at HK's own cadence (one point per
            // distinct elapsed second, whenever a new HR sample arrives).
            if let hr = heartRate {
                let t = Int(builder.elapsedTime)
                if timeStream.last != t {
                    timeStream.append(t)
                    hrStream.append(Int(hr))
                    if collectAltitude {
                        altitudeStream.append(latestAltitude ?? altitudeStream.last ?? 0)
                    }
                }
            }
        }

        guard !frozen else { return }

        let kcalType = HKQuantityType(.activeEnergyBurned)
        if types.contains(kcalType), let stats = builder.statistics(for: kcalType) {
            activeCalories = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
        }

        let distType = HKQuantityType(.distanceWalkingRunning)
        if types.contains(distType), let stats = builder.statistics(for: distType) {
            distanceMeters = stats.sumQuantity()?.doubleValue(for: .meter())
        }
    }
}

extension WorkoutRecorder: HKWorkoutSessionDelegate {
    public nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            switch toState {
            case .running: if self.phase != .ending { self.phase = .running }
            case .paused: self.phase = .paused
            default: break
            }
        }
    }

    public nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession, didFailWithError error: Error
    ) {
        Task { @MainActor in
            self.phase = .idle
        }
    }
}

extension WorkoutRecorder: HKLiveWorkoutBuilderDelegate {
    public nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        Task { @MainActor in
            self.ingest(collectedTypes)
        }
    }

    public nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
#endif
