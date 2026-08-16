// §05 App Intents — the five from the spec: "Start Block A" (any routine →
// pre-flight with weights, 3·2·1 on Start) · "Log ten swings at twenty-four"
// (into the live session or starts one; haptic confirm, no screen) · "Start
// a walk" (open goal) · "Log eighty-four point two kilos" (weight, §8 card)
// · "Log two eggs and toast" (food, §8 card). They also make the map
// assignable to the Ultra's Action button (Settings → Action Button →
// Shortcut) — watchOS offers no per-screen Action-button API to mirror the
// Double Tap map directly.
//
// Intents run in the app process; AppModel.shared is the live model.
// systemImageName below is Shortcuts-app chrome (Apple requires SF symbols
// there) — no Pitaya surface renders them, so the port gate is untouched.

#if os(watchOS)
import AppIntents
import SwiftUI

// MARK: - Routine entity (names must be entities to appear in Siri phrases)

struct RoutineEntity: AppEntity, Identifiable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Routine")
    static let defaultQuery = RoutineQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct RoutineQuery: EntityQuery {
    @MainActor
    func entities(for identifiers: [String]) async throws -> [RoutineEntity] {
        allRoutines().filter { identifiers.contains($0.id) }
    }

    @MainActor
    func suggestedEntities() async throws -> [RoutineEntity] {
        allRoutines()
    }

    @MainActor
    private func allRoutines() -> [RoutineEntity] {
        (AppModel.shared?.sequences ?? []).map {
            RoutineEntity(id: $0.id, name: $0.name)
        }
    }
}

// MARK: - 1 · Start <routine>

struct StartRoutineIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Routine"
    static let description = IntentDescription("Open a routine ready to start — weights confirmed, 3·2·1 on Start.")
    static let openAppWhenRun = true

    @Parameter(title: "Routine") var routine: RoutineEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let model = AppModel.shared else { return .result() }
        if let match = model.sequences.first(where: { $0.id == routine.id }) {
            // Pre-flight, not a blind start: the detail screen carries the
            // weights editor and its Start runs the 3·2·1.
            model.openSequence(match)
        } else {
            model.openSequences()
        }
        return .result()
    }
}

// MARK: - 2 · Log a set (haptic confirm, no screen)

struct LogSetIntent: AppIntent {
    static let title: LocalizedStringResource = "Log a Set"
    static let description = IntentDescription("Log reps at a weight — into the live session, or starts one.")
    static let openAppWhenRun = true

    @Parameter(title: "Reps") var reps: Int
    @Parameter(title: "Exercise") var exercise: String
    @Parameter(title: "Weight (kg)") var weightKg: Double

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let model = AppModel.shared else { return .result(dialog: "Open Pitaya first.") }

        if case .live(.kettlebell) = model.phase {
            // Already lifting — log straight in, haptics do the confirming.
        } else {
            await model.startWorkout(.kettlebell)
        }
        if let match = ExerciseCatalog.normalize(exercise) {
            model.currentExercise = match
        }
        model.weightKg = max(weightKg, 1)
        model.reps = max(reps, 1)
        model.logSet()
        return .result(dialog: "Logged \(max(reps, 1)) at \(Fmt.kg(max(weightKg, 1))) kg.")
    }
}

// MARK: - 3 · Start a walk (open goal)

struct StartWalkIntent: AppIntent {
    static let title: LocalizedStringResource = "Start a Walk"
    static let description = IntentDescription("Start an open-goal walk.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await AppModel.shared?.startWorkout(.walk)
        return .result()
    }
}

// MARK: - 4 · Log weight (§8 confirm card)

struct LogWeightIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Weight"
    static let description = IntentDescription("Log a body-weight reading — confirm on a card, crown nudges ±0.1.")
    static let openAppWhenRun = true

    @Parameter(title: "Weight (kg)") var weightKg: Double

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared?.presentVoiceWeight(weightKg)
        return .result()
    }
}

// MARK: - 5 · Log food (§8 confirm card)

struct LogFoodIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Food"
    static let description = IntentDescription("Log a meal by voice — Pitaya prices it on the phone.")
    static let openAppWhenRun = true

    @Parameter(title: "What did you eat?") var meal: String

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared?.presentVoiceFood(meal)
        return .result()
    }
}

// MARK: - Siri phrases

struct PitayaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartRoutineIntent(),
            phrases: [
                "Start \(\.$routine) in \(.applicationName)",
                "Run \(\.$routine) in \(.applicationName)",
            ],
            shortTitle: "Start Routine",
            systemImageName: "play.fill"
        )
        AppShortcut(
            intent: LogSetIntent(),
            phrases: [
                "Log a set in \(.applicationName)",
                "\(.applicationName) log a set",
            ],
            shortTitle: "Log a Set",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: StartWalkIntent(),
            phrases: [
                "Start a walk in \(.applicationName)",
                "\(.applicationName) start a walk",
            ],
            shortTitle: "Start a Walk",
            systemImageName: "figure.walk"
        )
        AppShortcut(
            intent: LogWeightIntent(),
            phrases: [
                "Log my weight in \(.applicationName)",
                "\(.applicationName) log weight",
            ],
            shortTitle: "Log Weight",
            systemImageName: "scalemass.fill"
        )
        AppShortcut(
            intent: LogFoodIntent(),
            phrases: [
                "Log food in \(.applicationName)",
                "\(.applicationName) log a meal",
            ],
            shortTitle: "Log Food",
            systemImageName: "fork.knife"
        )
    }
}
#endif
