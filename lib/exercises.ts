// Canonical exercise catalog — the shared vocabulary for voice logging, PR
// tracking, the workout plan generator's imageKeys, and (soon) on-wrist
// logging in the watch app, which mirrors these ids in Swift. Kettlebell
// movements are first-class; aliases cover English + Spanish and common
// phrasing variants heard through transcription.

export type ExerciseCategory =
  | "kettlebell"
  | "barbell"
  | "dumbbell"
  | "bodyweight"
  | "machine"
  | "cardio";

export interface ExerciseDef {
  /** Canonical id (stable — stored in personal_records and synced to watch). */
  id: string;
  name: string;
  category: ExerciseCategory;
  aliases: string[];
}

export const EXERCISE_CATALOG: ExerciseDef[] = [
  // ── Kettlebell ────────────────────────────────────────────────────────
  { id: "kb-swing", name: "Kettlebell Swing", category: "kettlebell", aliases: ["swing", "swings", "two hand swing", "russian swing", "american swing", "columpio", "balanceo", "kettlebell swings"] },
  { id: "kb-one-arm-swing", name: "One-Arm Kettlebell Swing", category: "kettlebell", aliases: ["one arm swing", "single arm swing", "one hand swing"] },
  { id: "kb-goblet-squat", name: "Goblet Squat", category: "kettlebell", aliases: ["goblet squats", "sentadilla goblet", "sentadilla copa"] },
  { id: "kb-turkish-get-up", name: "Turkish Get-Up", category: "kettlebell", aliases: ["tgu", "get up", "get ups", "turkish get ups", "levantamiento turco"] },
  { id: "kb-clean", name: "Kettlebell Clean", category: "kettlebell", aliases: ["clean", "cleans", "cargada"] },
  { id: "kb-press", name: "Kettlebell Press", category: "kettlebell", aliases: ["kb press", "military press", "strict press", "overhead press kettlebell", "press militar", "press de hombro"] },
  { id: "kb-clean-and-press", name: "Clean and Press", category: "kettlebell", aliases: ["clean & press", "clean press", "cleans and presses", "cargada y press"] },
  { id: "kb-snatch", name: "Kettlebell Snatch", category: "kettlebell", aliases: ["snatch", "snatches", "arranque"] },
  { id: "kb-row", name: "Kettlebell Row", category: "kettlebell", aliases: ["kb row", "single arm row", "remo con pesa rusa", "remo"] },
  { id: "kb-deadlift", name: "Kettlebell Deadlift", category: "kettlebell", aliases: ["kb deadlift", "peso muerto con pesa rusa"] },
  { id: "kb-front-squat", name: "Kettlebell Front Squat", category: "kettlebell", aliases: ["double front squat", "front squat kettlebell", "sentadilla frontal"] },
  { id: "kb-lunge", name: "Kettlebell Lunge", category: "kettlebell", aliases: ["kb lunge", "racked lunge", "zancada con pesa"] },
  { id: "kb-halo", name: "Kettlebell Halo", category: "kettlebell", aliases: ["halo", "halos"] },
  { id: "kb-windmill", name: "Kettlebell Windmill", category: "kettlebell", aliases: ["windmill", "windmills", "molino"] },
  { id: "kb-farmer-carry", name: "Farmer Carry", category: "kettlebell", aliases: ["farmers carry", "farmer's carry", "farmers walk", "loaded carry", "caminata del granjero"] },
  { id: "kb-push-press", name: "Kettlebell Push Press", category: "kettlebell", aliases: ["push press", "envión"] },
  { id: "kb-high-pull", name: "Kettlebell High Pull", category: "kettlebell", aliases: ["high pull", "high pulls"] },
  { id: "kb-thruster", name: "Kettlebell Thruster", category: "kettlebell", aliases: ["thruster", "thrusters"] },

  // ── Barbell / big lifts ───────────────────────────────────────────────
  { id: "bench-press", name: "Bench Press", category: "barbell", aliases: ["flat bench", "barbell bench press", "press de banca", "press banca"] },
  { id: "incline-press", name: "Incline Press", category: "barbell", aliases: ["incline bench", "incline bench press", "press inclinado"] },
  { id: "back-squat", name: "Squat", category: "barbell", aliases: ["barbell squat", "back squat", "squats", "sentadilla", "sentadillas"] },
  { id: "front-squat", name: "Front Squat", category: "barbell", aliases: ["barbell front squat"] },
  { id: "deadlift", name: "Deadlift", category: "barbell", aliases: ["deadlifts", "conventional deadlift", "peso muerto"] },
  { id: "romanian-deadlift", name: "Romanian Deadlift", category: "barbell", aliases: ["rdl", "romanian", "peso muerto rumano"] },
  { id: "overhead-press", name: "Overhead Press", category: "barbell", aliases: ["ohp", "shoulder press", "press militar con barra"] },
  { id: "barbell-row", name: "Barbell Row", category: "barbell", aliases: ["bent over row", "remo con barra"] },
  { id: "hip-thrust", name: "Hip Thrust", category: "barbell", aliases: ["hip thrusts", "empuje de cadera"] },

  // ── Dumbbell ──────────────────────────────────────────────────────────
  { id: "bicep-curl", name: "Bicep Curl", category: "dumbbell", aliases: ["curls", "dumbbell curl", "curl de bíceps", "curl"] },
  { id: "hammer-curl", name: "Hammer Curl", category: "dumbbell", aliases: ["hammer curls", "curl martillo"] },
  { id: "lateral-raise", name: "Lateral Raise", category: "dumbbell", aliases: ["side raise", "lateral raises", "elevaciones laterales"] },
  { id: "tricep-extension", name: "Tricep Extension", category: "dumbbell", aliases: ["overhead extension", "extensión de tríceps"] },
  { id: "dumbbell-fly", name: "Dumbbell Fly", category: "dumbbell", aliases: ["flyes", "chest fly", "aperturas"] },

  // ── Bodyweight ────────────────────────────────────────────────────────
  { id: "pull-up", name: "Pull-Up", category: "bodyweight", aliases: ["pullups", "pull ups", "chin up", "chin ups", "dominadas"] },
  { id: "push-up", name: "Push-Up", category: "bodyweight", aliases: ["pushups", "push ups", "flexiones", "lagartijas"] },
  { id: "dip", name: "Dip", category: "bodyweight", aliases: ["dips", "fondos"] },
  { id: "plank", name: "Plank", category: "bodyweight", aliases: ["planks", "plancha"] },
  { id: "lunge", name: "Lunge", category: "bodyweight", aliases: ["lunges", "walking lunge", "zancadas", "estocadas"] },
  { id: "burpee", name: "Burpee", category: "bodyweight", aliases: ["burpees"] },
  { id: "crunch", name: "Crunch", category: "bodyweight", aliases: ["crunches", "abdominales", "sit up", "situps"] },

  // ── Machine / cable ───────────────────────────────────────────────────
  { id: "lat-pulldown", name: "Lat Pulldown", category: "machine", aliases: ["pulldown", "jalón al pecho", "jalon"] },
  { id: "seated-row", name: "Seated Row", category: "machine", aliases: ["cable row", "remo sentado"] },
  { id: "leg-press", name: "Leg Press", category: "machine", aliases: ["prensa", "prensa de piernas"] },
  { id: "leg-curl", name: "Leg Curl", category: "machine", aliases: ["hamstring curl", "curl femoral"] },
  { id: "leg-extension", name: "Leg Extension", category: "machine", aliases: ["extensiones de pierna"] },
  { id: "calf-raise", name: "Calf Raise", category: "machine", aliases: ["calf raises", "elevación de talones", "pantorrillas"] },
  { id: "cable-fly", name: "Cable Fly", category: "machine", aliases: ["cable crossover", "cruce de poleas"] },
  { id: "face-pull", name: "Face Pull", category: "machine", aliases: ["face pulls"] },
];

