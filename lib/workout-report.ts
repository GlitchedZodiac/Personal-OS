import type { Prisma } from "@prisma/client";
import { sessionVolumeKg } from "@/lib/prs";
import { ZONE_NAMES } from "@/lib/zones";

// Post-session report — the "how did that go?" read Strava gives after an
// activity, for strength work Strava can't see inside. Strava files every
// kettlebell EMOM, dumbbell circuit and straight-sets day as one
// undifferentiated "WeightTraining" with no exercises, so the only place
// this can be answered is here.
//
// WATCH-READY BY CONSTRUCTION: every wrist-supplied signal (avg/max HR,
// time-in-zones, load, calories) is read from metricsData if present and
// simply omitted from the prompt when absent. When the watch starts
// streaming, the same report gets richer with no code change — the model
// is told which signals it has rather than being handed blanks.

export interface WorkoutForReport {
  id: string;
  startedAt: Date;
  durationMinutes: number;
  workoutType: string;
  description: string | null;
  caloriesBurned: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  exercises: Prisma.JsonValue;
  metricsData: Prisma.JsonValue;
  source: string;
}

export interface ReportContext {
  headline: string;
  facts: string[];
  signalsPresent: string[];
  signalsMissing: string[];
}

type Metrics = {
  timeInZones?: { pct?: number[]; seconds?: number[]; totalSeconds?: number };
  loadScore?: number | null;
  relativeEffort?: number | null;
  emom?: { roundsCompleted?: number; totalRounds?: number };
  sequenceId?: string;
  report?: unknown;
};

function asMetrics(value: Prisma.JsonValue): Metrics {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Metrics)
    : {};
}

function exerciseLines(exercises: Prisma.JsonValue): string[] {
  if (!Array.isArray(exercises)) return [];
  return exercises.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const e = raw as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name : null;
    if (!name) return [];
    const bits: string[] = [];
    if (typeof e.sets === "number" && e.sets > 0) bits.push(`${e.sets} sets`);
    if (typeof e.reps === "number" && e.reps > 0) bits.push(`${e.reps} reps`);
    if (typeof e.seconds === "number" && e.seconds > 0) bits.push(`${e.seconds}s`);
    if (typeof e.weightKg === "number" && e.weightKg > 0)
      bits.push(`${e.weightKg} kg`);
    return [`${name}${bits.length ? ` — ${bits.join(" × ")}` : ""}`];
  });
}

/**
 * Assemble everything factual about a session. Kept separate from the model
 * call so the numbers in the report are computed, never hallucinated — the
 * model's job is interpretation, not arithmetic.
 */
export function buildReportContext(
  workout: WorkoutForReport,
  history: WorkoutForReport[],
  newPRs: { exerciseName: string; kind: string; value: number; unit: string }[]
): ReportContext {
  const metrics = asMetrics(workout.metricsData);
  const facts: string[] = [];
  const present: string[] = [];
  const missing: string[] = [];

  const volume = sessionVolumeKg(workout.exercises);
  const label = workout.description || workout.workoutType;

  facts.push(`Session: ${label}`);
  facts.push(`Duration: ${workout.durationMinutes} min`);

  if (metrics.emom?.totalRounds) {
    facts.push(
      `Protocol: EMOM — ${metrics.emom.roundsCompleted ?? 0} of ${metrics.emom.totalRounds} rounds completed`
    );
  }

  const lines = exerciseLines(workout.exercises);
  if (lines.length) facts.push(`Work: ${lines.join("; ")}`);
  if (volume > 0) {
    facts.push(`Tonnage: ${Math.round(volume).toLocaleString("en-US")} kg`);
    present.push("tonnage");
  }

  // ── Wrist-supplied signals (present today only for HR-bearing imports) ──
  if (workout.avgHeartRateBpm) {
    facts.push(
      `Heart rate: avg ${workout.avgHeartRateBpm} bpm${workout.maxHeartRateBpm ? `, max ${workout.maxHeartRateBpm}` : ""}`
    );
    present.push("heart rate");
  } else {
    missing.push("heart rate");
  }

  const pct = metrics.timeInZones?.pct;
  if (Array.isArray(pct) && pct.some((p) => p > 0)) {
    facts.push(
      `Time in zones: ${pct.map((p, i) => `${ZONE_NAMES[i]} ${p}%`).join(", ")}`
    );
    present.push("zones");
  } else {
    missing.push("zones");
  }

  if (workout.caloriesBurned) {
    facts.push(`Calories: ${Math.round(workout.caloriesBurned)}`);
    present.push("calories");
  } else {
    missing.push("calories");
  }

  if (metrics.relativeEffort != null) {
    facts.push(`Relative effort: ${metrics.relativeEffort}`);
    present.push("relative effort");
  } else if (metrics.loadScore != null) {
    facts.push(`Training load: ${metrics.loadScore}`);
    present.push("training load");
  }

  if (newPRs.length) {
    facts.push(
      `New PRs: ${newPRs.map((p) => `${p.exerciseName} ${p.value}${p.unit === "kg-reps" ? " kg total" : " kg"}`).join("; ")}`
    );
  }

  // ── Comparison against recent same-type sessions ──
  if (history.length) {
    const volumes = history
      .map((h) => sessionVolumeKg(h.exercises))
      .filter((v) => v > 0);
    if (volume > 0 && volumes.length) {
      const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const delta = Math.round(((volume - avg) / avg) * 100);
      facts.push(
        `Versus his last ${volumes.length} similar sessions: ${delta >= 0 ? "+" : ""}${delta}% tonnage (avg ${Math.round(avg).toLocaleString("en-US")} kg)`
      );
    }
    const lastDate = history[0]?.startedAt;
    if (lastDate) {
      const days = Math.round(
        (workout.startedAt.getTime() - new Date(lastDate).getTime()) / 86_400_000
      );
      if (Number.isFinite(days) && days >= 0) {
        facts.push(`Days since the previous ${workout.workoutType} session: ${days}`);
      }
    }
  } else {
    facts.push("No comparable prior sessions on record.");
  }

  return {
    headline: label,
    facts,
    signalsPresent: present,
    signalsMissing: missing,
  };
}

export function reportSystemPrompt() {
  return [
    "You write the post-session read for Michael's own training app — the",
    "thing Strava gives after an activity, except Strava files every",
    "kettlebell EMOM and dumbbell circuit as a featureless 'WeightTraining'",
    "block, so this is the only place the work can actually be read.",
    "",
    "Rules:",
    "- Every number you state must come from the facts given. Never invent,",
    "  round differently, or infer a metric that wasn't supplied.",
    "- If a signal is listed as missing, do not speculate about it. You may",
    "  note once, briefly, that the watch will fill it in — never more.",
    "- 3 short paragraphs max, no headings, no markdown, no bullet lists.",
    "- Lead with what actually happened, then what it means against his",
    "  recent history, then one concrete thing for next time.",
    "- Direct, warm, a little dry. He is a serious lifter training with",
    "  kettlebells and dumbbells, not a beginner. No hype, no emoji, no",
    "  'crushed it'. Never moralise about rest days or hydration.",
  ].join("\n");
}

export function reportUserPrompt(ctx: ReportContext) {
  return [
    "Facts about the session just finished:",
    ...ctx.facts.map((f) => `- ${f}`),
    "",
    ctx.signalsMissing.length
      ? `Signals NOT available for this session: ${ctx.signalsMissing.join(", ")}.`
      : "All signals available.",
    "",
    "Write his post-session read.",
  ].join("\n");
}
