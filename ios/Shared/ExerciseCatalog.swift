// GENERATED from lib/exercises.ts — do not edit by hand.
// Regenerate with: node ios/scripts/gen-catalog.mjs
// 47 exercises, categories: kettlebell, barbell, dumbbell, bodyweight, machine.

import Foundation

public struct ExerciseDef: Codable, Hashable, Identifiable, Sendable {
    /// Canonical id — must match lib/exercises.ts exactly; stored in
    /// personal_records and written into workout exercises payloads.
    public let id: String
    public let name: String
    public let category: ExerciseCategory
    public let aliases: [String]
}

public enum ExerciseCategory: String, CaseIterable, Codable, Sendable {
    case kettlebell = "kettlebell"
    case barbell = "barbell"
    case dumbbell = "dumbbell"
    case bodyweight = "bodyweight"
    case machine = "machine"
}

public enum ExerciseCatalog {
    /// Generated built-ins (lib/exercises.ts).
    static let builtin: [ExerciseDef] = [
        ExerciseDef(id: "kb-swing", name: "Kettlebell Swing", category: .kettlebell, aliases: ["swing", "swings", "two hand swing", "russian swing", "american swing", "columpio", "balanceo", "kettlebell swings"]),
        ExerciseDef(id: "kb-one-arm-swing", name: "One-Arm Kettlebell Swing", category: .kettlebell, aliases: ["one arm swing", "single arm swing", "one hand swing"]),
        ExerciseDef(id: "kb-goblet-squat", name: "Goblet Squat", category: .kettlebell, aliases: ["goblet squats", "sentadilla goblet", "sentadilla copa"]),
        ExerciseDef(id: "kb-turkish-get-up", name: "Turkish Get-Up", category: .kettlebell, aliases: ["tgu", "get up", "get ups", "turkish get ups", "levantamiento turco"]),
        ExerciseDef(id: "kb-clean", name: "Kettlebell Clean", category: .kettlebell, aliases: ["clean", "cleans", "cargada"]),
        ExerciseDef(id: "kb-press", name: "Kettlebell Press", category: .kettlebell, aliases: ["kb press", "military press", "strict press", "overhead press kettlebell", "press militar", "press de hombro"]),
        ExerciseDef(id: "kb-clean-and-press", name: "Clean and Press", category: .kettlebell, aliases: ["clean & press", "clean press", "cleans and presses", "cargada y press"]),
        ExerciseDef(id: "kb-snatch", name: "Kettlebell Snatch", category: .kettlebell, aliases: ["snatch", "snatches", "arranque"]),
        ExerciseDef(id: "kb-row", name: "Kettlebell Row", category: .kettlebell, aliases: ["kb row", "single arm row", "remo con pesa rusa", "remo"]),
        ExerciseDef(id: "kb-deadlift", name: "Kettlebell Deadlift", category: .kettlebell, aliases: ["kb deadlift", "peso muerto con pesa rusa"]),
        ExerciseDef(id: "kb-front-squat", name: "Kettlebell Front Squat", category: .kettlebell, aliases: ["double front squat", "front squat kettlebell", "sentadilla frontal"]),
        ExerciseDef(id: "kb-lunge", name: "Kettlebell Lunge", category: .kettlebell, aliases: ["kb lunge", "racked lunge", "zancada con pesa"]),
        ExerciseDef(id: "kb-halo", name: "Kettlebell Halo", category: .kettlebell, aliases: ["halo", "halos"]),
        ExerciseDef(id: "kb-windmill", name: "Kettlebell Windmill", category: .kettlebell, aliases: ["windmill", "windmills", "molino"]),
        ExerciseDef(id: "kb-farmer-carry", name: "Farmer Carry", category: .kettlebell, aliases: ["farmers carry", "farmer's carry", "farmers walk", "loaded carry", "caminata del granjero"]),
        ExerciseDef(id: "kb-push-press", name: "Kettlebell Push Press", category: .kettlebell, aliases: ["push press", "envión"]),
        ExerciseDef(id: "kb-high-pull", name: "Kettlebell High Pull", category: .kettlebell, aliases: ["high pull", "high pulls"]),
        ExerciseDef(id: "kb-thruster", name: "Kettlebell Thruster", category: .kettlebell, aliases: ["thruster", "thrusters"]),
        ExerciseDef(id: "bench-press", name: "Bench Press", category: .barbell, aliases: ["flat bench", "barbell bench press", "press de banca", "press banca"]),
        ExerciseDef(id: "incline-press", name: "Incline Press", category: .barbell, aliases: ["incline bench", "incline bench press", "press inclinado"]),
        ExerciseDef(id: "back-squat", name: "Squat", category: .barbell, aliases: ["barbell squat", "back squat", "squats", "sentadilla", "sentadillas"]),
        ExerciseDef(id: "front-squat", name: "Front Squat", category: .barbell, aliases: ["barbell front squat"]),
        ExerciseDef(id: "deadlift", name: "Deadlift", category: .barbell, aliases: ["deadlifts", "conventional deadlift", "peso muerto"]),
        ExerciseDef(id: "romanian-deadlift", name: "Romanian Deadlift", category: .barbell, aliases: ["rdl", "romanian", "peso muerto rumano"]),
        ExerciseDef(id: "overhead-press", name: "Overhead Press", category: .barbell, aliases: ["ohp", "shoulder press", "press militar con barra"]),
        ExerciseDef(id: "barbell-row", name: "Barbell Row", category: .barbell, aliases: ["bent over row", "remo con barra"]),
        ExerciseDef(id: "hip-thrust", name: "Hip Thrust", category: .barbell, aliases: ["hip thrusts", "empuje de cadera"]),
        ExerciseDef(id: "bicep-curl", name: "Bicep Curl", category: .dumbbell, aliases: ["curls", "dumbbell curl", "curl de bíceps", "curl"]),
        ExerciseDef(id: "hammer-curl", name: "Hammer Curl", category: .dumbbell, aliases: ["hammer curls", "curl martillo"]),
        ExerciseDef(id: "lateral-raise", name: "Lateral Raise", category: .dumbbell, aliases: ["side raise", "lateral raises", "elevaciones laterales"]),
        ExerciseDef(id: "tricep-extension", name: "Tricep Extension", category: .dumbbell, aliases: ["overhead extension", "extensión de tríceps"]),
        ExerciseDef(id: "dumbbell-fly", name: "Dumbbell Fly", category: .dumbbell, aliases: ["flyes", "chest fly", "aperturas"]),
        ExerciseDef(id: "pull-up", name: "Pull-Up", category: .bodyweight, aliases: ["pullups", "pull ups", "chin up", "chin ups", "dominadas"]),
        ExerciseDef(id: "push-up", name: "Push-Up", category: .bodyweight, aliases: ["pushups", "push ups", "flexiones", "lagartijas"]),
        ExerciseDef(id: "dip", name: "Dip", category: .bodyweight, aliases: ["dips", "fondos"]),
        ExerciseDef(id: "plank", name: "Plank", category: .bodyweight, aliases: ["planks", "plancha"]),
        ExerciseDef(id: "lunge", name: "Lunge", category: .bodyweight, aliases: ["lunges", "walking lunge", "zancadas", "estocadas"]),
        ExerciseDef(id: "burpee", name: "Burpee", category: .bodyweight, aliases: ["burpees"]),
        ExerciseDef(id: "crunch", name: "Crunch", category: .bodyweight, aliases: ["crunches", "abdominales", "sit up", "situps"]),
        ExerciseDef(id: "lat-pulldown", name: "Lat Pulldown", category: .machine, aliases: ["pulldown", "jalón al pecho", "jalon"]),
        ExerciseDef(id: "seated-row", name: "Seated Row", category: .machine, aliases: ["cable row", "remo sentado"]),
        ExerciseDef(id: "leg-press", name: "Leg Press", category: .machine, aliases: ["prensa", "prensa de piernas"]),
        ExerciseDef(id: "leg-curl", name: "Leg Curl", category: .machine, aliases: ["hamstring curl", "curl femoral"]),
        ExerciseDef(id: "leg-extension", name: "Leg Extension", category: .machine, aliases: ["extensiones de pierna"]),
        ExerciseDef(id: "calf-raise", name: "Calf Raise", category: .machine, aliases: ["calf raises", "elevación de talones", "pantorrillas"]),
        ExerciseDef(id: "cable-fly", name: "Cable Fly", category: .machine, aliases: ["cable crossover", "cruce de poleas"]),
        ExerciseDef(id: "face-pull", name: "Face Pull", category: .machine, aliases: ["face pulls"]),
    ]

