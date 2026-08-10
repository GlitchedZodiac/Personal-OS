import {
  EXERCISE_CATALOG,
  KETTLEBELL_WEIGHTS_KG,
  DUMBBELL_WEIGHT_KG,
  type ExerciseDef,
  type MovementPattern,
} from "@/lib/exercises";
import type { SequenceStep } from "@/lib/sequences";

// "Surprise me" EMOM builder. A random pick from the catalog produces
// nonsense — four presses, or swings-snatches-cleans-rows in a row, which
// is a forearm test rather than a session. The rules below are what make
// the output trainable:
//
//   1. Distinct movement patterns — no session is all push or all hinge.
//   2. Grip-heavy movements never land back to back (swings, snatches,
//      cleans and rows all tax the same forearms).
//   3. Slow technical lifts (get-up, windmill) are excluded entirely —
//      emomSuitable carries that judgement per movement.
//   4. Unilateral movements are labelled per side so a round is honest
//      work rather than half of it.

export type EmomEquipment = "kettlebell" | "dumbbell" | "any";

export interface EmomRecipe {
  name: string;
  kind: "emom";
  durationMinutes: number;
  restSecondsDefault: null;
  steps: SequenceStep[];
  /** Why these movements — shown under the proposal. */
  rationale: string;
}

export interface GenerateOptions {
  durationMinutes?: number;
  movements?: number;
  equipment?: EmomEquipment;
  /** Kettlebell load; falls back to the middle of his ladder. */
  kettlebellKg?: number;
  /** Deterministic output for tests. */
  random?: () => number;
}

const GRIP_HEAVY = new Set(["high"]);

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pool(equipment: EmomEquipment): ExerciseDef[] {
  return EXERCISE_CATALOG.filter((e) => {
    if (!e.emomSuitable || !e.emomReps) return false;
    if (equipment === "any") {
      return e.equipment === "kettlebell" || e.equipment === "dumbbell";
    }
    return e.equipment === equipment;
  });
}

/**
 * Pick `count` movements with distinct patterns where possible, never
 * placing two grip-heavy movements adjacently (including the wrap-around
 * from the last round back to the first — an EMOM cycles).
 */
function selectMovements(
  candidates: ExerciseDef[],
  count: number,
  random: () => number
): ExerciseDef[] {
  const byPattern = new Map<MovementPattern, ExerciseDef[]>();
  for (const def of candidates) {
    const key = (def.pattern ?? "core") as MovementPattern;
    byPattern.set(key, [...(byPattern.get(key) ?? []), def]);
  }

  // One movement per pattern first, so the session covers different work.
  const patterns = shuffle([...byPattern.keys()], random);
  const picked: ExerciseDef[] = [];
  for (const pattern of patterns) {
    if (picked.length >= count) break;
    const options = shuffle(byPattern.get(pattern) ?? [], random);
    if (options[0]) picked.push(options[0]);
  }
  // Top up from whatever's left if the pattern pool ran dry.
  if (picked.length < count) {
    const rest = shuffle(
      candidates.filter((c) => !picked.some((p) => p.id === c.id)),
      random
    );
    picked.push(...rest.slice(0, count - picked.length));
  }

  const selected = capGripHeavy(picked.slice(0, count), candidates, random);
  return spaceOutGrip(selected);
}

const isHeavy = (def: ExerciseDef) => GRIP_HEAVY.has(def.grip ?? "low");

/**
 * A cycle of n movements can only keep grip-heavy ones apart if at most
 * floor(n/2) of them are heavy — beyond that, two must touch. Reordering
 * can't fix an over-heavy selection, so swap the excess out here for
 * lighter movements before ordering is attempted at all.
 */
function capGripHeavy(
  picked: ExerciseDef[],
  candidates: ExerciseDef[],
  random: () => number
): ExerciseDef[] {
  const maxHeavy = Math.max(1, Math.floor(picked.length / 2));
  const out = [...picked];
  const spares = shuffle(
    candidates.filter((c) => !isHeavy(c) && !out.some((p) => p.id === c.id)),
    random
  );

  for (let i = out.length - 1; i >= 0; i--) {
    if (out.filter(isHeavy).length <= maxHeavy) break;
    if (!isHeavy(out[i])) continue;
    const replacement = spares.shift();
    // No lighter movement left to swap in — keep the heavy one rather
    // than returning a shorter session than asked for.
    if (!replacement) break;
    out[i] = replacement;
  }
  return out;
}

/** Reorder so no two grip-heavy movements are neighbours, wrap included. */
function spaceOutGrip(movements: ExerciseDef[]): ExerciseDef[] {
  if (movements.length < 3) return movements;
  const heavy = movements.filter(isHeavy);
  const light = movements.filter((m) => !isHeavy(m));
  const out: ExerciseDef[] = [];
  while (heavy.length || light.length) {
    if (heavy.length) out.push(heavy.shift()!);
    if (light.length) out.push(light.shift()!);
  }
  return out;
}

function stepFor(def: ExerciseDef, kettlebellKg: number): SequenceStep {
  const perSide = def.laterality === "unilateral";
  const weightKg =
    def.equipment === "kettlebell"
      ? kettlebellKg
      : def.equipment === "dumbbell"
        ? DUMBBELL_WEIGHT_KG
        : undefined;

  // Timed holds (planks, carries) carry seconds; everything else reps.
  const timed = def.pattern === "carry" || def.id.includes("plank");

  return {
    exercise: def.id,
    exerciseName: perSide ? `${def.name} (each side)` : def.name,
    ...(timed ? { seconds: def.emomReps } : { reps: def.emomReps }),
    ...(weightKg ? { weightKg } : {}),
  };
}

export function generateEmom(options: GenerateOptions = {}): EmomRecipe | null {
  const {
    durationMinutes = 20,
    movements = 4,
    equipment = "kettlebell",
    kettlebellKg = KETTLEBELL_WEIGHTS_KG[1], // 20 kg — the workable middle
    random = Math.random,
  } = options;

  const candidates = pool(equipment);
  if (candidates.length === 0) return null;

  const count = Math.max(1, Math.min(movements, candidates.length));
  const picked = selectMovements(candidates, count, random);
  if (picked.length === 0) return null;

  const steps = picked.map((def) => stepFor(def, kettlebellKg));
  const patterns = [...new Set(picked.map((p) => p.pattern ?? "core"))];

  return {
    name: `EMOM ${durationMinutes} · ${picked.map((p) => p.name.replace(/^Kettlebell /, "")).join(" / ")}`,
    kind: "emom",
    durationMinutes,
    restSecondsDefault: null,
    steps,
    rationale: `${picked.length} movements covering ${patterns.join(", ")} — ${Math.floor(durationMinutes / picked.length)} rounds each over ${durationMinutes} minutes.`,
  };
}
