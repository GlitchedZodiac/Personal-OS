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
    /// §09 zone-2 accumulator (display-only heuristic zones — the stored
    /// weekly number stays server-computed from the raw streams).
    @Published public private(set) var z2Seconds: Int = 0
    @Published public private(set) var z2AvgBpm: Int?
    private var z2BpmSum = 0
    /// Live session steps (Round 3 §01) — CMPedometer callback, because the
    /// live builder's statistics don't carry stepCount (HK stays finish-only).
    @Published public private(set) var stepCountLive: Int?
    /// Live cadence, steps/min (Round 3 §01) — CMPedometer currentCadence.
    @Published public private(set) var cadenceSpm: Int?
    /// Session cadence accumulation (2026-08-29, Strava-replacement round):
    /// the live number was never persisted — the mean now rides the sync.
    private var cadenceSum = 0
    private var cadenceCount = 0
    public var avgCadenceSpm: Int? {
        cadenceCount > 0 ? cadenceSum / cadenceCount : nil
    }
    /// Trailing-5-min burn rate, kcal/h, floor 0 (Round 3 §01).
    @Published public private(set) var kcalPerHour: Int?
    /// Instantaneous served zone for chips (Round 3 §00) — classified per HR
    /// sample against the injected boundaries; nil until zones + HR exist.
    @Published public private(set) var currentZone: Int?
    /// §03 zone-change publisher output: a CONFIRMED crossing (5 consecutive
    /// samples, 20 s cooldown, Z5 entry exempt, never paused, never in the
    /// first 60 s). The haptic fires here; the bloom rides the publish.
    @Published public private(set) var zoneEvent: ZoneEvent?
    /// §07 km split — banner + haptic ride the publish; seconds accumulate
    /// into `splitSeconds` for metricsData.splits.
    @Published public private(set) var splitEvent: SplitEvent?
    public private(set) var splitSeconds: [Int] = []
    /// §07 elevation crest — bumps at every +100 m of barometric gain
    /// (hikes only); value = how many hundreds are banked.
    @Published public private(set) var crestEvent: Int?
    /// Bumped when the raw streams append — views draw the HR graph off the
    /// arrays keyed by this, without publishing the arrays themselves.
    @Published public private(set) var streamRevision = 0
    /// Served zone boundaries — injected by AppModel before start so the
    /// publisher and chips never invent numbers (nil = zone surfaces quiet).
    public var hrZones: HeartRateZones?

    public struct ZoneEvent: Equatable, Sendable {
        public let id: UUID
        public let from: Int
        public let to: Int
        public var up: Bool { to > from }
    }

    public struct SplitEvent: Equatable, Sendable {
        public let id: UUID
        public let km: Int
        public let seconds: Int
        /// vs the mean of the PRIOR splits; nil on the first km.
        public let deltaVsAverage: Int?
    }

    /// §02 "/ KM · NOW" — pace over the trailing 60 s, seconds per km.
    @Published public private(set) var paceNowSecPerKm: Int?

    private var pedometer: CMPedometer?
    private var kcalTrail: [(t: TimeInterval, kcal: Double)] = []
    private var distTrail: [(t: TimeInterval, meters: Double)] = []
    private var confirmedZone: Int?
    private var zoneCandidate: Int?
    private var zoneCandidateRun = 0
    private var lastZoneEventAt: Date?
    private var lastSplitElapsed: TimeInterval = 0
    private var splitKmBanked = 0
    private var crestBanked = 0
    private var activityKind: HKWorkoutActivityType = .other

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
    /// Cumulative positive barometric climb (m) — the TRAILS card's "+186 m"
    /// and freestyle's metricsData.elevationGainM.
    private(set) var elevationGain: Double = 0
    /// §06 segments/markers, batched into the workout at close.
    private var pendingEvents: [HKWorkoutEvent] = []
    /// Health-detail title (§06 mock: "EMOM 20 — Swings + Press").
    public var sessionTitle: String?
    /// §03 recovery window: stats/streams freeze while HR keeps flowing.
    private var frozen = false
    private var frozenEnd: Date?
    /// True only while THIS session records GPS — the gate that keeps the
    /// long-lived tracker's leftovers out of indoor sessions' saves.
    private var routeActive = false

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

    /// `captureAltitude` defaults to outdoor, but freestyle asks for the
    /// barometer indoors too — a follow-along in a stairwell or on a hill
    /// still earns its elevation.
    public func start(
        activityType: HKWorkoutActivityType, outdoor: Bool, captureAltitude: Bool? = nil
    ) async throws {
        guard phase == .idle else { return }
        phase = .requestingAuth
        #if DEBUG
        print("PITAYA-SMOKE: recorder.start requesting HK auth…")
        #endif
        do {
            try await requestAuthorization()
        } catch {
            phase = .idle
            throw error
        }
        #if DEBUG
        print("PITAYA-SMOKE: recorder.start auth ok")
        #endif

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
        z2Seconds = 0
        z2BpmSum = 0
        z2AvgBpm = nil
        stepCountLive = nil
        cadenceSpm = nil
        cadenceSum = 0
        cadenceCount = 0
        kcalPerHour = nil
        kcalTrail = []
        currentZone = nil
        zoneEvent = nil
        confirmedZone = nil
        zoneCandidate = nil
        zoneCandidateRun = 0
        lastZoneEventAt = nil
        splitEvent = nil
        splitSeconds = []
        lastSplitElapsed = 0
        splitKmBanked = 0
        crestEvent = nil
        crestBanked = 0
        paceNowSecPerKm = nil
        distTrail = []
        streamRevision = 0
        activityKind = activityType
        latestAltitude = nil
        lastGainAltitude = nil
        elevationGain = 0
        elevationGainLive = 0
        collectAltitude = (captureAltitude ?? outdoor) && CMAltimeter.isRelativeAltitudeAvailable()
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
                        // §07 crest: every +100 m banked, hikes only.
                        if self.activityKind == .hiking {
                            let hundreds = Int(self.elevationGain / 100)
                            if hundreds > self.crestBanked {
                                self.crestBanked = hundreds
                                Haptics.key(.click)
                                self.crestEvent = hundreds
                            }
                        }
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
        #if DEBUG
        print("PITAYA-SMOKE: recorder.start beginCollection…")
        #endif
        try await builder.beginCollection(at: start)
        #if DEBUG
        print("PITAYA-SMOKE: recorder.start collection live")
        #endif

        if outdoor {
            route.start(store: store, at: start)
            routeActive = true
        }

        // Round 3 §01: live steps + cadence come from CMPedometer — only for
        // step-shaped work (walk/run/hike/treadmill); a kettlebell session
        // shows effort numbers instead.
        let stepKinds: Set<HKWorkoutActivityType> = [.walking, .running, .hiking]
        if stepKinds.contains(activityType), CMPedometer.isStepCountingAvailable() {
            let pedometer = CMPedometer()
            pedometer.startUpdates(from: start) { [weak self] data, _ in
                guard let data else { return }
                let steps = data.numberOfSteps.intValue
                let cadence = data.currentCadence.map { Int($0.doubleValue * 60) }
                Task { @MainActor [weak self] in
                    guard let self, !self.frozen else { return }
                    self.stepCountLive = steps
                    self.cadenceSpm = cadence
                    if let cadence, cadence > 0 {
                        self.cadenceSum += cadence
                        self.cadenceCount += 1
                    }
                }
            }
            self.pedometer = pedometer
        }

        phase = .running
        startTicker()
    }

    #if DEBUG
    /// Smoke-only: stand in for the heart sensor the simulator doesn't have,
    /// so the freestyle zone math and downsampling can be proven against
    /// prod. Never compiled into a release build.
    public func injectSyntheticStreams(hr: [Int], time: [Int]) {
        guard hrStream.isEmpty else { return }
        hrStream = hr
        timeStream = time
    }
    #endif

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
        pedometer?.stopUpdates()
        pedometer = nil
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

        // Route data belongs ONLY to sessions that started GPS. The tracker
        // is long-lived and its buffer survives until the next OUTDOOR start,
        // so finishing it unconditionally attached the previous walk's trail
        // — and its GPS distance, via the fallback below — to stationary
        // sessions (prod 08-19/20/26: freestyle rows carrying the prior
        // walk's exact polyline).
        // HealthKit's distance is authoritative when it has one; GPS covers
        // the gap when it doesn't (and never overrides a real HK reading).
        // Ownership check: the HK awaits above can stall long enough for a
        // deadlined completeRecovery() to reset and a NEW session to start —
        // this late continuation must not drain the new session's tracker.
        let ownsRoute = routeActive && self.session === session
        let gpsDistance = ownsRoute ? route.distanceMeters : 0
        let routeData = ownsRoute ? await route.finish(for: workout) : nil
        if ownsRoute { routeActive = false }
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

        // Only reset if this call still owns the live session — a deadlined
        // completeRecovery() may have already reset (and a NEW session may be
        // running); a late finish must never clobber that state.
        if self.session === session {
            self.session = nil
            self.builder = nil
            self.startedAt = nil
            frozen = false
            frozenEnd = nil
            elapsed = totals.durationSeconds
            phase = .idle
        }
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

    /// The HRR screen's clock: when the frozen window ends (freeze + 60 s),
    /// nil once the capture has closed.
    public var recoveryEndsAt: Date? {
        guard frozen, let frozenEnd else { return nil }
        return frozenEnd.addingTimeInterval(60)
    }

    public var isInRecovery: Bool { frozen }

    /// The workout's numbers END here (duration/kcal/streams freeze at this
    /// instant); HR keeps flowing so completeRecovery() can watch the
    /// descent. Returns snapshot totals so the summary renders immediately.
    /// Round 3 §07 opened the window to every kind with HR: the sensors
    /// close at the freeze so the recovery minute never adds track, climb or
    /// steps, and the ROUTE rides this snapshot (the sync item is built from
    /// it). The Apple Health route attachment is skipped on this path —
    /// Pitaya's own payload is the product (RouteTracker's own rule).
    public func beginRecoveryWindow() async -> Totals? {
        guard let builder, startedAt != nil, phase == .running || phase == .paused
        else { return nil }
        let end = Date()
        frozen = true
        frozenEnd = end
        stopTicker()
        pedometer?.stopUpdates()
        pedometer = nil
        altimeter?.stopRelativeAltitudeUpdates()
        altimeter = nil
        route.stop()
        let gpsDistance = routeActive ? route.distanceMeters : 0
        let routeData = routeActive ? await route.finish(for: nil) : nil
        routeActive = false
        let bestDistance = (distanceMeters ?? 0) > 0
            ? distanceMeters
            : (gpsDistance > 0 ? gpsDistance : nil)

        return Totals(
            startedAt: startedAt ?? end,
            endedAt: end,
            durationSeconds: builder.elapsedTime,
            activeCalories: activeCalories,
            avgHeartRate: avgHeartRate,
            maxHeartRate: maxHeartRate,
            distanceMeters: bestDistance,
            stepCount: await queryStepCount(from: startedAt ?? end, to: end),
            elevationGainMeters: elevationGain > 1 ? (elevationGain * 10).rounded() / 10 : nil,
            routeData: routeData
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
        // The samples are the product; HealthKit teardown is bookkeeping.
        // endCollection/finishWorkout/step-query can stall without throwing
        // (watch sim wedges healthd routinely; RouteTracker carries the same
        // scar for finishRoute) — and a stalled finish() would strand the
        // HRR screen at 0:00 AND leave phase == .ending, refusing the next
        // session. Deadline it: 8 s, then reset local state and move on
        // while the close keeps trying in the background.
        #if DEBUG
        print("PITAYA-SMOKE: recovery sampled n=\(samples.count)")
        #endif
        let close = Task { _ = await self.finish() }
        let closed = await withTaskGroup(of: Bool.self) { group in
            group.addTask { await close.value; return true }
            group.addTask {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
        #if DEBUG
        print("PITAYA-SMOKE: recovery close closed=\(closed)")
        #endif
        if !closed {
            session = nil
            builder = nil
            startedAt = nil
            frozen = false
            frozenEnd = nil
            phase = .idle
        }

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
                // §09: count each running second spent in zone 2 (same
                // display heuristic as the live ZoneBar).
                if self.phase == .running, !self.frozen,
                   let hr = self.heartRate, (0.57..<0.64).contains(hr / 190.0) {
                    self.z2Seconds += 1
                    self.z2BpmSum += Int(hr)
                    self.z2AvgBpm = self.z2BpmSum / max(self.z2Seconds, 1)
                }
                // Round 3 §01 burn rate + §02 live pace + §07 km splits ride
                // the 1 Hz tick.
                self.updateBurnRate()
                self.updateLivePace()
                self.checkSplit()
            }
        }
    }

    /// §01: kcal delta over the trailing 5 minutes, floored at 0; a paused
    /// session reads 0 outright.
    private func updateBurnRate() {
        if phase == .paused { kcalPerHour = 0; return }
        guard !frozen, let builder, let nowKcal = activeCalories else { return }
        let now = builder.elapsedTime
        let windowStart = max(0, now - 300)
        guard let base = kcalTrail.first(where: { $0.t >= windowStart }) ?? kcalTrail.first,
              now - base.t > 30
        else { return }
        kcalPerHour = max(0, Int((nowKcal - base.kcal) / (now - base.t) * 3600))
        while let first = kcalTrail.first, first.t < windowStart - 10 {
            kcalTrail.removeFirst()
        }
    }

    /// §02 "/ KM · NOW": distance covered in the trailing 60 s → sec/km.
    /// Paused sessions read nil (the map face shows "—:——").
    private func updateLivePace() {
        guard routeActive || activityKind == .walking else { return }
        guard phase == .running, !frozen, let builder else {
            if phase == .paused { paceNowSecPerKm = nil }
            return
        }
        let hkMeters = distanceMeters ?? 0
        let meters = hkMeters > 0 ? hkMeters : route.distanceMeters
        let now = builder.elapsedTime
        distTrail.append((t: now, meters: meters))
        while let first = distTrail.first, first.t < now - 70 {
            distTrail.removeFirst()
        }
        guard let base = distTrail.first(where: { $0.t >= now - 60 }) ?? distTrail.first,
              now - base.t >= 20
        else { return }
        let covered = meters - base.meters
        guard covered > 5 else {
            paceNowSecPerKm = nil // standing still: no honest pace to claim
            return
        }
        let pace = (now - base.t) / (covered / 1000)
        paceNowSecPerKm = pace.isFinite && pace < 3600 ? Int(pace) : nil
    }

    /// §07 km split — banked against the best live distance, outdoor only.
    private func checkSplit() {
        guard routeActive, phase == .running, !frozen, let builder else { return }
        let hkMeters = distanceMeters ?? 0
        let meters = hkMeters > 0 ? hkMeters : route.distanceMeters
        let km = Int(meters / 1000)
        guard km > splitKmBanked else { return }
        let elapsed = builder.elapsedTime
        let seconds = Int(elapsed - lastSplitElapsed)
        lastSplitElapsed = elapsed
        splitKmBanked = km
        splitSeconds.append(seconds)
        let prior = splitSeconds.dropLast()
        let delta: Int? = prior.isEmpty ? nil : seconds - prior.reduce(0, +) / prior.count
        Haptics.key(.notification)
        splitEvent = SplitEvent(id: UUID(), km: km, seconds: seconds, deltaVsAverage: delta)
    }

    /// §03 ZonePublisher: instantaneous zone always publishes for the chips;
    /// a CROSSING needs 5 consecutive samples in the new zone, never fires
    /// paused/frozen or in the first 60 s, honors a 20 s cooldown (crossings
    /// inside it still move the confirmed zone, silently — latest wins), and
    /// a Z5 entry is exempt from the cooldown. The haptic fires here, before
    /// the visuals land.
    private func classifyZone(bpm: Double) {
        guard let zones = hrZones, let zone = zones.zone(for: bpm) else { return }
        currentZone = zone
        guard !frozen, phase == .running else { return }

        guard let confirmed = confirmedZone else {
            if zoneCandidate == zone { zoneCandidateRun += 1 } else {
                zoneCandidate = zone
                zoneCandidateRun = 1
            }
            if zoneCandidateRun >= 5 {
                confirmedZone = zone
                zoneCandidate = nil
                zoneCandidateRun = 0
            }
            return
        }
        guard zone != confirmed else {
            zoneCandidate = nil
            zoneCandidateRun = 0
            return
        }
        if zoneCandidate == zone { zoneCandidateRun += 1 } else {
            zoneCandidate = zone
            zoneCandidateRun = 1
        }
        guard zoneCandidateRun >= 5 else { return }
        zoneCandidate = nil
        zoneCandidateRun = 0

        guard (builder?.elapsedTime ?? 0) >= 60 else {
            confirmedZone = zone
            return
        }
        if zone != 5, let last = lastZoneEventAt, Date().timeIntervalSince(last) < 20 {
            confirmedZone = zone
            return
        }
        confirmedZone = zone
        lastZoneEventAt = Date()
        Haptics.key(zone > confirmed ? .directionUp : .directionDown)
        zoneEvent = ZoneEvent(id: UUID(), from: confirmed, to: zone)
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
            // §00/§03: chips + the crossing publisher classify every sample
            // (stays live through the recovery window for the HRR screen —
            // the publisher gates itself on frozen/paused internally).
            if let hr = heartRate { classifyZone(bpm: hr) }
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
                    streamRevision += 1
                }
            }
        }

        guard !frozen else { return }

        let kcalType = HKQuantityType(.activeEnergyBurned)
        if types.contains(kcalType), let stats = builder.statistics(for: kcalType) {
            activeCalories = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
            // §01 burn-rate trail (trimmed by updateBurnRate to the window).
            if let kcal = activeCalories {
                kcalTrail.append((t: builder.elapsedTime, kcal: kcal))
            }
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