    /// AI-created customs from GET /api/mobile/exercises, set at runtime
    /// (persisted by the app for offline cold-starts). Setting them rebuilds
    /// the normalization index.
    public private(set) static var custom: [ExerciseDef] = []

    public static func setCustom(_ defs: [ExerciseDef]) {
        custom = defs
        cachedIndex = nil
    }

    public static var all: [ExerciseDef] { builtin + custom }

    /// Kettlebell first — the wrist picker's primary set.
    public static var kettlebell: [ExerciseDef] { all.filter { $0.category == .kettlebell } }

    public static func byId(_ id: String) -> ExerciseDef? {
        all.first { $0.id == id }
    }

    // MARK: - Normalization (ports normalizeExerciseName from lib/exercises.ts)

    /// Accent-fold + lowercase + strip punctuation, hyphens/underscores to
    /// spaces — the same folding the server applies before matching.
    static func fold(_ value: String) -> String {
        let lowered = value.lowercased()
            .folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en"))
        var out = ""
        for ch in lowered {
            if ch == "-" || ch == "_" {
                out.append(" ")
            } else if ch.isLetter || ch.isNumber || ch == " " {
                out.append(ch)
            } else {
                out.append(" ")
            }
        }
        return out.split(separator: " ").joined(separator: " ")
    }

