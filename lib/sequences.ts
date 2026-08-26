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
  /**
   * Work the set until failure instead of to a rep count or a clock.
   * A step is prescribed exactly one of: reps, seconds, or toFailure.
   *
   * Added 2026-08-26. Before it existed the assistant had no way to express
   * "two sets to failure", so it wrote the words into exerciseName — which
   * would have minted "Bicep Curl — to failure" as a permanent new movement
   * in the catalog, and the step still failed validation because it carried
   * neither reps nor seconds.
   */
  toFailure?: boolean;
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

/**
 * A prescription written into the movement name, e.g.
 * "Bicep Curl — to failure" or "Push-ups (AMRAP)".
 *
 * This lives in the validator rather than in one caller's sanitiser because
 * this module is the single choke point every surface goes through, and the
 * cost of missing one is permanent: a step carrying a `category` gets minted
 * as a user exercise on save, so the junk name would then appear in voice
 * logging, PRs and the watch forever.
 */
const FAILURE_SUFFIX =
  /\s*[—\-–:(]*\s*\b(?:to\s+(?:muscular\s+)?failure|until\s+failure|to\s+fail|amrap|max\s+reps?)\b\s*\)?\s*$/i;

export function parseFailureSuffix(name: string): {
  name: string;
  toFailure: boolean;
} {
  const stripped = name.replace(FAILURE_SUFFIX, "").trim();
  // Never strip the name down to nothing — "AMRAP" alone stays as typed.
  if (stripped && stripped !== name.trim()) {
    return { name: stripped, toFailure: true };
  }
  return { name: name.trim(), toFailure: false };
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
    const suppliedName =
      typeof step.exerciseName === "string" && step.exerciseName.trim()
        ? step.exerciseName.trim()
        : typeof step.exercise === "string"
          ? step.exercise.trim()
          : "";
    if (!suppliedName) return { ok: false, error: "Each step needs an exercise" };

    // Pull a prescription out of the name before it reaches the catalog.
    const parsed = parseFailureSuffix(suppliedName);
    const rawName = parsed.name;

    const def = normalizeExerciseName(rawName);
    const reps = toPositive(step.reps);
    const seconds = toPositive(step.seconds);
    const toFailure = step.toFailure === true || parsed.toFailure;
    if (!reps && !seconds && !toFailure) {
      return {
        ok: false,
        error: `"${rawName}" needs reps, seconds, or to-failure`,
      };
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
      // To-failure wins: a rep count alongside it is a target, not a stop
      // condition, and carrying both makes every runner ambiguous.
      reps: toFailure ? undefined : reps,
      seconds: toFailure ? undefined : seconds,
      ...(toFailure ? { toFailure: true as const } : {}),
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

/**
 * How a step's prescription reads on screen. One definition so the chat
 * proposal card, the routines list and the runner cannot drift apart —
 * they showed nothing at all for a to-failure step before this existed.
 */
export function formatStepPrescription(step: {
  sets?: number | null;
  reps?: number | null;
  seconds?: number | null;
  toFailure?: boolean | null;
}): string | null {
  if (step.toFailure) {
    return step.sets ? `${step.sets} × to failure` : "to failure";
  }
  if (step.sets && step.reps) return `${step.sets} × ${step.reps}`;
  if (step.reps) return `${step.reps} reps`;
  if (step.seconds) return `${step.seconds}s`;
  return null;
}
