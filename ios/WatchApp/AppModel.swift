// App-level state machine for the watch app: pairing → home → workout list /
// sequences → live → summary, plus the offline sync queue, the local PR
// engine, the EMOM runner, and the idle-nudge watchdog. Views stay thin;
// every action the UI can take routes through here (the DEBUG smoke harness
// drives these same methods, so self-smoke exercises real paths).

#if os(watchOS)
import Foundation
import HealthKit
import SwiftUI
import WatchKit
import WidgetKit

// MARK: - Workout kinds

public enum WorkoutKind: String, CaseIterable, Identifiable {
    case kettlebell, walk, treadmill, run, hike, other

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .kettlebell: return "Kettlebell"
        case .walk: return "Walk"
        case .treadmill: return "Treadmill"
        case .run: return "Run"
        case .hike: return "Hike"
        case .other: return "Other"
        }
    }

    /// workout_logs.workoutType value — matches the app's vocabulary
    /// ("strength" for kettlebell; treadmill_walk added 2026-08-11; the app
    /// renders no-GPS types with a distance-hero header).
    public var workoutTypeString: String {
        switch self {
        case .kettlebell: return "strength"
        case .walk: return "walk"
        case .treadmill: return "treadmill_walk"
        case .run: return "run"
        case .hike: return "hike"
        case .other: return "other"
        }
    }

    public var isOutdoor: Bool {
        switch self {
        case .walk, .run, .hike: return true
        case .kettlebell, .treadmill, .other: return false
        }
    }

    public var activityType: HKWorkoutActivityType {
        switch self {
        case .kettlebell: return .functionalStrengthTraining
        case .walk, .treadmill: return .walking
        case .run: return .running
        case .hike: return .hiking
        case .other: return .other
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
    public let roundsCompleted: Int?
    public let sequenceName: String?
    public var prs: [PRBaselines.SessionPR]
}

// MARK: - App model

@MainActor
public final class AppModel: ObservableObject {
    public enum Phase: Equatable {
        case loading
        case welcome
        case pinEntry
        case pairedIntro
        case home              // design 04 — tile grid
        case settings          // Round 1 §01
        case workoutList       // design 05
        case kettlebellSpace   // Michael's 2026-08-10 IA: routines + free sets
        case sequences         // design 06
        case sequenceDetail(SequenceDef) // design 07
        case live(WorkoutKind)           // freeform live pages
        case liveSequence(SequenceDef)   // EMOM ring or circuit runner by kind
        case summary
    }

    public enum SyncState: Equatable {
        case idle, unsaved, syncing, synced, queued(Int), failed(String)
    }

    @Published public private(set) var phase: Phase = .loading
    @Published public var pairError: String?
    @Published public private(set) var isPairing = false
    @Published public private(set) var historyCount = 0
    @Published public private(set) var prExerciseCount = 0
    @Published public private(set) var lastKettlebell: Date?
    @Published public private(set) var lastRun: (at: Date, km: Double)?
    @Published public private(set) var sequences: [SequenceDef] = []
    /// Weekday indices (1 = Mon … 7 = Sun) with a trained session this week.
    @Published public private(set) var trainedWeekdays: Set<Int> = []
    /// First session logged today, if any (Home's mint "✓ 7:12a").
    @Published public private(set) var trainedTodayAt: Date?
    /// Least-recently-run routine — the Home "due · <name>" state (§04).
    @Published public private(set) var dueRoutine: SequenceDef?
    /// Offline-queue depth + the last successful sync touch (Settings row).
    @Published public private(set) var queuedCount = 0
    @Published public private(set) var lastSyncCheckAt: Date?
    @Published public private(set) var syncState: SyncState = .idle
    @Published public private(set) var summary: WorkoutSummary?
    /// Sync-response codas (Round 1+2 §02/§03): hero metrics + the routine
    /// verdict/last-run for the session just saved. Optional until the main
    /// lane deploys the enriched sync response to prod.
    @Published public private(set) var heroMetrics: HeroMetricsPayload?
    @Published public private(set) var routineCoda: RoutineCodaPayload?
    /// §03 deltas baseline — local rows instantly, server coda after sync.
    @Published public private(set) var lastRunBaseline: LastRunStats?
    /// §03 recovery card — lands ~60 s after the last Done, if HR was live.
    @Published public private(set) var recoveryCapture: WorkoutRecorder.RecoveryCapture?
    /// §03 zones card — server-enriched seconds, refetched after Save syncs.
    @Published public private(set) var summaryZones: [Int]?
    /// §03 tape — per-round work seconds for EMOM runs (populated by
    /// early-done taps; without them a full minute isn't "work", so the tape
    /// stays honest by staying empty).
    @Published public private(set) var emomRoundSeconds: [Int] = []
    /// Which EMOM round earned the tape's ◆ (set by the same taps).
    @Published public private(set) var emomPRRound: Int?

    // Kettlebell live state
    @Published public private(set) var loggedSets: [LoggedSet] = []
    @Published public var currentExercise: ExerciseDef = ExerciseCatalog.kettlebell.first
        ?? ExerciseDef(id: "kb-swing", name: "Kettlebell Swing", category: .kettlebell, aliases: [])
    @Published public var weightKg: Double = 16
    @Published public var reps: Int = 10
    @Published public private(set) var prFlash: LoggedSet?

    // EMOM runner state
    @Published public private(set) var emomRound = 0
    @Published public private(set) var emomSecondsLeft = 60

    // Circuit runner state (tap-driven)
    @Published public private(set) var circuitRound = 1
    @Published public private(set) var circuitStepIndex = 0
    @Published public private(set) var circuitRestLeft: Int? // nil = working
    private var circuitStepCompletions: [Int] = []
    private var circuitStepSeconds: [Int] = []
    private var circuitStepMark = Date()
    private var circuitRestTask: Task<Void, Never>?

    // Pre-start weight overrides per exercise id (Michael's ask: dial actual
    // weights before Start; the run logs what you really lifted). Last-used
    // values persist per sequence in plain prefs (never sensitive data).
    @Published public var weightOverrides: [String: Double] = [:]

    // 3-2-1 countdown before any start (nil = not counting)
    @Published public private(set) var countdown: Int?

    // Idle nudge — "still training?" after minutes without a signal
    @Published public var idleNudgeActive = false
    private var lastActivityAt = Date()
    private var idleWatchdog: Task<Void, Never>?
    private var idleThreshold: TimeInterval {
        TimeInterval(WatchPrefs.shared.idleNudgeMinutes) * 60
    }

    public let recorder = WorkoutRecorder()

    private let sessionStore: any SessionStore
    private let api: MobileAPIClient
    private let queue: OfflineWorkoutQueue?
    private let prCache: PRBaselineCache?
    private let customExerciseCache: CustomExerciseCache?
    /// Smoke runs set this to "watch_smoke" so test rows NEVER share the real
    /// app's externalSource namespace — cleanup can then target watch_smoke
    /// alone (a real 07:28 row was once deleted by an app_watch-wide sweep;
    /// never again).
    var externalSourceOverride: String?
    private var baselines = PRBaselines()
    private var prFlashTask: Task<Void, Never>?
    private var workoutStartedAt = Date()
    private var pendingItem: WorkoutSyncItem?
    private var activeSequence: SequenceDef?
    private var engineTask: Task<Void, Never>?
    private var sequencePausedAccum: TimeInterval = 0
    private var sequencePauseStartedAt: Date?
    /// Last 50 server rows, retained for the §03 local deltas baseline.
    private var recentRows: [MobileWorkoutRow] = []
    private var recoveryTask: Task<Void, Never>?

    public init(
        sessionStore: (any SessionStore)? = nil,
        baseURL: URL = MobileAPIClient.productionBaseURL
    ) {
        // Shared access group so the widget extension reads the same bearer
        // session (§02 widget-side fetch); existing ungrouped sessions are
        // migrated on first load.
        let store = sessionStore ?? KeychainSessionStore(accessGroup: PitayaKeychain.sharedGroup)
        self.sessionStore = store
        self.api = MobileAPIClient(baseURL: baseURL, sessionStore: store)
        self.queue = try? OfflineWorkoutQueue()
        self.prCache = try? PRBaselineCache()
        self.customExerciseCache = try? CustomExerciseCache()
        if let cached = customExerciseCache?.load() {
            ExerciseCatalog.setCustom(cached)
        }
    }

    // MARK: - Boot & pairing

    public func bootstrap() async {
        if await sessionStore.load() != nil {
            // Cached baselines synchronously, network in the background — the
            // home screen must never wait on two cold Vercel round-trips
            // (that was the 5–10 s "black screen" Michael hit on wrist).
            if let cached = await prCache?.load() {
                baselines = PRBaselines(cached: cached)
                prExerciseCount = baselines.best.count
            }
            phase = .home
            Task { [weak self] in
                await self?.refreshHistory()
                await self?.drainQueue()
            }
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
        await prCache?.clear()
        historyCount = 0
        baselines = PRBaselines()
        sequences = []
        phase = .welcome
    }

    /// Refresh server-truth PR baselines, sequences, and home-screen facts.
    /// Offline keeps the last known state (cached baselines survive).
    public func refreshHistory() async {
        do {
            let prList = try await api.fetchPRs()
            baselines = PRBaselines(records: prList.records)
            prExerciseCount = Set(prList.records.map(\.exercise)).count
            await prCache?.save(baselines.best)
        } catch MobileAPIClient.ClientError.unauthorized {
            await unpair()
            return
        } catch {
            // Offline is fine — cached baselines stand.
        }

        if let list = try? await api.fetchSequences() {
            sequences = list.sequences
            #if DEBUG
            sequences.append(contentsOf: debugInjected)
            #endif
        }

        // AI-created custom exercises → merged into the catalog/normalizer,
        // cached for offline cold-starts.
        if let list = try? await api.fetchExercises() {
            let defs = list.exercises.map { row in
                ExerciseDef(
                    id: row.id,
                    name: row.name,
                    category: row.category.flatMap { ExerciseCategory(rawValue: $0) } ?? .kettlebell,
                    aliases: row.aliases ?? []
                )
            }
            ExerciseCatalog.setCustom(defs)
            customExerciseCache?.save(defs)
        }

        do {
            let list = try await api.fetchWorkouts(limit: 50)
            recentRows = list.entries
            historyCount = list.entries.count
            lastKettlebell = list.entries.first {
                $0.workoutType == "strength" && !$0.exercises.isEmpty
            }?.startedAt
            lastRun = list.entries.first {
                ($0.workoutType == "run" || $0.workoutType == "cardio")
                    && ($0.distanceMeters ?? 0) > 0
            }.flatMap { row in
                row.distanceMeters.map { (row.startedAt, $0 / 1000) }
            }

            // §04 week ticks + due rotation, computed from local history.
            var calendar = Calendar.current
            calendar.firstWeekday = 2 // weeks start Monday
            let now = Date()
            var weekdays = Set<Int>()
            var todayAt: Date?
            var lastRunBySequence: [String: Date] = [:]
            for row in list.entries {
                if calendar.isDate(row.startedAt, equalTo: now, toGranularity: .weekOfYear) {
                    let weekday = calendar.component(.weekday, from: row.startedAt)
                    weekdays.insert(weekday == 1 ? 7 : weekday - 1)
                }
                if calendar.isDateInToday(row.startedAt) {
                    todayAt = min(todayAt ?? row.startedAt, row.startedAt)
                }
                if let sequenceId = row.sequenceId {
                    let prior = lastRunBySequence[sequenceId] ?? .distantPast
                    lastRunBySequence[sequenceId] = max(prior, row.startedAt)
                }
            }
            trainedWeekdays = weekdays
            trainedTodayAt = todayAt
            dueRoutine = sequences.min { a, b in
                (lastRunBySequence[a.id] ?? .distantPast)
                    < (lastRunBySequence[b.id] ?? .distantPast)
            }
            lastSyncCheckAt = Date()
        } catch {
            // Offline — home facts stay stale, nothing breaks.
        }

        // Fresh history changes the complication's due/trained state too.
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Navigation

    public func openWorkoutList() { phase = .workoutList }
    public func openSettings() { phase = .settings }
    public func openKettlebellSpace() { phase = .kettlebellSpace }
    public func openSequences() { phase = .sequences }
    public func openSequence(_ sequence: SequenceDef) {
        loadWeightOverrides(for: sequence)
        phase = .sequenceDetail(sequence)
    }
    public func backToHome() { phase = .home }
    public func backToWorkoutList() { phase = .workoutList }
    public func backToKettlebellSpace() { phase = .kettlebellSpace }
    public func backToSequences() { phase = .sequences }

    // MARK: - Weight overrides

    /// Unique weight-bearing exercises in a sequence, in first-appearance
    /// order — the rows of the pre-start weights editor.
    public func weightableExercises(in sequence: SequenceDef) -> [(id: String, name: String)] {
        var seen = Set<String>()
        return sequence.steps.compactMap { step in
            guard !seen.contains(step.exercise) else { return nil }
            let category = ExerciseCatalog.byId(step.exercise)?.category
            guard category == .kettlebell || category == .barbell || category == .dumbbell
            else { return nil }
            seen.insert(step.exercise)
            return (step.exercise, step.exerciseName)
        }
    }

    public func effectiveWeight(for step: SequenceStep) -> Double? {
        weightOverrides[step.exercise] ?? step.weightKg
    }

    private func overridesKey(_ sequence: SequenceDef) -> String {
        "seqWeights.\(sequence.id)"
    }

    private func loadWeightOverrides(for sequence: SequenceDef) {
        var loaded = (UserDefaults.standard.dictionary(forKey: overridesKey(sequence)) as? [String: Double]) ?? [:]
        // Prescribed weights fill the gaps so the editor always shows a number.
        for step in sequence.steps where loaded[step.exercise] == nil {
            if let weight = step.weightKg { loaded[step.exercise] = weight }
        }
        weightOverrides = loaded
    }

    private func persistWeightOverrides(for sequence: SequenceDef) {
        UserDefaults.standard.set(weightOverrides, forKey: overridesKey(sequence))
    }

    // MARK: - Freeform workout flow

    /// `useRecorder: false` is the headless-smoke path (no HealthKit sheet,
    /// no countdown in a simulator run); every user-facing call leaves it true.
    public func startWorkout(_ kind: WorkoutKind, useRecorder: Bool = true) async {
        resetLiveState()
        if kind == .kettlebell {
            reps = WatchPrefs.shared.startRepsAt == .lastLogged
                ? WatchPrefs.shared.lastLoggedReps : 10
        }
        phase = .live(kind)
        guard useRecorder else { return }
        // A recovery window still watching the previous session yields first.
        await recorder.abortRecoveryIfNeeded()
        await runCountdown()
        workoutStartedAt = Date()
        do {
            try await recorder.start(activityType: kind.activityType, outdoor: kind.isOutdoor)
        } catch {
            // HealthKit refused (denied auth, restricted) — the session still
            // runs on wall clock so a workout is never lost.
        }
    }

    /// 3 · 2 · 1 with tick haptics, then the start haptic — Michael's ask:
    /// nothing should begin the instant you tap.
    private func runCountdown() async {
        for n in [3, 2, 1] {
            countdown = n
            WKInterfaceDevice.current().play(.click)
            try? await Task.sleep(nanoseconds: 900_000_000)
        }
        countdown = nil
        WKInterfaceDevice.current().play(.start)
        markActivity()
    }

    /// Weight-PR gap for the logger's idle line ("4 kg shy of your best").
    public func bestWeightKg(for exerciseId: String) -> Double? {
        baselines.best[exerciseId]?.weightKg
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
        markActivity()
        WatchPrefs.shared.lastLoggedReps = reps

        if result.isWeightPR {
            // §06: the PR lands as a marker in the Health session tape.
            recorder.addMarker(
                name: "PR · \(set.exercise.name) \(Fmt.kg(set.weightKg)) kg", at: set.at
            )
            Haptics.key(.success)
            prFlash = set
            prFlashTask?.cancel()
            prFlashTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 2_600_000_000)
                if !Task.isCancelled { self?.prFlash = nil }
            }
        } else {
            Haptics.minor(.click)
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
        let entries = aggregatedEntries()
        // §03 HRR: kettlebell sessions freeze the numbers at the last Done
        // and watch the descent for 60 s; outdoor kinds close as before.
        let totals: WorkoutRecorder.Totals?
        if kind == .kettlebell {
            totals = await beginRecoveryOrFinish()
        } else {
            totals = await recorder.finish()
        }
        prepareSummary(
            kind: kind,
            totals: totals,
            entries: entries,
            volume: loggedSets.reduce(0.0) { $0 + $1.weightKg * Double($1.reps) },
            setCount: loggedSets.count,
            rounds: nil,
            sequence: nil,
            description: sessionDescription(kind: kind)
        )
    }

    /// Freeze-now-finish-later (§03): snapshot totals immediately so the
    /// summary renders, then complete the 60 s recovery capture off-screen.
    private func beginRecoveryOrFinish() async -> WorkoutRecorder.Totals? {
        guard let totals = await recorder.beginRecoveryWindow() else {
            return await recorder.finish()
        }
        let sessionToken = workoutStartedAt
        recoveryTask?.cancel()
        recoveryTask = Task { [weak self] in
            let capture = await self?.recorder.completeRecovery()
            guard let self, !Task.isCancelled else { return }
            // Only surface it if we're still on this session's summary.
            if case .summary = self.phase,
               self.workoutStartedAt == sessionToken,
               let capture, capture.drop > 0 {
                self.recoveryCapture = capture
            }
        }
        return totals
    }

    // MARK: - Sequence (EMOM) flow

    public func startSequence(_ sequence: SequenceDef, useRecorder: Bool = true) async {
        resetLiveState()
        activeSequence = sequence
        persistWeightOverrides(for: sequence)
        emomRound = 0
        emomSecondsLeft = 60
        sequencePausedAccum = 0
        sequencePauseStartedAt = nil
        circuitRound = 1
        circuitStepIndex = 0
        circuitRestLeft = nil
        circuitStepCompletions = Array(repeating: 0, count: sequence.steps.count)
        circuitStepSeconds = Array(repeating: 0, count: sequence.steps.count)
        phase = .liveSequence(sequence)

        if useRecorder {
            // A recovery window still watching the previous session yields.
            await recorder.abortRecoveryIfNeeded()
            await runCountdown()
        }
        workoutStartedAt = Date()
        circuitStepMark = Date()

        if useRecorder {
            do {
                try await recorder.start(activityType: .functionalStrengthTraining, outdoor: false)
            } catch {}
        }

        if sequence.kind == "emom" {
            engineTask?.cancel()
            engineTask = Task { [weak self] in
                await self?.runEMOMEngine(sequence)
            }
        }
        // Circuit/straight kinds are tap-driven — no clock engine.
    }

    // MARK: - Circuit runner (tap-driven rounds)

    public func circuitTotalRounds(_ sequence: SequenceDef) -> Int {
        max(sequence.rounds ?? 3, 1)
    }

    /// "Done" on the current step: advance, rest between rounds, finish
    /// after the last.
    public func advanceCircuitStep(_ sequence: SequenceDef) async {
        guard circuitRestLeft == nil else { return }
        markActivity()
        if circuitStepIndex < circuitStepCompletions.count {
            circuitStepCompletions[circuitStepIndex] += 1
            circuitStepSeconds[circuitStepIndex] += Int(Date().timeIntervalSince(circuitStepMark))
            // §06: each work interval lands as a named Health segment.
            recorder.addSegment(
                name: "Round \(circuitRound) · \(sequence.steps[circuitStepIndex].exerciseName.lowercased())",
                from: circuitStepMark, to: Date()
            )
        }

        if circuitStepIndex + 1 < sequence.steps.count {
            circuitStepIndex += 1
            circuitStepMark = Date()
            WKInterfaceDevice.current().play(.click)
        } else if circuitRound < circuitTotalRounds(sequence) {
            WKInterfaceDevice.current().play(.success)
            await runCircuitRest(sequence)
            circuitRound += 1
            circuitStepIndex = 0
            circuitStepMark = Date() // work clock restarts after rest
        } else {
            WKInterfaceDevice.current().play(.success)
            await finishSequence(roundsCompleted: circuitTotalRounds(sequence))
        }
    }

    public func skipCircuitRest() {
        circuitRestTask?.cancel()
        circuitRestLeft = nil
    }

    private func runCircuitRest(_ sequence: SequenceDef) async {
        let restSeconds = sequence.steps[circuitStepIndex].restSeconds
            ?? sequence.restSecondsDefault
            ?? WatchPrefs.shared.restFallbackSeconds
        guard restSeconds > 0 else { return }

        circuitRestTask?.cancel()
        circuitRestLeft = restSeconds
        let task = Task { [weak self] in
            var left = restSeconds
            while left > 0, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                left -= 1
                self?.circuitRestLeft = left
            }
            if !Task.isCancelled {
                WKInterfaceDevice.current().play(.notification) // design 14: haptic at zero
            }
        }
        circuitRestTask = task
        await task.value
        circuitRestLeft = nil
    }

    /// One round per minute; steps cycle across minutes (design 09's model,
    /// matching the web builder's EMOM semantics).
    private func runEMOMEngine(_ sequence: SequenceDef) async {
        let totalRounds = max(sequence.durationMinutes ?? sequence.steps.count, 1)
        let startedAt = Date()
        var roundStartedAt = Date()

        // §06: name the round that just closed ("Round 3 · press").
        func closeRoundSegment(_ round: Int, at date: Date) {
            guard round >= 1, !sequence.steps.isEmpty else { return }
            let step = sequence.steps[(round - 1) % sequence.steps.count]
            recorder.addSegment(
                name: "Round \(round) · \(step.exerciseName.lowercased())",
                from: roundStartedAt, to: date
            )
            roundStartedAt = date
        }

        while !Task.isCancelled {
            guard case .liveSequence = phase else { return }

            if recorder.phase == .paused {
                if sequencePauseStartedAt == nil { sequencePauseStartedAt = Date() }
            } else {
                if let pausedAt = sequencePauseStartedAt {
                    sequencePausedAccum += Date().timeIntervalSince(pausedAt)
                    sequencePauseStartedAt = nil
                }
                let elapsed = Date().timeIntervalSince(startedAt) - sequencePausedAccum
                let minuteIndex = Int(elapsed / 60)

                if minuteIndex >= totalRounds {
                    closeRoundSegment(totalRounds, at: Date())
                    WKInterfaceDevice.current().play(.success)
                    await finishSequence(roundsCompleted: totalRounds)
                    return
                }

                let round = minuteIndex + 1
                if round != emomRound {
                    if emomRound != 0 {
                        closeRoundSegment(emomRound, at: Date())
                        WKInterfaceDevice.current().play(.notification)
                    }
                    emomRound = round
                    markActivity()
                }
                emomSecondsLeft = 60 - (Int(elapsed) % 60)
            }

            try? await Task.sleep(nanoseconds: 250_000_000)
        }
    }

    public func currentStep(of sequence: SequenceDef) -> SequenceStep? {
        guard emomRound > 0, !sequence.steps.isEmpty else { return sequence.steps.first }
        return sequence.steps[(emomRound - 1) % sequence.steps.count]
    }

    public func nextStep(of sequence: SequenceDef) -> SequenceStep? {
        guard !sequence.steps.isEmpty else { return nil }
        return sequence.steps[emomRound % sequence.steps.count]
    }

    /// End from controls mid-sequence: the running round counts — you tapped
    /// End after doing the work, not before.
    public func endSequenceEarly() async {
        guard let sequence = activeSequence else { return }
        if sequence.kind == "emom" {
            await finishSequence(roundsCompleted: max(emomRound, 0))
        } else {
            await finishSequence(roundsCompleted: max(circuitRound - 1, minCompletedRounds))
        }
    }

    private var minCompletedRounds: Int {
        circuitStepCompletions.min() ?? 0
    }

    private func finishSequence(roundsCompleted: Int) async {
        engineTask?.cancel()
        engineTask = nil
        circuitRestTask?.cancel()
        circuitRestLeft = nil
        guard let sequence = activeSequence else { return }

        let entries = sequenceEntries(sequence: sequence, rounds: roundsCompleted)

        // §06: Health detail carries the routine's name and its PR markers.
        // (Sequence PRs are only known from the completed entries, so the
        // marker sits at the session end rather than the exact round.)
        recorder.sessionTitle = sequence.name
        for pr in baselines.sessionPRs(entries: entries) where pr.kind == "weight" {
            recorder.addMarker(
                name: "PR · \(pr.exerciseName) \(Fmt.kg(pr.value)) kg", at: Date()
            )
        }

        // §03 HRR: freeze now, watch the descent for 60 s off-screen.
        let totals = await beginRecoveryOrFinish()
        let volume = entries.reduce(0.0) { acc, entry in
            guard let sets = entry.sets, let reps = entry.reps, let weight = entry.weightKg
            else { return acc }
            return acc + Double(sets * reps) * weight
        }

        prepareSummary(
            kind: .kettlebell,
            totals: totals,
            entries: entries,
            volume: volume,
            setCount: entries.reduce(0) { $0 + ($1.sets ?? 0) },
            rounds: roundsCompleted,
            sequence: sequence,
            description: sequence.name
        )
    }

    /// EMOM: rounds R cycling S steps → step i performed R/S (+1 for the
    /// first R%S steps) times. Circuit: exact tap-counted completions.
    /// Weights come from the pre-start overrides (actual iron lifted), then
    /// the routine's prescription.
    private func sequenceEntries(sequence: SequenceDef, rounds: Int) -> [ExerciseEntry] {
        let stepCount = sequence.steps.count
        guard stepCount > 0 else { return [] }

        let usesCompletions = sequence.kind != "emom"
            && circuitStepCompletions.count == stepCount
            && circuitStepCompletions.contains(where: { $0 > 0 })

        return sequence.steps.enumerated().compactMap { index, step in
            let times: Int
            if usesCompletions {
                times = circuitStepCompletions[index]
            } else {
                guard rounds > 0 else { return nil }
                times = rounds / stepCount + (index < rounds % stepCount ? 1 : 0)
            }
            guard times > 0 else { return nil }
            return ExerciseEntry(
                name: step.exerciseName,
                sets: times,
                reps: step.reps,
                weightKg: effectiveWeight(for: step)
            )
        }
    }

    // MARK: - Summary, save, discard

    private func prepareSummary(
        kind: WorkoutKind,
        totals: WorkoutRecorder.Totals?,
        entries: [ExerciseEntry],
        volume: Double,
        setCount: Int,
        rounds: Int?,
        sequence: SequenceDef?,
        description: String?
    ) {
        stopIdleWatchdog()
        let started = totals?.startedAt ?? workoutStartedAt
        let ended = totals?.endedAt ?? Date()
        let duration = totals?.durationSeconds ?? ended.timeIntervalSince(started)

        let prs = baselines.sessionPRs(entries: entries)
        baselines.absorb(entries: entries)

        // §03 deltas: instant baseline from cached rows (same semantics as
        // the server's lastRun — the run before this one, same routine);
        // the sync response's coda replaces it, server winning on drift.
        lastRunBaseline = sequence.flatMap { localLastRun(sequenceId: $0.id, before: started) }

        summary = WorkoutSummary(
            kind: kind,
            durationSeconds: duration,
            calories: totals?.activeCalories,
            avgHeartRate: totals?.avgHeartRate,
            distanceMeters: totals?.distanceMeters,
            totalVolumeKg: volume,
            setCount: setCount,
            roundsCompleted: rounds,
            sequenceName: sequence?.name,
            prs: prs
        )

        // Raw streams ride along for the server's zone/load enrichment
        // (streams contract 2026-08-11 — the server downsamples and computes;
        // the wrist just reports what HealthKit saw).
        let hrStream = recorder.hrStream
        let metrics = WorkoutMetricsData(
            sequenceId: sequence?.id,
            sequenceName: sequence?.name,
            roundsCompleted: rounds,
            stepSeconds: circuitStepSeconds.contains(where: { $0 > 0 })
                ? circuitStepSeconds : nil,
            hrStream: hrStream.isEmpty ? nil : hrStream,
            timeStream: hrStream.isEmpty ? nil : recorder.timeStream,
            altitudeStream: recorder.altitudeStream.isEmpty ? nil : recorder.altitudeStream
        )

        pendingItem = WorkoutSyncItem(
            externalSource: externalSourceOverride ?? "app_watch",
            startedAt: started,
            endedAt: ended,
            durationMinutes: max(1, Int((duration / 60).rounded())),
            workoutType: kind.workoutTypeString,
            description: description,
            caloriesBurned: totals?.activeCalories.map { ($0 * 10).rounded() / 10 },
            distanceMeters: totals?.distanceMeters.map { $0.rounded() },
            stepCount: totals?.stepCount,
            avgHeartRateBpm: totals?.avgHeartRate.map { Int($0.rounded()) },
            maxHeartRateBpm: totals?.maxHeartRate.map { Int($0.rounded()) },
            elevationGainM: totals?.elevationGainMeters,
            exercises: entries.isEmpty ? nil : entries,
            metricsData: metrics.isEmpty ? nil : metrics,
            routeData: totals?.routeData,
            deviceType: "apple_watch"
        )

        syncState = .unsaved
        phase = .summary
        if !prs.isEmpty {
            WKInterfaceDevice.current().play(.notification)
        }
    }

    /// Michael's ask: explicit Save (vs the old auto-save) so test sessions
    /// and forgotten-running workouts can be thrown away.
    public func saveWorkout() async {
        guard let item = pendingItem else { return }
        pendingItem = nil
        try? await queue?.enqueue(item)
        await drainQueue(reconcilePRsFor: item.externalId)
        await loadSummaryZones(externalId: item.externalId)
    }

    /// §03 zones card: the sync enrichment stores timeInZones on the row —
    /// one refetch after Save lights the card (zone math stays server-side
    /// per the streams contract).
    private func loadSummaryZones(externalId: String) async {
        guard summary != nil, syncState == .synced else { return }
        guard let list = try? await api.fetchWorkouts(limit: 5) else { return }
        summaryZones = list.entries.first { $0.externalId == externalId }?.timeInZonesSeconds
    }

    /// "The run before this one, same routine" from the cached history rows.
    private func localLastRun(sequenceId: String, before: Date) -> LastRunStats? {
        guard let row = recentRows.first(where: {
            $0.sequenceId == sequenceId && $0.startedAt < before
        }) else { return nil }
        let volume = row.exercises.reduce(0.0) {
            $0 + Double(($1.sets ?? 0) * ($1.reps ?? 0)) * ($1.weightKg ?? 0)
        }
        return LastRunStats(
            startedAt: row.startedAt,
            durationMinutes: row.durationMinutes,
            volumeKg: volume,
            caloriesBurned: row.caloriesBurned,
            avgHeartRateBpm: row.avgHeartRateBpm,
            roundsCompleted: nil
        )
    }

    public func discardWorkout() {
        recoveryTask?.cancel()
        recoveryTask = nil
        Task { await recorder.abortRecoveryIfNeeded() }
        pendingItem = nil
        summary = nil
        loggedSets = []
        activeSequence = nil
        syncState = .idle
        clearSummaryExtras()
        phase = .home
    }

    public func dismissSummary() {
        recoveryTask?.cancel()
        recoveryTask = nil
        Task { await recorder.abortRecoveryIfNeeded() }
        summary = nil
        loggedSets = []
        activeSequence = nil
        clearSummaryExtras()
        phase = .home
        Task { await refreshHistory() }
    }

    private func clearSummaryExtras() {
        lastRunBaseline = nil
        recoveryCapture = nil
        summaryZones = nil
        emomRoundSeconds = []
        emomPRRound = nil
    }

    // MARK: - Idle nudge

    private func resetLiveState() {
        recoveryTask?.cancel()
        recoveryTask = nil
        loggedSets = []
        summary = nil
        pendingItem = nil
        syncState = .idle
        idleNudgeActive = false
        countdown = nil
        circuitRestTask?.cancel()
        circuitRestLeft = nil
        clearSummaryExtras()
        workoutStartedAt = Date()
        markActivity()
        startIdleWatchdog()
    }

    public func markActivity() {
        lastActivityAt = Date()
    }

    public func keepTraining() {
        markActivity()
        idleNudgeActive = false
    }

    private func startIdleWatchdog() {
        stopIdleWatchdog()
        idleWatchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard let self else { return }
                switch self.phase {
                case .live, .liveSequence: break
                default: return
                }
                // A working heart counts as activity even without taps.
                if let hr = self.recorder.heartRate, hr >= 95 {
                    self.markActivity()
                }
                if !self.idleNudgeActive,
                   self.idleThreshold > 0,
                   Date().timeIntervalSince(self.lastActivityAt) > self.idleThreshold {
                    self.idleNudgeActive = true
                    Haptics.key(.notification)
                }
            }
        }
    }

    private func stopIdleWatchdog() {
        idleWatchdog?.cancel()
        idleWatchdog = nil
        idleNudgeActive = false
    }

    // MARK: - Sync

    public func drainQueue(reconcilePRsFor externalId: String? = nil) async {
        guard let queue else { return }
        let pending = await queue.load()
        queuedCount = pending.count
        guard !pending.isEmpty else { return }

        syncState = .syncing
        do {
            let response = try await api.syncWorkouts(pending)
            try? await queue.removeSynced(pending)
            syncState = .synced
            queuedCount = 0
            lastSyncCheckAt = Date()
            reconcileSummaryPRs(from: response, matching: externalId)
            // §02/§03 codas: hero metrics for the wrist surfaces, routine
            // verdict + last-run for the summary deltas — the server's
            // lastRun replaces the local baseline (server wins on drift).
            if let metrics = response.summary { heroMetrics = metrics }
            if let coda = response.routine {
                routineCoda = coda
                if summary != nil, let serverLastRun = coda.lastRun {
                    lastRunBaseline = serverLastRun
                }
            }
            // §02: every sync refreshes the complication timeline.
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            syncState = .queued(pending.count)
            queuedCount = pending.count
        }
    }

    /// The server is the PR source of truth: when the just-saved workout's
    /// sync response includes its PR verdict, it replaces the local estimate
    /// on the summary screen (they agree in the common case; the server wins
    /// on any drift — e.g. a web edit the watch hasn't seen).
    private func reconcileSummaryPRs(from response: WorkoutSyncResponse, matching externalId: String?) {
        guard
            let externalId,
            summary != nil,
            let serverResult = response.prs?.first(where: { $0.externalId == externalId })
        else { return }

        summary?.prs = serverResult.newPRs.map { pr in
            PRBaselines.SessionPR(
                exerciseId: pr.exercise,
                exerciseName: pr.exerciseName,
                kind: pr.kind,
                value: pr.value,
                previousValue: pr.previousValue
            )
        }.sorted { $0.exerciseName < $1.exerciseName }
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

    #if DEBUG
    /// Smoke-only: inject a local sequence so runners can be driven in the
    /// simulator before the backend carries that kind. Survives background
    /// refreshes (which replace `sequences` with the server list).
    private var debugInjected: [SequenceDef] = []
    public func debugInjectSequence(_ sequence: SequenceDef) {
        debugInjected.append(sequence)
        sequences.append(sequence)
    }
    #endif

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
