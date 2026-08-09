// Live workout capture on the wrist: HKWorkoutSession + HKLiveWorkoutBuilder,
// publishing elapsed / heart rate / active calories for the live screens.
// Rewritten from the blind scaffold: statistics now actually stream (the old
// delegate ignored collected data), pause/resume exists, and finish() reads
// totals from the builder rather than trusting its own wall clock.

#if os(watchOS)
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

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startedAt: Date?
    private var ticker: Timer?

    public struct Totals: Sendable {
        public let startedAt: Date
        public let endedAt: Date
        public let durationSeconds: TimeInterval
        public let activeCalories: Double?
        public let avgHeartRate: Double?
        public let maxHeartRate: Double?
        public let distanceMeters: Double?
    }

    // MARK: - Authorization

    public func requestAuthorization() async throws {
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        let read: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
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

        let start = Date()
        startedAt = start
        session.startActivity(with: start)
        try await builder.beginCollection(at: start)

        phase = .running
        startTicker()
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

        session.end()
        let end = Date()

        var workout: HKWorkout?
        do {
            try await builder.endCollection(at: end)
            workout = try await builder.finishWorkout()
        } catch {
            // Simulator/denied-auth runs still produce a usable wall-clock
            // totals object; the workout just isn't persisted to Health.
        }

        let totals = Totals(
            startedAt: startedAt,
            endedAt: workout?.endDate ?? end,
            durationSeconds: workout?.duration ?? end.timeIntervalSince(startedAt),
            activeCalories: activeCalories,
            avgHeartRate: avgHeartRate,
            maxHeartRate: maxHeartRate,
            distanceMeters: distanceMeters
        )

        self.session = nil
        self.builder = nil
        self.startedAt = nil
        elapsed = totals.durationSeconds
        phase = .idle
        return totals
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
            avgHeartRate = stats.averageQuantity()?.doubleValue(for: bpm)
            maxHeartRate = stats.maximumQuantity()?.doubleValue(for: bpm)
        }

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
