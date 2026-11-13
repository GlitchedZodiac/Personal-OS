// What a movement IS (2026-11-12, MCP v2 Phase C — Michael's ask: "if the
// app doesn't understand a workout type, will MCP not only give it the
// workout but also explain it so the library gets built?").
//
// When Pitaya meets a movement it doesn't know, it is minted with a name and
// a guessed category — a bare line. The profile is the context Claude adds
// in the same conversation, from its own knowledge, a web search or the
// video he named: how it's performed, its movement pattern, the muscles,
// the equipment, what it's a variant of, a few cues, and where that came
// from. Pitaya does no searching itself; it checks the shape and stores it.
//
// Client-safe (no Prisma): lib/exercises.ts carries profiles on its defs.

export const PATTERNS = [
  "hinge",
  "squat",
  "lunge",
  "push-horizontal",
  "push-vertical",
  "pull-horizontal",
  "pull-vertical",
  "carry",
  "core",
  "rotation",
  "locomotion",
  "plyometric",
  "conditioning",
  "mobility",
  "complex",
] as const;

export const MUSCLES = [
  "glutes", "hamstrings", "quads", "adductors", "abductors", "calves", "hip-flexors",
  "lower-back", "upper-back", "lats", "traps", "rhomboids",
  "front-delts", "side-delts", "rear-delts", "rotator-cuff",
  "chest", "upper-chest", "triceps", "biceps", "forearms", "grip",
  "abs", "obliques", "core", "neck", "full-body", "cardiovascular",
] as const;

export const EQUIPMENT = [
  "kettlebell", "dumbbell", "barbell", "bodyweight", "vest", "band", "cable", "machine",
  "bench", "box", "jump-rope", "sandbag", "plate", "rings", "pull-up-bar", "mat", "other",
] as const;

export type Pattern = (typeof PATTERNS)[number];
export type Muscle = (typeof MUSCLES)[number];
export type Equipment = (typeof EQUIPMENT)[number];

export interface ExerciseProfile {
  /** How it's performed, in plain words. */
  description: string;
  pattern: Pattern;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  unilateral: boolean;
  /** Exercise id this is a variation of ("thrust jerk" → "jerk"). Groups for analysis; never merges history. */
  variantOf?: string;
  cues?: string[];
  /** https only — the video or page the explanation came from. */
  sourceUrl?: string;
  /** e.g. "Lebe Stark 35-min follow-along, minute 12". */
  sourceNote?: string;
  describedAt: string;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

function list<T extends string>(
  field: string,
  v: unknown,
  vocab: readonly T[],
  min: number,
  max: number
): { value: T[] } | { error: string } {
  if (v === undefined && min === 0) return { value: [] };
  if (!Array.isArray(v)) return { error: `profile.${field} must be a list` };
  const out: T[] = [];
  for (const item of v) {
    if (typeof item !== "string" || !vocab.includes(item as T)) {
      return { error: `profile.${field}: "${String(item)}" is not one of ${vocab.join(", ")}` };
    }
    if (!out.includes(item as T)) out.push(item as T);
  }
  if (out.length < min || out.length > max) return { error: `profile.${field} needs ${min}–${max} entries` };
  return { value: out };
}

/**
 * Check a profile from Claude. `exists(id)` says whether `variantOf` names a
 * real movement; `selfId` stops a movement being a variant of itself.
 */
export function validateProfile(
  input: unknown,
  opts: { exists: (id: string) => boolean; selfId?: string; now?: Date }
): { profile: ExerciseProfile } | { error: string } {
  if (!isObj(input)) return { error: "profile must be an object" };
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 10 || description.length > 600) {
    return { error: "profile.description must say how the movement is done in 10–600 characters" };
  }
  if (typeof input.pattern !== "string" || !PATTERNS.includes(input.pattern as Pattern)) {
    return { error: `profile.pattern must be one of ${PATTERNS.join(", ")}` };
  }
  const primary = list("primaryMuscles", input.primaryMuscles, MUSCLES, 1, 6);
  if ("error" in primary) return primary;
  const secondary = list("secondaryMuscles", input.secondaryMuscles, MUSCLES, 0, 8);
  if ("error" in secondary) return secondary;
  const equipment = list("equipment", input.equipment, EQUIPMENT, 1, 4);
  if ("error" in equipment) return equipment;
  if (typeof input.unilateral !== "boolean") return { error: "profile.unilateral must be true or false" };

  const profile: ExerciseProfile = {
    description,
    pattern: input.pattern as Pattern,
    primaryMuscles: primary.value,
    secondaryMuscles: secondary.value.filter((m) => !primary.value.includes(m)),
    equipment: equipment.value,
    unilateral: input.unilateral,
    describedAt: (opts.now ?? new Date()).toISOString(),
  };

  if (input.variantOf != null && input.variantOf !== "") {
    if (typeof input.variantOf !== "string") return { error: "profile.variantOf must be an exercise id" };
    const id = input.variantOf.trim();
    if (id === opts.selfId) return { error: "profile.variantOf can't be the movement itself" };
    if (!opts.exists(id)) return { error: `profile.variantOf: no movement with id "${id}" — query_data exercises lists them` };
    profile.variantOf = id;
  }
  if (input.cues !== undefined) {
    if (!Array.isArray(input.cues) || input.cues.length > 5 || !input.cues.every((c) => typeof c === "string" && c.trim().length > 0 && c.length <= 120)) {
      return { error: "profile.cues must be up to 5 short cues (≤ 120 characters each)" };
    }
    profile.cues = (input.cues as string[]).map((c) => c.trim());
  }
  if (input.sourceUrl !== undefined && input.sourceUrl !== "") {
    if (typeof input.sourceUrl !== "string" || input.sourceUrl.length > 500 || !/^https:\/\/[^\s]+$/.test(input.sourceUrl)) {
      return { error: "profile.sourceUrl must be an https link (≤ 500 characters)" };
    }
    profile.sourceUrl = input.sourceUrl;
  }
  if (input.sourceNote !== undefined && input.sourceNote !== "") {
    if (typeof input.sourceNote !== "string" || input.sourceNote.length > 200) {
      return { error: "profile.sourceNote must be text up to 200 characters" };
    }
    profile.sourceNote = input.sourceNote.trim();
  }
  return { profile };
}

/** A stored profile, or null when the value isn't one (old/foreign data). */
export function readProfile(v: unknown): ExerciseProfile | null {
  return isObj(v) && typeof v.description === "string" && typeof v.pattern === "string"
    ? (v as unknown as ExerciseProfile)
    : null;
}
