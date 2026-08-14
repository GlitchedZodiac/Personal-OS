// Routine progression intelligence — PURE MATH, no AI calls (his rule:
// no hidden token costs). A weight/time bump is suggested only after N
// consistent completions at the current prescription (default 3), never
// twice in a row (post-raise hold), respecting 4 kg bell denominations;
// two abandoned runs in a row suggest a deload. The bar is never raised
// indefinitely — it waits for HIM to apply, and holds after every raise.

export interface ProgressionStep {
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  seconds?: number | null;
  weightKg?: number | null;
}

export interface ProgressionSequence {
  id: string;
  name: string;
  kind: string;
  rounds?: number | null;
  durationMinutes?: number | null;
  steps: ProgressionStep[];
  progression?: { lastRaiseAt?: string } | null;
}

export interface ProgressionRun {
  startedAt: string; // ISO
  roundsCompleted?: number | null;
  totalRounds?: number | null;
  durationMinutes?: number | null;
}

export interface ProgressionChange {
  stepIndex: number;
  exercise: string;
  fromKg?: number;
  toKg?: number;
  fromSeconds?: number;
  toSeconds?: number;
}

export interface ProgressionSuggestion {
  sequenceId: string;
  sequenceName: string;
  type: "raise" | "deload";
  reason: string;
  basisRuns: number;
  changes: ProgressionChange[];
}

export const CONSISTENT_RUNS = 3;
export const ABANDONED_RUNS_FOR_DELOAD = 2;
export const BELL_STEP_KG = 4; // his bells move in 4 kg denominations

/** A run "completed" its prescription when it hit the round target;
 *  runs without round data count as completed (an honest default —
 *  the log exists, the math never punishes missing telemetry). */
export function runCompleted(seq: ProgressionSequence, run: ProgressionRun): boolean {
  const target = run.totalRounds ?? seq.rounds ?? null;
  if (target && typeof run.roundsCompleted === "number") {
    return run.roundsCompleted >= target;
  }
  return true;
}

function roundToBell(kg: number): number {
  return Math.max(BELL_STEP_KG, Math.round(kg / BELL_STEP_KG) * BELL_STEP_KG);
}

/** runs must be sorted newest-first and belong to this sequence. */
export function analyzeProgression(
  seq: ProgressionSequence,
  runs: ProgressionRun[],
): ProgressionSuggestion | null {
  if (runs.length === 0) return null;

  // Deload first: the last two runs both fell short of a KNOWN target.
  if (runs.length >= ABANDONED_RUNS_FOR_DELOAD) {
    const lastTwo = runs.slice(0, ABANDONED_RUNS_FOR_DELOAD);
    const bothAbandoned = lastTwo.every((r) => {
      const target = r.totalRounds ?? seq.rounds ?? null;
      return target && typeof r.roundsCompleted === "number" && r.roundsCompleted < target;
    });
    if (bothAbandoned) {
      const changes: ProgressionChange[] = [];
      seq.steps.forEach((s, i) => {
        if (typeof s.weightKg === "number" && s.weightKg > BELL_STEP_KG) {
          changes.push({
            stepIndex: i,
            exercise: s.exercise,
            fromKg: s.weightKg,
            toKg: roundToBell(s.weightKg - BELL_STEP_KG),
          });
        }
      });
      if (changes.length === 0) return null;
      return {
        sequenceId: seq.id,
        sequenceName: seq.name,
        type: "deload",
        reason: `The last ${ABANDONED_RUNS_FOR_DELOAD} runs stopped short of the round target — drop a bell size, finish clean, then climb back.`,
        basisRuns: ABANDONED_RUNS_FOR_DELOAD,
        changes,
      };
    }
  }

  // Raise: the last N runs all completed the prescription…
  if (runs.length < CONSISTENT_RUNS) return null;
  const basis = runs.slice(0, CONSISTENT_RUNS);
  if (!basis.every((r) => runCompleted(seq, r))) return null;

  // …and no raise has happened since before those runs (post-raise hold).
  const lastRaiseAt = seq.progression?.lastRaiseAt;
  if (lastRaiseAt) {
    const oldestBasis = basis[basis.length - 1].startedAt;
    if (new Date(lastRaiseAt).getTime() >= new Date(oldestBasis).getTime()) {
      return null;
    }
  }

  const changes: ProgressionChange[] = [];
  seq.steps.forEach((s, i) => {
    if (typeof s.weightKg === "number" && s.weightKg > 0) {
      changes.push({
        stepIndex: i,
        exercise: s.exercise,
        fromKg: s.weightKg,
        toKg: roundToBell(s.weightKg + BELL_STEP_KG),
      });
    } else if (typeof s.seconds === "number" && s.seconds >= 20) {
      // Time-based holds/carries: +5 s, the smallest honest increment.
      changes.push({
        stepIndex: i,
        exercise: s.exercise,
        fromSeconds: s.seconds,
        toSeconds: s.seconds + 5,
      });
    }
  });
  if (changes.length === 0) return null;

  return {
    sequenceId: seq.id,
    sequenceName: seq.name,
    type: "raise",
    reason: `${CONSISTENT_RUNS} clean runs at the current prescription — the next bell is earned. One raise, then it holds again.`,
    basisRuns: CONSISTENT_RUNS,
    changes,
  };
}

/** Apply a suggestion to the steps array (returns a new array). */
export function applyChanges(
  steps: ProgressionStep[],
  changes: ProgressionChange[],
): ProgressionStep[] {
  const byIndex = new Map(changes.map((c) => [c.stepIndex, c]));
  return steps.map((s, i) => {
    const c = byIndex.get(i);
    if (!c) return s;
    return {
      ...s,
      ...(c.toKg !== undefined ? { weightKg: c.toKg } : {}),
      ...(c.toSeconds !== undefined ? { seconds: c.toSeconds } : {}),
    };
  });
}
