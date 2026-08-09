import { prisma } from "@/lib/prisma";
import { normalizeExerciseName } from "@/lib/exercises";

// Personal-record detection for strength work — kettlebell-first, but any
// exercise with a weight qualifies. Two record kinds keep it unambiguous:
//   weight — heaviest load ever used on the movement
//   volume — best single-session tonnage (sets × reps × kg) on the movement
// Detection runs on workout create; new records return to the caller so the
// UI (and later the watch, via haptics) can celebrate.

export interface RawExercise {
  name?: string;
  sets?: number | string;
  reps?: number | string;
  weightKg?: number | string;
}

export interface PRCandidate {
  exercise: string; // canonical id
  exerciseName: string;
  kind: "weight" | "volume";
  value: number;
  unit: string;
}

export interface NewPR extends PRCandidate {
  previousValue: number | null;
}

function toNum(value: number | string | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pure candidate extraction — the best weight and session volume per
 * canonical exercise in one workout's exercise list.
 */
export function extractPRCandidates(exercises: unknown): PRCandidate[] {
  if (!Array.isArray(exercises)) return [];

  const best = new Map<string, { name: string; weight: number; volume: number }>();

  for (const raw of exercises as RawExercise[]) {
    if (!raw || typeof raw !== "object" || typeof raw.name !== "string") continue;
    const def = normalizeExerciseName(raw.name);
    if (!def) continue;

    const weight = toNum(raw.weightKg);
    if (weight == null) continue;

    const sets = toNum(raw.sets);
    const reps = toNum(raw.reps);
    const volume = sets != null && reps != null ? sets * reps * weight : null;

    const entry = best.get(def.id) ?? { name: def.name, weight: 0, volume: 0 };
    entry.weight = Math.max(entry.weight, weight);
    if (volume != null) entry.volume = Math.max(entry.volume, volume);
    best.set(def.id, entry);
  }

  const candidates: PRCandidate[] = [];
  for (const [id, entry] of best) {
    candidates.push({
      exercise: id,
      exerciseName: entry.name,
      kind: "weight",
      value: entry.weight,
      unit: "kg",
    });
    if (entry.volume > 0) {
      candidates.push({
        exercise: id,
        exerciseName: entry.name,
        kind: "volume",
        value: entry.volume,
        unit: "kg-reps",
      });
    }
  }
  return candidates;
}

/**
 * Compare candidates against stored records and persist improvements.
 * Returns only the NEW records, with what they beat.
 */
export async function detectAndRecordPRs(input: {
  workoutLogId: string;
  exercises: unknown;
  achievedAt: Date;
}): Promise<NewPR[]> {
  const candidates = extractPRCandidates(input.exercises);
  if (candidates.length === 0) return [];

  const existing = await prisma.personalRecord.findMany({
    where: { exercise: { in: [...new Set(candidates.map((c) => c.exercise))] } },
  });
  const byKey = new Map(existing.map((r) => [`${r.exercise}:${r.kind}`, r]));

  const newPRs: NewPR[] = [];
  for (const candidate of candidates) {
    const prior = byKey.get(`${candidate.exercise}:${candidate.kind}`);
    if (prior && prior.value >= candidate.value) continue;

    await prisma.personalRecord.upsert({
      where: {
        exercise_kind: { exercise: candidate.exercise, kind: candidate.kind },
      },
      create: {
        ...candidate,
        previousValue: prior?.value ?? null,
        workoutLogId: input.workoutLogId,
        achievedAt: input.achievedAt,
      },
      update: {
        value: candidate.value,
        exerciseName: candidate.exerciseName,
        previousValue: prior?.value ?? null,
        workoutLogId: input.workoutLogId,
        achievedAt: input.achievedAt,
      },
    });

    newPRs.push({ ...candidate, previousValue: prior?.value ?? null });
  }

  return newPRs;
}
