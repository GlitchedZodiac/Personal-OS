#if canImport(HealthKit)
import Foundation
import HealthKit

@MainActor
public final class WorkoutSessionManager: NSObject, ObservableObject {
    @Published public private(set) var isRunning = false
    @Published public private(set) var elapsedSeconds: TimeInterval = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startedAt: Date?
    private var timer: Timer?

    public override init() {
        super.init()
    }

    public func start(activityType: HKWorkoutActivityType) throws {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activityType
        configuration.locationType = locationType(for: activityType)

        let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
        let builder = session.associatedWorkoutBuilder()

        session.delegate = self
        builder.delegate = self
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)

        self.session = session
        self.builder = builder
        self.startedAt = Date()

        session.startActivity(with: self.startedAt!)
        builder.beginCollection(withStart: self.startedAt!) { _, _ in }

        isRunning = true
        startTimer()
    }

    public func stop() async throws -> MobileWorkoutPayload? {
        guard let session, let builder, let startedAt else {
            return nil
        }

        session.end()
        stopTimer()

        return try await withCheckedThrowingContinuation { continuation in
            builder.endCollection(withEnd: Date()) { _, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                builder.finishWorkout { workout, finishError in
                    if let finishError {
                        continuation.resume(throwing: finishError)
                        return
                    }

                    let endedAt = workout?.endDate ?? Date()
                    let durationMinutes = Int(endedAt.timeIntervalSince(startedAt) / 60.0)

                    let payload = MobileWorkoutPayload(
                        externalId: UUID().uuidString,
                        startedAt: startedAt,
                        endedAt: endedAt,
                        durationMinutes: durationMinutes,
                        workoutType: self.workoutTypeLabel(for: workout?.workoutActivityType ?? .other),
                        caloriesBurned: workout?.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                        distanceMeters: workout?.totalDistance?.doubleValue(for: .meter()),
                        source: "mobile",
                        syncStatus: "pending_phone",
                        deviceType: "apple_watch"
                    )

                    self.resetSessionState()
                    continuation.resume(returning: payload)
                }
            }
        }
    }

    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self, let startedAt = self.startedAt else { return }
            self.elapsedSeconds = Date().timeIntervalSince(startedAt)
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func resetSessionState() {
        isRunning = false
        elapsedSeconds = 0
        session = nil
        builder = nil
        startedAt = nil
    }

    private func locationType(for activityType: HKWorkoutActivityType) -> HKWorkoutSessionLocationType {
        switch activityType {
        case .running, .walking, .hiking:
            return .outdoor
        default:
            return .indoor
        }
    }

    private func workoutTypeLabel(for activityType: HKWorkoutActivityType) -> String {
        switch activityType {
        case .walking:
            return "walk"
        case .running:
            return "run"
        case .hiking:
            return "hike"
        case .traditionalStrengthTraining, .functionalStrengthTraining:
            return "strength"
        case .crossTraining:
            return "kettlebell"
        default:
            return "other"
        }
    }
}

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    public func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        resetSessionState()
    }

    public func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        isRunning = toState == .running
    }
}

extension WorkoutSessionManager: HKLiveWorkoutBuilderDelegate {
    public func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    public func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {}
}
#endif
