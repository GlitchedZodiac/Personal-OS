// GENERATED from lib/exercises.ts — do not edit by hand.
// Regenerate with: node ios/scripts/gen-catalog.mjs
// 47 exercises, categories: kettlebell, barbell, dumbbell, bodyweight, machine.

import Foundation

public struct ExerciseDef: Hashable, Identifiable, Sendable {
    /// Canonical id — must match lib/exercises.ts exactly; stored in
    /// personal_records and written into workout exercises payloads.
    public let id: String
    public let name: String
    public let category: ExerciseCategory
}

public enum ExerciseCategory: String, CaseIterable, Sendable {
    case kettlebell = "kettlebell"
    case barbell = "barbell"
    case dumbbell = "dumbbell"
    case bodyweight = "bodyweight"
    case machine = "machine"
}

public enum ExerciseCatalog {
    public static let all: [ExerciseDef] = [
        ExerciseDef(id: "kb-swing", name: "Kettlebell Swing", category: .kettlebell),
        ExerciseDef(id: "kb-one-arm-swing", name: "One-Arm Kettlebell Swing", category: .kettlebell),
        ExerciseDef(id: "kb-goblet-squat", name: "Goblet Squat", category: .kettlebell),
        ExerciseDef(id: "kb-turkish-get-up", name: "Turkish Get-Up", category: .kettlebell),
        ExerciseDef(id: "kb-clean", name: "Kettlebell Clean", category: .kettlebell),
        ExerciseDef(id: "kb-press", name: "Kettlebell Press", category: .kettlebell),
        ExerciseDef(id: "kb-clean-and-press", name: "Clean and Press", category: .kettlebell),
        ExerciseDef(id: "kb-snatch", name: "Kettlebell Snatch", category: .kettlebell),
        ExerciseDef(id: "kb-row", name: "Kettlebell Row", category: .kettlebell),
        ExerciseDef(id: "kb-deadlift", name: "Kettlebell Deadlift", category: .kettlebell),
        ExerciseDef(id: "kb-front-squat", name: "Kettlebell Front Squat", category: .kettlebell),
        ExerciseDef(id: "kb-lunge", name: "Kettlebell Lunge", category: .kettlebell),
        ExerciseDef(id: "kb-halo", name: "Kettlebell Halo", category: .kettlebell),
        ExerciseDef(id: "kb-windmill", name: "Kettlebell Windmill", category: .kettlebell),
        ExerciseDef(id: "kb-farmer-carry", name: "Farmer Carry", category: .kettlebell),
        ExerciseDef(id: "kb-push-press", name: "Kettlebell Push Press", category: .kettlebell),
        ExerciseDef(id: "kb-high-pull", name: "Kettlebell High Pull", category: .kettlebell),
        ExerciseDef(id: "kb-thruster", name: "Kettlebell Thruster", category: .kettlebell),
        ExerciseDef(id: "bench-press", name: "Bench Press", category: .barbell),
        ExerciseDef(id: "incline-press", name: "Incline Press", category: .barbell),
        ExerciseDef(id: "back-squat", name: "Squat", category: .barbell),
        ExerciseDef(id: "front-squat", name: "Front Squat", category: .barbell),
        ExerciseDef(id: "deadlift", name: "Deadlift", category: .barbell),
        ExerciseDef(id: "romanian-deadlift", name: "Romanian Deadlift", category: .barbell),
        ExerciseDef(id: "overhead-press", name: "Overhead Press", category: .barbell),
        ExerciseDef(id: "barbell-row", name: "Barbell Row", category: .barbell),
        ExerciseDef(id: "hip-thrust", name: "Hip Thrust", category: .barbell),
        ExerciseDef(id: "bicep-curl", name: "Bicep Curl", category: .dumbbell),
        ExerciseDef(id: "hammer-curl", name: "Hammer Curl", category: .dumbbell),
        ExerciseDef(id: "lateral-raise", name: "Lateral Raise", category: .dumbbell),
        ExerciseDef(id: "tricep-extension", name: "Tricep Extension", category: .dumbbell),
        ExerciseDef(id: "dumbbell-fly", name: "Dumbbell Fly", category: .dumbbell),
        ExerciseDef(id: "pull-up", name: "Pull-Up", category: .bodyweight),
        ExerciseDef(id: "push-up", name: "Push-Up", category: .bodyweight),
        ExerciseDef(id: "dip", name: "Dip", category: .bodyweight),
        ExerciseDef(id: "plank", name: "Plank", category: .bodyweight),
        ExerciseDef(id: "lunge", name: "Lunge", category: .bodyweight),
        ExerciseDef(id: "burpee", name: "Burpee", category: .bodyweight),
        ExerciseDef(id: "crunch", name: "Crunch", category: .bodyweight),
        ExerciseDef(id: "lat-pulldown", name: "Lat Pulldown", category: .machine),
        ExerciseDef(id: "seated-row", name: "Seated Row", category: .machine),
        ExerciseDef(id: "leg-press", name: "Leg Press", category: .machine),
        ExerciseDef(id: "leg-curl", name: "Leg Curl", category: .machine),
        ExerciseDef(id: "leg-extension", name: "Leg Extension", category: .machine),
        ExerciseDef(id: "calf-raise", name: "Calf Raise", category: .machine),
        ExerciseDef(id: "cable-fly", name: "Cable Fly", category: .machine),
        ExerciseDef(id: "face-pull", name: "Face Pull", category: .machine),
    ]

    /// Kettlebell first — the wrist picker's primary set.
    public static let kettlebell: [ExerciseDef] = all.filter { $0.category == .kettlebell }

    public static func byId(_ id: String) -> ExerciseDef? {
        all.first { $0.id == id }
    }

    /// Exact-name lookup for mapping synced web workouts back to canonical
    /// ids on-watch (used when computing local PR baselines). Lowercased
    /// name/id match only — fuzzy alias matching stays server-side.
    public static func byLooseName(_ raw: String) -> ExerciseDef? {
        let folded = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return all.first {
            $0.id == folded || $0.name.lowercased() == folded
        }
    }
}
