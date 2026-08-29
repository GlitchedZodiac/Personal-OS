// App-level state machine for the watch app: pairing → home → workout list /
// sequences → live → summary, plus the offline sync queue, the local PR
// engine, the EMOM runner, and the idle-nudge watchdog. Views stay thin;
// every action the UI can take routes through here (the DEBUG smoke harness
// drives these same methods, so self-smoke exercises real paths).

#if os(watchOS)
import CoreLocation
import Foundation
import HealthKit
import SwiftUI
import WatchKit
import WidgetKit

// MARK: - Routine disciplines

/// Michael's 2026-08-20 IA: the Workouts list splits saved routines by what
/// they're loaded with. "Kettlebell" means the routine uses a bell at all —
/// his words: "routines that don't use kettlebells will show there [weight
/// training]" — so any bell step claims the routine, and the gym days (leg
/// press, bench, machines) fall to Weight Training.
public enum WorkoutDiscipline: String, CaseIterable, Identifiable, Hashable, Sendable {
    case kettlebell, weights

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .kettlebell: return "Kettlebell"
        case .weights: return "Weight Training"
        }
    }

    /// Shown when the list is empty — routines are authored on the phone.
    public var emptyHint: String {
        switch self {
        case .kettlebell: return "Build a bell routine in Pitaya chat"
        case .weights: return "Build a gym routine in Pitaya chat"
        }
    }
}

// MARK: - Workout kinds