const ACCENT_RE = /[̀-ͯ]/g;

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENT_RE, "")
    .replace(/[-_]/g, " ") // "get-ups" and "get ups" are the same movement
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexEntry {
  key: string;
  def: ExerciseDef;
}

let index: IndexEntry[] | null = null;

function buildIndex(): IndexEntry[] {
  if (index) return index;
  const entries: IndexEntry[] = [];
  for (const def of EXERCISE_CATALOG) {
    entries.push({ key: fold(def.name), def });
    entries.push({ key: def.id, def });
    entries.push({ key: fold(def.id), def });
    for (const alias of def.aliases) entries.push({ key: fold(alias), def });
  }
  // Longest keys first so "clean and press" wins over "clean" on substring
  // passes.
  entries.sort((a, b) => b.key.length - a.key.length);
  index = entries;
  return entries;
}

/**
 * Map a free-text exercise name (typed, spoken EN/ES, or AI-generated) to a
 * catalog entry. Exact fold-match first, then whole-word containment.
 * Returns null for unknown movements — callers keep the raw name.
 */
export function normalizeExerciseName(raw: string): ExerciseDef | null {
  const folded = fold(raw);
  if (!folded) return null;

  const entries = buildIndex();
  for (const entry of entries) {
    if (entry.key === folded) return entry.def;
  }
  for (const entry of entries) {
    if (entry.key.length < 4) continue;
    if (new RegExp(`(^|\\s)${entry.key}($|\\s)`).test(folded)) return entry.def;
  }
  return null;
}

export function getExerciseById(id: string): ExerciseDef | null {
  return EXERCISE_CATALOG.find((e) => e.id === id) ?? null;
}
