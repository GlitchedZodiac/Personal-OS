import { normalizeExerciseName } from "@/lib/exercises";

// Sequences ("routines"): KB Block A, EMOM 20, Tabata... Built on iPhone,
// executed on either surface (docs/watch-contract.md § v1). This module owns
// validation so the web CRUD and the watch payload stay honest.

export const SEQUENCE_KINDS = ["straight", "emom", "tabata", "circuit"] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];

export interface SequenceStep {
  exercise: string; // canonical id (preferred) or free-form name
  exerciseName: string; // display name
  sets?: number;
  reps?: number;
  seconds?: number;
  weightKg?: number;
  restSeconds?: number;
}

export interface SequenceInput {
  name?: unknown;
  kind?: unknown;
  restSecondsDefault?: unknown;
  durationMinutes?: unknown;
  rounds?: unknown;
  steps?: unknown;
}

function toPositive(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function validateSequence(input: SequenceInput):
  | {
      ok: true;
      name: string;
      kind: SequenceKind;
      restSecondsDefault: number | null;
      durationMinutes: number | null;
      rounds: number | null;
      steps: SequenceStep[];
    }
  | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Name is required" };
  if (name.length > 60) return { ok: false, error: "Name too long (max 60)" };

  const kind = SEQUENCE_KINDS.includes(input.kind as SequenceKind)
    ? (input.kind as SequenceKind)
    : null;
  if (!kind) return { ok: false, error: `Kind must be one of ${SEQUENCE_KINDS.join(", ")}` };

  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    return { ok: false, error: "At least one step is required" };
  }
  if (input.steps.length > 40) return { ok: false, error: "Too many steps (max 40)" };

  const steps: SequenceStep[] = [];
  for (const raw of input.steps) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid step" };
    const step = raw as Record<string, unknown>;
    const rawName =
      typeof step.exerciseName === "string" && step.exerciseName.trim()
        ? step.exerciseName.trim()
        : typeof step.exercise === "string"
          ? step.exercise.trim()
          : "";
    if (!rawName) return { ok: false, error: "Each step needs an exercise" };

    const def = normalizeExerciseName(rawName);
    const reps = toPositive(step.reps);
    const seconds = toPositive(step.seconds);
    if (!reps && !seconds) {
      return { ok: false, error: `"${rawName}" needs reps or seconds` };
    }

    // Catalog normalization must not swallow the per-side qualifier —
    // "5 snatches each side" is double the volume of "5 snatches".
    const perSide = /each side|per side|cada lado|por lado/i.test(rawName);
    let displayName = def?.name ?? rawName;
    if (def && perSide && !/each side/i.test(displayName)) {
      displayName = `${displayName} (each side)`;
    }

    steps.push({
      exercise: def?.id ?? rawName.toLowerCase(),
      exerciseName: displayName,
      sets: toPositive(step.sets),
      reps,
      seconds,
      weightKg: toPositive(step.weightKg),
      restSeconds: toPositive(step.restSeconds),
    });
  }

  const rest = toPositive(input.restSecondsDefault);
  const duration = toPositive(input.durationMinutes);
  if (duration && duration > 240) {
    return { ok: false, error: "Duration too long (max 240 min)" };
  }
  // Circuits are round-counted ("repeat 3 times") — the watch runs exactly
  // this many rounds and falls back to 3 when null.
  const rounds = toPositive(input.rounds);
  if (rounds && rounds > 50) {
    return { ok: false, error: "Too many rounds (max 50)" };
  }
  return {
    ok: true,
    name,
    kind,
    restSecondsDefault: rest ?? null,
    durationMinutes: duration ? Math.round(duration) : null,
    rounds: rounds ? Math.round(rounds) : null,
    steps,
  };
}