public enum WorkoutKind: String, CaseIterable, Identifiable {
    case kettlebell, walk, treadmill, run, hike, freestyle, other

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .kettlebell: return "Kettlebell"
        case .walk: return "Walk"
        case .treadmill: return "Treadmill"
        case .run: return "Run"
        case .hike: return "Hike"
        case .freestyle: return "Freestyle"
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
        // Freestyle's own vocabulary — the phone keys its "Describe what
        // this was →" affordance off this type.
        case .freestyle: return "freestyle"
        case .other: return "other"
        }
    }

    public var isOutdoor: Bool {
        switch self {
        case .walk, .run, .hike: return true
        case .kettlebell, .treadmill, .freestyle, .other: return false
        }
    }

    public var activityType: HKWorkoutActivityType {
        switch self {
        case .kettlebell: return .functionalStrengthTraining
        case .walk, .treadmill: return .walking
        case .run: return .running
        case .hike: return .hiking
        // Follow-alongs and improvised EMOMs read as interval work, which
        // is also what gives HealthKit its best calorie model for them.
        case .freestyle: return .highIntensityIntervalTraining
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
    /// §10 PR banner copy: "PR · Swing 32 kg — was 28".
    public let previousWeightKg: Double?
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
        case hikeMenu          // Michael's 2026-08-20 IA: new hike vs. a saved trail
        case sequences(WorkoutDiscipline) // design 06, split by discipline
        case sequenceDetail(SequenceDef) // design 07
        case live(WorkoutKind)           // freeform live pages
        case liveSequence(SequenceDef)   // EMOM ring or circuit runner by kind
        case summary
        case hrr                         // Round 3 §07 — post-save recovery screen
        case trailPrompt                 // Round 3 §05 — "Save this track?"
        case doubleTapCoach              // §05 1o — once, before first live session
        case voiceWeight                 // §08 2e — "HEARD · WEIGHT" confirm card
        case voiceFood                   // §08 — parsed food confirm card
        case ready                       // §07 2b — readiness verdict screen
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
    /// Time-in-zone for the freestyle session just finished — computed
    /// on-wrist, so the summary can show it before any sync.
    @Published public private(set) var freestyleZoneSeconds: [Int]?
    /// Server-served HR zone boundaries (Freestyle contract), last-good
    /// cached so an out-of-signal session still gets its time-in-zone.
    @Published public private(set) var zones: HeartRateZones?
    /// §08 voice-confirm card state (set by the App Intents).
    @Published public var voiceWeightKg: Double = 0
    @Published public private(set) var voiceFoodText: String = ""

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
    /// §10 minute-boundary wash (#3D1526, 120 ms in / 400 ms out).
    @Published public private(set) var emomBoundaryWash = false

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
    /// §07 — verdict only; reads the watch's own HealthKit, never the plan.
    let readiness = Readiness()

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
    /// The externalId whose PR verdict the summary is waiting on. Stored so
    /// the reconcile survives whichever serialized flight actually lands the
    /// response (a Save's items can ride a drain another caller started).
    private var pendingPRReconcileId: String?
    /// Round 3 §05 saved-trail target: set when a hike starts from a saved
    /// trail — ghost line on the live map, trailId on the sync item, and the
    /// end-of-run prompt is skipped (the run count just increments).
    @Published public private(set) var activeTrail: TrailSummary?
    public private(set) var activeTrailGhost: [CLLocationCoordinate2D] = []
    /// §05: the server's trail list, cached each refresh — the Hike submenu
    /// and the save-track suggestions read it.
    @Published public private(set) var trails: [TrailSummary] = []
    /// §05 prompt state: near-ranked suggestions (max 2) for the track just
    /// saved, and the success name once one lands.
    @Published public private(set) var trailSuggestions: [TrailSummary] = []
    @Published public private(set) var trailSaveSuccess: String?
    @Published public private(set) var trailSaving = false
    /// §07 streak seeds: set when THIS save extended the training streak
    /// ("◆ day N"); PR banners win, so it stays nil alongside one.
    @Published public private(set) var streakCelebration: Int?
    /// The synced item, kept so the late HRR capture can ride an idempotent
    /// re-sync (same externalId → server UPDATE).
    private var lastSavedItem: WorkoutSyncItem?
    /// §05 "Skip … never re-asks this session".
    private var trailPromptSkipped = false
    /// §08 Weight Training free session: 2.5 kg plate detents replace the
    /// bell rack on the logger's crown for this session only.
    @Published public private(set) var weightDetentOverride: [Double]?
    private var activeSequence: SequenceDef?
    private var engineTask: Task<Void, Never>?
    private var sequencePausedAccum: TimeInterval = 0
    private var sequencePauseStartedAt: Date?
    /// Last 50 server rows, retained for the §03 local deltas baseline.
    private var recentRows: [MobileWorkoutRow] = []
    private var recoveryTask: Task<Void, Never>?
    /// §05 1o: the start the coach interrupted, resumed on "Got it".
    private var pendingCoachAction: (() async -> Void)?

    /// The App Intents (§05/§08) reach the live model through this — the
    /// watch app runs its intents in-process.
    public private(set) static weak var shared: AppModel?

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
        zones = ZonesCache.load()
        // 2026-08-29: home paints from last-good lists instantly; the
        // parallel refresh settles the truth.
        if let cached = SequencesCache.load() { sequences = cached }
        if let cached = TrailsCache.load() { trails = cached }
        AppModel.shared = self
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
            Task { [weak self] in await self?.readiness.refresh() }
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

        // The five remaining fetches are independent — PARALLEL since
        // 2026-08-29 (they ran serially: six round trips of dead time on
        // every launch, pairing, and summary dismissal).
        async let zonesTask = api.fetchZones()
        async let sequencesTask = api.fetchSequences()
        async let trailsTask = api.fetchTrails()
        async let exercisesTask = api.fetchExercises()
        async let workoutsTask = api.fetchWorkouts(limit: 50)

        if let served = try? await zonesTask {
            zones = served.zones
            ZonesCache.save(served.zones)
        }

        if let list = try? await sequencesTask {
            sequences = list.sequences
            SequencesCache.save(list.sequences)
            #if DEBUG
            sequences.append(contentsOf: debugInjected)
            #endif
        }

        // §05: saved trails for the Hike submenu + save-track suggestions.
        if let list = try? await trailsTask {
            trails = list.trails
            TrailsCache.save(list.trails)
        }

        // AI-created custom exercises → merged into the catalog/normalizer,
        // cached for offline cold-starts.
        if let list = try? await exercisesTask {
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
            let list = try await workoutsTask
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

    // MARK: - §05 coach + §08 voice entry points

    /// "Got it" on the one-time coach → mark shown, resume the start it
    /// interrupted.
    public func finishDoubleTapCoach() {
        DoubleTapCoach.shared.coachShown = true
        let pending = pendingCoachAction
        pendingCoachAction = nil
        if let pending {
            Task { await pending() }
        } else {
            phase = .home
        }
    }

    /// "Log eighty-four point two kilos" → 2e confirm card.
    public func presentVoiceWeight(_ weightKg: Double) {
        voiceWeightKg = weightKg
        phase = .voiceWeight
    }

    /// "Log two eggs and toast" → food confirm card.
    public func presentVoiceFood(_ text: String) {
        voiceFoodText = text
        phase = .voiceFood
    }

    /// Log it → offline voice queue (no ingest endpoint on the mobile
    /// surface yet — filed; the card's "queued until sync" footer is true).
    public func confirmVoiceLog() {
        switch phase {
        case .voiceWeight:
            VoiceLogQueue.append(VoiceLogEntry(
                kind: "weight", weightKg: (voiceWeightKg * 10).rounded() / 10,
                text: nil, at: Date()
            ))
        case .voiceFood:
            VoiceLogQueue.append(VoiceLogEntry(
                kind: "food", weightKg: nil, text: voiceFoodText, at: Date()
            ))
        default:
            return
        }
        Haptics.key(.success)
        phase = .home
    }

    public func dismissVoiceLog() { phase = .home }

    /// §05: EMOM Double Tap — "move done early", recording real work seconds
    /// into stepSeconds[] (sync payload) and the round tape (§03).
    public func markEmomDone() {
        guard case .liveSequence(let sequence) = phase, sequence.kind == "emom",
              emomRound >= 1 else { return }
        let index = emomRound - 1
        if emomRoundSeconds.count <= index {
            emomRoundSeconds.append(
                contentsOf: Array(repeating: 0, count: index + 1 - emomRoundSeconds.count)
            )
        }
        guard emomRoundSeconds[index] == 0 else { return } // first tap counts
        let work = max(60 - emomSecondsLeft, 1)
        emomRoundSeconds[index] = work
        let stepCount = max(sequence.steps.count, 1)
        let stepIndex = (emomRound - 1) % stepCount
        if circuitStepSeconds.indices.contains(stepIndex) {
            circuitStepSeconds[stepIndex] += work
        }
        markActivity()
        Haptics.minor(.click)
    }

    // MARK: - Navigation

    public func openWorkoutList() { phase = .workoutList }
    public func openSettings() { phase = .settings }
    public func openReady() { phase = .ready }
    public func openHikeMenu() { phase = .hikeMenu }
    /// Kettlebell and Weight Training both land straight on their routine
    /// list — no intermediate "space" screen (his 08-20 note: "I click on
    /// weight training, and I have the routines drop down that I get to pick").
    public func openSequences(_ discipline: WorkoutDiscipline) {
        phase = .sequences(discipline)
    }
    public func openSequence(_ sequence: SequenceDef) {
        loadWeightOverrides(for: sequence)
        phase = .sequenceDetail(sequence)
    }
    public func backToHome() { phase = .home }
    public func backToWorkoutList() { phase = .workoutList }
    public func backToSequences(_ discipline: WorkoutDiscipline) {
        phase = .sequences(discipline)
    }

    // MARK: - Routine disciplines

    /// Which list a routine belongs in. A single bell step claims the whole
    /// routine for Kettlebell; everything else — barbell, dumbbell, machine,
    /// bodyweight, unrecognised — is Weight Training. Steps resolve through
    /// the generated catalog (which already carries his AI-created customs),
    /// with a name fallback so a routine full of movements the catalog has
    /// never heard of still lands correctly if it says "bell" on the tin.
    public func discipline(of sequence: SequenceDef) -> WorkoutDiscipline {
        let usesBell = sequence.steps.contains { step in
            if ExerciseCatalog.byId(step.exercise)?.category == .kettlebell { return true }
            if ExerciseCatalog.normalize(step.exerciseName)?.category == .kettlebell { return true }
            return false
        }
        if usesBell { return .kettlebell }

        // Nothing resolved to a bell — before calling it a gym day, check the
        // words themselves (a routine of customs the catalog can't place).
        let resolved = sequence.steps.contains { ExerciseCatalog.byId($0.exercise) != nil }
        if !resolved {
            let haystack = ([sequence.name] + sequence.steps.map(\.exerciseName))
                .joined(separator: " ")
                .lowercased()
            for needle in ["kettlebell", "kb ", "bell", "swing", "goblet", "turkish", "snatch"] {
                if haystack.contains(needle) { return .kettlebell }
            }
        }
        return .weights
    }

    /// The routine list behind Kettlebell / Weight Training.
    public func sequences(for discipline: WorkoutDiscipline) -> [SequenceDef] {
        sequences.filter { self.discipline(of: $0) == discipline }
    }

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
    /// `trail` (§05) makes the session a saved-trail run: ghost line on the
    /// map, trailId on the sync item, end prompt skipped.
    public func startWorkout(
        _ kind: WorkoutKind, useRecorder: Bool = true, trail: TrailSummary? = nil,
        plateDetents: Bool = false
    ) async {
        // §05 1o: the one-time coach interrupts the first-ever live session
        // (real sessions only — the headless smoke path skips it).
        if useRecorder, !DoubleTapCoach.shared.coachShown {
            pendingCoachAction = { [weak self] in
                await self?.startWorkout(kind, trail: trail, plateDetents: plateDetents)
            }
            phase = .doubleTapCoach
            return
        }
        resetLiveState()
        if plateDetents {
            // §08: bar work dials in 2.5 kg plate steps, not bell stops.
            weightDetentOverride = stride(from: 2.5, through: 200, by: 2.5).map { $0 }
        }
        if let trail {
            activeTrail = trail
            activeTrailGhost = trail.summaryPolyline.map { polyline in
                Polyline.decode(polyline).map {
                    CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)
                }
            } ?? []
        }
        if kind == .kettlebell {
            reps = WatchPrefs.shared.startRepsAt == .lastLogged
                ? WatchPrefs.shared.lastLoggedReps : 10
        }
        phase = .live(kind)
        guard useRecorder else { return }
        // A recovery window still watching the previous session yields first.
        await recorder.abortRecoveryIfNeeded()
        // Round 3 §00: served boundaries feed the chips + ZonePublisher.
        recorder.hrZones = zones
        await runCountdown()
        workoutStartedAt = Date()
        do {
            try await recorder.start(
                activityType: kind.activityType, outdoor: kind.isOutdoor,
                captureAltitude: kind == .freestyle ? true : nil
            )
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
            isWeightPR: result.isWeightPR,
            previousWeightKg: result.previousWeightKg
        )
        loggedSets.append(set)
        markActivity()
        WatchPrefs.shared.lastLoggedReps = reps

        if result.isWeightPR {
            // §06: the PR lands as a marker in the Health session tape.
            recorder.addMarker(
                name: "PR · \(set.exercise.name) \(Fmt.kg(set.weightKg)) kg", at: set.at
            )
            // §10: PR haptic is .success + .directionUp.
            Haptics.key(.success)
            Haptics.key(.directionUp)
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

    /// §05: the PR flash owns the Double Tap while visible — Dismiss.
    public func dismissPRFlash() {
        prFlashTask?.cancel()
        prFlash = nil
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
        // Round 3 §07 opened the 60 s recovery window to EVERY kind with a
        // live recorder (it was kettlebell-only) — the post-save HRR screen
        // rides it, and the sensors freeze at End either way.
        let totals = await beginRecoveryOrFinish()

        // Phantom guard (2026-08-29, his call: auto-discard silently): an
        // accidental start — under 4 minutes with nothing logged and no real
        // ground covered — never reaches the summary and never syncs. Six
        // 1-minute stubs were polluting his session counts.
        let elapsed = totals?.durationSeconds ?? recorder.elapsed
        let covered = totals?.distanceMeters ?? 0
        // Smokes are exempt via their existing marker — a 65 s scripted walk
        // must still reach save.
        if elapsed < 240, loggedSets.isEmpty, covered < 150,
           externalSourceOverride == nil {
            recoveryTask?.cancel()
            recoveryTask = nil
            Task { await recorder.abortRecoveryIfNeeded() }
            #if DEBUG
            print("PITAYA-SMOKE: phantom auto-discarded \(Int(elapsed))s \(kind.rawValue)")
            #endif
            Haptics.minor(.click)
            resetLiveState()
            clearSummaryExtras()
            phase = .home
            return
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
            #if DEBUG
            print("PITAYA-SMOKE: recoveryTask capture=\(String(describing: capture?.drop)) cancelled=\(Task.isCancelled) phase=\(String(describing: self?.phase))")
            #endif
            guard let self, !Task.isCancelled else { return }
            // Surface it anywhere in this session's post-workout chain —
            // summary, the HRR screen itself, or the trail prompt.
            let stillHere: Bool
            switch self.phase {
            case .summary, .hrr, .trailPrompt: stillHere = true
            default: stillHere = false
            }
            if stillHere, self.workoutStartedAt == sessionToken,
               let capture, capture.drop > 0 {
                self.recoveryCapture = capture
                Haptics.key(.success) // §07: HRR-done
                self.attachHRR(capture)
            } else if case .hrr = self.phase, self.workoutStartedAt == sessionToken {
                // No qualifying descent (HR rose, sensor gap, HK close timed
                // out) — there's no verdict to show, but the screen must
                // still resolve: advance the post-save chain instead of
                // stranding RECOVERY · 0:00 until a manual Skip.
                await self.finishHRR()
            }
        }
        return totals
    }

    /// §07: hrrDelta/hrrSeconds ride metricsData. The capture can land up to
    /// 60 s AFTER the item was built — patch the pending item in place, or
    /// re-enqueue the already-synced item (same externalId → the server's
    /// unique upsert makes the re-sync an idempotent UPDATE).
    private func attachHRR(_ capture: WorkoutRecorder.RecoveryCapture) {
        if let item = pendingItem {
            let metrics = (item.metricsData ?? WorkoutMetricsData())
                .withHRR(delta: capture.drop, seconds: 60)
            pendingItem = item.replacingMetrics(metrics)
            return
        }
        guard let item = lastSavedItem else { return }
        let metrics = (item.metricsData ?? WorkoutMetricsData())
            .withHRR(delta: capture.drop, seconds: 60)
        let updated = item.replacingMetrics(metrics)
        lastSavedItem = updated
        Task { [weak self] in
            guard let self, let queue = self.queue else { return }
            try? await queue.enqueue(updated)
            // Straight through the flight, NOT drainQueue — the summary is
            // already showing "synced" and this quiet enrichment must not
            // flicker the CTA back to Saving…. Offline just leaves it
            // queued for the next drain.
            _ = await WorkoutSyncFlight.run(queue: queue, api: self.api)
        }
    }

    // MARK: - Sequence (EMOM) flow

    public func startSequence(_ sequence: SequenceDef, useRecorder: Bool = true) async {
        if useRecorder, !DoubleTapCoach.shared.coachShown {
            pendingCoachAction = { [weak self] in await self?.startSequence(sequence) }
            phase = .doubleTapCoach
            return
        }
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
            recorder.hrZones = zones
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
                // §10: each of the last 3 s pulses the digits + .click.
                if (1...3).contains(left) { Haptics.minor(.click) }
            }
            if !Task.isCancelled {
                // §10: :00 → accent GO pop (0.5 s) + .success, then work.
                Haptics.key(.success)
                try? await Task.sleep(nanoseconds: 600_000_000)
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
                        // §10 boundary: wash 120 ms in / 400 ms out,
                        // haptic .start ×2.
                        emomBoundaryWash = true
                        Haptics.key(.start)
                        Task { [weak self] in
                            try? await Task.sleep(nanoseconds: 120_000_000)
                            self?.emomBoundaryWash = false
                            try? await Task.sleep(nanoseconds: 60_000_000)
                            Haptics.key(.start)
                        }
                    }
                    emomRound = round
                    markActivity()
                }
                // 2026-08-29: only publish when the displayed second actually
                // changes — the 250 ms loop was invalidating the whole view
                // tree at 4 Hz for a 1 Hz value.
                let secondsLeft = 60 - (Int(elapsed) % 60)
                if secondsLeft != emomSecondsLeft { emomSecondsLeft = secondsLeft }
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
        // §05: a saved-trail run baselines against the trail's last run
        // instead — "vs your last run here".
        lastRunBaseline = sequence.flatMap { localLastRun(sequenceId: $0.id, before: started) }
            ?? activeTrail?.lastRun.map { last in
                LastRunStats(
                    startedAt: last.startedAt,
                    durationMinutes: last.durationMinutes,
                    volumeKg: 0,
                    caloriesBurned: nil,
                    avgHeartRateBpm: last.avgHeartRateBpm,
                    roundsCompleted: nil
                )
            }

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
        // Freestyle ships a self-contained payload (contract: downsample to
        // ≤200 points on-wrist, compute timeInZones from the server's
        // boundaries) so the phone's analytics render it without any
        // server-side enrichment. Every other kind keeps the streams
        // contract: raw up, server computes.
        let isFreestyle = kind == .freestyle
        let rawHR = recorder.hrStream
        let rawTime = recorder.timeStream
        let rawAltitude = recorder.altitudeStream

        let zoneBreakdown: WorkoutZoneBreakdown? = isFreestyle
            ? zones.flatMap { StreamMath.timeInZones(hr: rawHR, time: rawTime, zones: $0) }
            : nil
        // 2026-08-29: non-freestyle used to ship RAW second-by-second
        // arrays (~3×3600 ints for an hour) that the server immediately
        // reduced to ≤120 — ≤600 keeps full analytic headroom at a sixth
        // of the payload.
        let hrStream = isFreestyle
            ? StreamMath.downsample(rawHR)
            : StreamMath.downsample(rawHR, limit: 600)
        let timeStream = isFreestyle
            ? StreamMath.downsample(rawTime)
            : StreamMath.downsample(rawTime, limit: 600)
        let altitudeStream = isFreestyle
            ? StreamMath.downsample(rawAltitude)
            : StreamMath.downsample(rawAltitude, limit: 600)

        freestyleZoneSeconds = zoneBreakdown?.seconds

        let metrics = WorkoutMetricsData(
            sequenceId: sequence?.id,
            sequenceName: sequence?.name,
            roundsCompleted: rounds,
            stepSeconds: circuitStepSeconds.contains(where: { $0 > 0 })
                ? circuitStepSeconds : nil,
            hrStream: hrStream.isEmpty ? nil : hrStream,
            timeStream: hrStream.isEmpty ? nil : timeStream,
            altitudeStream: altitudeStream.isEmpty ? nil : altitudeStream,
            timeInZones: zoneBreakdown,
            elevationGainM: isFreestyle && recorder.elevationGain > 1
                ? (recorder.elevationGain * 10).rounded() / 10 : nil,
            // §07: per-km seconds banked live on the wrist.
            splits: recorder.splitSeconds.isEmpty ? nil : recorder.splitSeconds,
            avgCadenceSpm: recorder.avgCadenceSpm
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
            deviceType: "apple_watch",
            // §05: a saved-trail run carries its trail — the server links
            // the row and the run count increments.
            trailId: activeTrail?.id
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
        guard let item = pendingItem, syncState != .syncing else { return }
        // Flip the UI before the first await — the dead window between the
        // tap and any visible state change is what invited second taps.
        syncState = .syncing
        do {
            guard let queue else { throw CocoaError(.fileWriteUnknown) }
            try await queue.enqueue(item)
        } catch {
            // Keep pendingItem so Save reappears and a retry re-enqueues.
            // The old `try?` here dropped the workout silently and left the
            // button a permanent no-op.
            syncState = .failed("couldn't save — try again")
            Haptics.key(.failure)
            return
        }
        pendingItem = nil
        lastSavedItem = item
        await drainQueue(reconcilePRsFor: item.externalId)

        // ——— Round 3 post-save chain (the "full sequence", locked) ———
        // synced → streak seeds (PR wins) → HRR screen while the 60 s
        // window is still live → save-track prompt (outdoor, +600 ms,
        // skipped for queued saves and saved-trail runs) → summary/home.
        if syncState == .synced {
            celebrateStreakIfExtended(savedAt: item.startedAt)
        }
        if recorder.isInRecovery,
           let endsAt = recorder.recoveryEndsAt, endsAt > Date(),
           summary?.avgHeartRate != nil {
            phase = .hrr
            return // finishHRR() carries the chain on
        }
        await continuePostSaveChain()
    }

    /// The chain after the (optional) HRR screen: trail prompt, then the
    /// original zones-or-leave behavior.
    private func continuePostSaveChain() async {
        if syncState == .synced, !trailPromptSkipped, activeTrail == nil,
           summary?.kind.isOutdoor == true,
           let item = lastSavedItem,
           let points = item.routeData?.points, points.count > 1 {
            // §05: 600 ms after the save confirms.
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard case .summary = phase else { return } // he may have moved on
            prepareTrailPrompt(track: points, item: item)
            phase = .trailPrompt
            return
        }
        await settleSummary()
    }

    /// His 08-20 note: "I should just be able to click save, maybe a
    /// confirmation, and then it goes." Freestyle holds every number the
    /// screen will ever show, so it confirms and leaves; everything else
    /// fetches its zones card and keeps Done.
    private func settleSummary() async {
        if summaryNeedsNothingFurther {
            await confirmSaveAndLeave()
            return
        }
        if let externalId = lastSavedItem?.externalId {
            await loadSummaryZones(externalId: externalId)
        }
    }

    // MARK: - §07 HRR screen handoff

    /// Verdict shown (or Skip): back to the summary, chain continues. The
    /// capture itself keeps running off-screen either way — skipping the
    /// screen never skips the data.
    public func finishHRR() async {
        guard case .hrr = phase else { return }
        phase = .summary
        await continuePostSaveChain()
    }

    // MARK: - §05 save-track prompt

    private func prepareTrailPrompt(track: [RoutePoint], item: WorkoutSyncItem) {
        trailSaveSuccess = nil
        trailSaving = false
        guard let start = track.first else {
            trailSuggestions = []
            return
        }
        let end = track.last
        // Rank the cached list locally (same rule the server uses: trailhead
        // within ~300 m, similar length strengthens) — max 2, best first.
        let distance = item.distanceMeters
        trailSuggestions = Array(
            trails
                .compactMap { trail -> (TrailSummary, Double)? in
                    guard let lat = trail.startLat, let lng = trail.startLng else { return nil }
                    let gap = Self.haversineMeters(
                        lat1: lat, lng1: lng, lat2: start.lat, lng2: start.lng
                    )
                    guard gap <= 300 else { return nil }
                    // Direction awareness (2026-08-29): when both ends are
                    // known, a track that ENDS far from the trail's end is
                    // a different traversal — the descent bug.
                    if let tEndLat = trail.endLat, let tEndLng = trail.endLng, let end {
                        let endGap = Self.haversineMeters(
                            lat1: tEndLat, lng1: tEndLng, lat2: end.lat, lng2: end.lng
                        )
                        guard endGap <= 300 else { return nil }
                    }
                    var score = 1 - gap / 300
                    if let mine = distance, let theirs = trail.distanceMeters, theirs > 0 {
                        let rel = abs(mine - theirs) / theirs
                        if rel <= 0.2 { score += 1 - rel }
                    }
                    return (trail, score)
                }
                .sorted { $0.1 > $1.1 }
                .prefix(2)
                .map { pair in Self.stamped(pair.0, matchPct: Int(min(0.99, pair.1 / 2) * 100)) }
        )
    }

    /// TrailSummary is a decoded server row — the local ranking re-stamps
    /// matchPct the same way the server's near query would.
    private static func stamped(_ trail: TrailSummary, matchPct: Int) -> TrailSummary {
        TrailSummary(
            id: trail.id, name: trail.name, aliases: trail.aliases,
            distanceMeters: trail.distanceMeters, elevationGainM: trail.elevationGainM,
            summaryPolyline: trail.summaryPolyline, startLat: trail.startLat,
            startLng: trail.startLng, endLat: trail.endLat, endLng: trail.endLng,
            runCount: trail.runCount,
            lastRun: trail.lastRun, matchPct: max(50, matchPct)
        )
    }

    /// Suggestion row tapped, or a dictated name submitted.
    public func saveTrack(trailId: String? = nil, name: String? = nil) async {
        guard let item = lastSavedItem, !trailSaving else { return }
        trailSaving = true
        defer { trailSaving = false }
        do {
            let result = try await api.saveTrail(
                name: name, trailId: trailId, workoutExternalId: item.externalId
            )
            Haptics.key(.success)
            trailSaveSuccess = result.trail.name
            if let refreshed = try? await api.fetchTrails() { trails = refreshed.trails }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard case .trailPrompt = phase else { return }
            phase = .summary
            await settleSummary()
        } catch {
            // Server unreachable mid-prompt: fall back to the summary — the
            // workout is saved either way, and chat can name it later.
            Haptics.key(.failure)
            phase = .summary
            await settleSummary()
        }
    }

    /// §05 Skip — stores nothing, never re-asks this session.
    public func skipTrailPrompt() async {
        trailPromptSkipped = true
        guard case .trailPrompt = phase else { return }
        phase = .summary
        await settleSummary()
    }

    // MARK: - §07 streak seeds

    /// "Save extends streak": this is the first session today AND yesterday
    /// trained → seeds + "◆ day N". Local computation over the cached rows —
    /// the served streak is the food streak, a different thing on purpose.
    private func celebrateStreakIfExtended(savedAt: Date) {
        guard summary?.prs.isEmpty != false else { return } // PR banner wins
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: savedAt)
        let trainedDays = Set(recentRows.map { calendar.startOfDay(for: $0.startedAt) })
        guard !trainedDays.contains(today) else { return } // not the first today
        guard let yesterday = calendar.date(byAdding: .day, value: -1, to: today),
              trainedDays.contains(yesterday)
        else { return }
        var days = 2
        var cursor = yesterday
        while let previous = calendar.date(byAdding: .day, value: -1, to: cursor),
              trainedDays.contains(previous) {
            days += 1
            cursor = previous
        }
        streakCelebration = days
    }

    private static func haversineMeters(
        lat1: Double, lng1: Double, lat2: Double, lng2: Double
    ) -> Double {
        let r = 6_371_000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLng = (lng2 - lng1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180)
            * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * asin(min(1, sqrt(a)))
    }

    /// True when saving cannot add anything to the summary screen.
    private var summaryNeedsNothingFurther: Bool {
        summary?.kind == .freestyle || freestyleZoneSeconds != nil
    }

    /// Mint check + success tap, held long enough to read, then home. The
    /// workout is safe either way — a failed sync leaves it queued on disk
    /// (drainQueue never drops it), which the confirmation says out loud.
    private func confirmSaveAndLeave() async {
        guard case .summary = phase else { return }
        switch syncState {
        case .synced, .queued:
            Haptics.key(.success)
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            // A Double Tap or an App Intent may have moved him meanwhile.
            guard case .summary = phase else { return }
            dismissSummary()
        default:
            // Nothing else reaches here today (drainQueue only ever lands on
            // .synced or .queued) — but if it ever does, leave the screen up
            // rather than dismissing a workout he can't see the state of.
            break
        }
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
        // 2026-08-29: leaving the summary used to re-run the whole
        // six-fetch refresh — only workouts + PRs can have changed here.
        Task { await refreshWorkoutsAndPRs() }
    }

    /// The targeted post-save refresh: history rows + PR baselines only.
    private func refreshWorkoutsAndPRs() async {
        async let prsTask = api.fetchPRs()
        async let workoutsTask = api.fetchWorkouts(limit: 50)
        if let prList = try? await prsTask {
            baselines = PRBaselines(records: prList.records)
            prExerciseCount = Set(prList.records.map(\.exercise)).count
            await prCache?.save(baselines.best)
        }
        if let list = try? await workoutsTask {
            recentRows = list.entries
            historyCount = list.entries.count
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func clearSummaryExtras() {
        lastRunBaseline = nil
        recoveryCapture = nil
        summaryZones = nil
        freestyleZoneSeconds = nil
        emomRoundSeconds = []
        emomPRRound = nil
        // Round 3 session-scoped state.
        activeTrail = nil
        activeTrailGhost = []
        trailSuggestions = []
        trailSaveSuccess = nil
        trailSaving = false
        trailPromptSkipped = false
        streakCelebration = nil
        lastSavedItem = nil
    }

    #if DEBUG
    // MARK: - Smoke seams (DEBUG builds only)

    /// The unsaved summary's idempotency key, exposed so the DOUBLESAVE
    /// smoke can count its rows server-side after the race.
    var pendingItemExternalId: String? { pendingItem?.externalId }

    /// Server-side truth for the smoke: how many rows carry this externalId.
    func debugCountWorkouts(externalId: String) async -> Int? {
        guard let list = try? await api.fetchWorkouts(limit: 20) else { return nil }
        return list.entries.filter { $0.externalId == externalId }.count
    }
    #endif

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
        weightDetentOverride = nil
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

    /// Scheduled background wake: push the queue, refresh the face. Kept
    /// deliberately light — the widget runs its own fetch when its timeline
    /// reloads, so this never needs the full history refresh.
    public func backgroundRefresh() async {
        await drainQueue()
        WidgetCenter.shared.reloadAllTimelines()
    }

    public func drainQueue(reconcilePRsFor externalId: String? = nil) async {
        guard let queue else { return }
        if let externalId { pendingPRReconcileId = externalId }
        queuedCount = await queue.count()
        guard queuedCount > 0 else {
            // A serialized flight elsewhere can drain the queue between a
            // Save's enqueue and this count — the items are safe on the
            // server; never leave that Save stuck on the spinner.
            if syncState == .syncing {
                syncState = .synced
                lastSyncCheckAt = Date()
            }
            return
        }

        syncState = .syncing
        // Every drain in the process — including the cold-wake standalone
        // path — serializes through WorkoutSyncFlight; overlapping drains
        // were the duplicate-save race.
        let outcome = await WorkoutSyncFlight.run(queue: queue, api: api)
        if let response = outcome.response {
            syncState = .synced
            queuedCount = 0
            lastSyncCheckAt = Date()
            reconcileSummaryPRs(from: response, matching: pendingPRReconcileId)
            pendingPRReconcileId = nil
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
        } else if outcome.pendingCount > 0 {
            syncState = .queued(outcome.pendingCount)
            queuedCount = outcome.pendingCount
        } else {
            // Our items rode a flight we queued behind: pushed, but the
            // response went to that caller. Only this save's PR reconcile
            // and codas are skipped — the local estimates stand.
            syncState = .synced
            queuedCount = 0
            lastSyncCheckAt = Date()
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
