// App-level state machine for the watch app: pairing → home → live workout →
// summary, plus the offline sync queue and the local PR engine. Views stay
// thin; every action the UI can take routes through here (the DEBUG smoke
// harness drives these same methods, so self-smoke exercises real paths).

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

    public var activityType: HKWorkoutActivityType {
        switch self {
        case .kettlebell: return .functionalStrengthTraining
        case .walk: return .walking
        case .run: return .running
        case .hike: return .hiking
        case .other: return .other
        }
    }

    public var isOutdoor: Bool {
        switch self {
        case .walk, .run, .hike: return true
        case .kettlebell, .other: return false
        }
    }

    public var systemImage: String {
        switch self {
        case .kettlebell: return "dumbbell.fill"
        case .walk: return "figure.walk"
        case .run: return "figure.run"
        case .hike: return "mountain.2.fill"
        case .other: return "flame.fill"
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
    public let prs: [PRBaselines.SessionPR]
}

// MARK: - App model

@MainActor
public final class AppModel: ObservableObject {
    public enum Phase: Equatable {
        case loading
        case welcome
        case pinEntry
        case pairedIntro
        case home
        case live(WorkoutKind)
        case summary
    }

    public enum SyncState: Equatable {
        case idle, syncing, synced, queued(Int), failed(String)
    }

    @Published public private(set) var phase: Phase = .loading
    @Published public var pairError: String?
    @Published public private(set) var isPairing = false
    @Published public private(set) var historyCount = 0
    @Published public private(set) var prExerciseCount = 0
    @Published public private(set) var lastKettlebell: Date?
    @Published public private(set) var syncState: SyncState = .idle
    @Published public private(set) var summary: WorkoutSummary?

    // Kettlebell live state
    @Published public private(set) var loggedSets: [LoggedSet] = []
    @Published public var currentExercise: ExerciseDef = ExerciseCatalog.kettlebell.first
        ?? ExerciseDef(id: "kb-swing", name: "Kettlebell Swing", category: .kettlebell)
    @Published public var weightKg: Double = 16
    @Published public var reps: Int = 10
    @Published public private(set) var prFlash: LoggedSet?

    public let recorder = WorkoutRecorder()

    private let sessionStore: any SessionStore
    private let api: MobileAPIClient
    private let queue: OfflineWorkoutQueue?
    private var baselines = PRBaselines()
    private var prFlashTask: Task<Void, Never>?

    public init(
        sessionStore: (any SessionStore)? = nil,
        baseURL: URL = MobileAPIClient.productionBaseURL
    ) {
        let store = sessionStore ?? KeychainSessionStore()
        self.sessionStore = store
        self.api = MobileAPIClient(baseURL: baseURL, sessionStore: store)
        self.queue = try? OfflineWorkoutQueue()
    }

    // MARK: - Boot & pairing

    public func bootstrap() async {
        if await sessionStore.load() != nil {
            phase = .home
            await refreshHistory()
            await drainQueue()
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
        historyCount = 0
        baselines = PRBaselines()
        phase = .welcome
    }

    public func refreshHistory() async {
        do {
            let list = try await api.fetchWorkouts(limit: 100)
            historyCount = list.entries.count
            baselines = PRBaselines(history: list.entries)
            prExerciseCount = baselines.best.count
            lastKettlebell = list.entries.first {
                $0.workoutType == "strength" && !$0.exercises.isEmpty
            }?.startedAt
        } catch MobileAPIClient.ClientError.unauthorized {
            await unpair()
        } catch {
            // Offline is fine — baselines stay at their last computed state.
        }
    }

    // MARK: - Workout flow

    public func startWorkout(_ kind: WorkoutKind) async {
        loggedSets = []
        summary = nil
        syncState = .idle
        do {
            try await recorder.start(activityType: kind.activityType, outdoor: kind.isOutdoor)
        } catch {
            // HealthKit refused (denied auth, restricted) — the session still
            // runs on wall clock so a workout is never lost.
        }
        phase = .live(kind)
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
        let prs = baselines.sessionPRs(entries: entries)
        baselines.absorb(entries: entries)

        let started = totals?.startedAt ?? Date().addingTimeInterval(-recorder.elapsed)
        let ended = totals?.endedAt ?? Date()
        let duration = totals?.durationSeconds ?? ended.timeIntervalSince(started)

        let volume = loggedSets.reduce(0.0) { $0 + $1.weightKg * Double($1.reps) }
        summary = WorkoutSummary(
            kind: kind,
            durationSeconds: duration,
            calories: totals?.activeCalories,
            avgHeartRate: totals?.avgHeartRate,
            distanceMeters: totals?.distanceMeters,
            totalVolumeKg: volume,
            setCount: loggedSets.count,
            prs: prs
        )

        let item = WorkoutSyncItem(
            startedAt: started,
            endedAt: ended,
            durationMinutes: max(1, Int((duration / 60).rounded())),
            workoutType: kind.workoutTypeString,
            description: sessionDescription(kind: kind),
            caloriesBurned: totals?.activeCalories.map { ($0 * 10).rounded() / 10 },
            distanceMeters: totals?.distanceMeters.map { $0.rounded() },
            avgHeartRateBpm: totals?.avgHeartRate.map { Int($0.rounded()) },
            maxHeartRateBpm: totals?.maxHeartRate.map { Int($0.rounded()) },
            exercises: entries.isEmpty ? nil : entries,
            deviceType: "apple_watch"
        )

        phase = .summary
        if !prs.isEmpty {
            WKInterfaceDevice.current().play(.notification)
        }
        await sync(item)
    }

    public func dismissSummary() {
        summary = nil
        loggedSets = []
        phase = .home
        Task { await refreshHistory() }
    }

    // MARK: - Sync

    private func sync(_ item: WorkoutSyncItem) async {
        try? await queue?.enqueue(item)
        await drainQueue()
    }

    public func drainQueue() async {
        guard let queue else { return }
        let pending = await queue.load()
        guard !pending.isEmpty else { return }

        syncState = .syncing
        do {
            _ = try await api.syncWorkouts(pending)
            try? await queue.removeSynced(pending)
            syncState = .synced
        } catch {
            syncState = .queued(pending.count)
        }
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