    struct IndexEntry {
        let key: String
        let def: ExerciseDef
    }

    /// Longest keys first so "clean and press" wins over "clean" on the
    /// containment pass — mirrors the server index ordering. Rebuilt when
    /// customs change.
    private static var cachedIndex: [IndexEntry]?

    static var index: [IndexEntry] {
        if let cached = cachedIndex { return cached }
        var entries: [IndexEntry] = []
        for def in all {
            entries.append(IndexEntry(key: fold(def.name), def: def))
            entries.append(IndexEntry(key: def.id, def: def))
            entries.append(IndexEntry(key: fold(def.id), def: def))
            for alias in def.aliases {
                entries.append(IndexEntry(key: fold(alias), def: def))
            }
        }
        let built = entries.sorted { $0.key.count > $1.key.count }
        cachedIndex = built
        return built
    }

    /// Map a free-text exercise name (typed, spoken, or from history rows)
    /// to a catalog entry — exact fold-match first, then whole-word
    /// containment. Returns nil for unknown movements.
    public static func normalize(_ raw: String) -> ExerciseDef? {
        let folded = fold(raw)
        guard !folded.isEmpty else { return nil }

        for entry in index where entry.key == folded {
            return entry.def
        }
        let words = folded.split(separator: " ").map(String.init)
        for entry in index where entry.key.count >= 4 {
            let keyWords = entry.key.split(separator: " ").map(String.init)
            if keyWords.count <= words.count {
                for start in 0...(words.count - keyWords.count) {
                    if Array(words[start..<(start + keyWords.count)]) == keyWords {
                        return entry.def
                    }
                }
            }
        }
        return nil
    }
}
