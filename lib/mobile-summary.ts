import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getWeekStartDateString,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";
import { sessionVolumeKg } from "@/lib/prs";
import { buildProgressionSuggestions } from "@/lib/progression-db";

// Phone half of the watch Round 1+2 handoff (spec § API dependencies):
// the numbers the wrist needs after a sync (Summary deltas, progression
// verdict) and the complication's hero metrics (streak / weight-7d / Z2).
// One lib, two callers — POST /api/mobile/workouts/sync embeds it in its
// response, GET /api/mobile/summary serves the widget timeline fetch.

export interface HeroMetrics {
  /** Same streak the Today screen shows: consecutive local days with any
   *  food log, today optional. NOT a training streak. */
  streakDays: number;
  weight7dAvgKg: number | null;
  /** vs the 7 days before that window; null until both windows have data. */
  weight7dDeltaKg: number | null;
  /** Zone-2 minutes summed over the current Mon-start week (user TZ),
   *  from each workout's stored timeInZones (Strava imports + watch
   *  stream enrichment). Sessions without HR streams contribute 0. */
  z2WeeklyMinutes: number;
}

export interface LastRunStats {
  startedAt: string;
  durationMinutes: number | null;
  volumeKg: number;
  caloriesBurned: number | null;
  avgHeartRateBpm: number | null;
  roundsCompleted: number | null;
}

export interface RoutineCoda {
  sequenceId: string;
  sequenceName: string | null;
  /** "raise" = earned (3 clean runs at prescription), "deload" = 2 abandons,
   *  "hold" = keep the current prescription. Verdict only — the server never
   *  mutates the routine here; "Take the raise" stays an explicit action. */
  verdict: "raise" | "hold" | "deload";
  reason: string | null;
  lastRun: LastRunStats | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function buildHeroMetrics(timeZone: string): Promise<HeroMetrics> {
  const now = new Date();
  const todayStr = getDateStringInTimeZone(now, timeZone);
  const weekStart = zonedLocalDateTimeToUtc(
    getWeekStartDateString(todayStr, 1),
    timeZone
  );
  const streakSince = zonedLocalDateTimeToUtc(
    addDaysToDateString(todayStr, -400),
    timeZone
  );
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  const [streakFood, weights, weekWorkouts] = await Promise.all([
    prisma.foodLog.findMany({
      where: { loggedAt: { gte: streakSince } },
      select: { loggedAt: true },
    }),
    prisma.bodyMeasurement.findMany({
      where: { weightKg: { not: null }, measuredAt: { gte: fourteenDaysAgo } },
      select: { weightKg: true, measuredAt: true },
    }),
    prisma.workoutLog.findMany({
      where: { startedAt: { gte: weekStart } },
      select: { metricsData: true },
    }),
  ]);

  // Streak — identical semantics to /api/health/today.
  const loggedDates = new Set(
    streakFood.map((f) => getDateStringInTimeZone(f.loggedAt, timeZone))
  );
  let streakDays = loggedDates.has(todayStr) ? 1 : 0;
  let cursor = addDaysToDateString(todayStr, -1);
  while (loggedDates.has(cursor)) {
    streakDays++;
    cursor = addDaysToDateString(cursor, -1);
  }

  // Weight — mean of the last 7 days vs the mean of the 7 before.
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const current = weights.filter((w) => w.measuredAt >= sevenDaysAgo);
  const prior = weights.filter((w) => w.measuredAt < sevenDaysAgo);
  const avg = (rows: typeof weights) =>
    rows.length
      ? rows.reduce((s, w) => s + (w.weightKg as number), 0) / rows.length
      : null;
  const currentAvg = avg(current);
  const priorAvg = avg(prior);

  // Z2 — index 1 of the stored 5-zone breakdown (lib/zones.ts ordering).
  let z2Seconds = 0;
  for (const w of weekWorkouts) {
    const zones = (
      w.metricsData as { timeInZones?: { seconds?: number[] } } | null
    )?.timeInZones;
    const s = zones?.seconds?.[1];
    if (typeof s === "number" && Number.isFinite(s)) z2Seconds += s;
  }

  return {
    streakDays,
    weight7dAvgKg: currentAvg != null ? round1(currentAvg) : null,
    weight7dDeltaKg:
      currentAvg != null && priorAvg != null
        ? round1(currentAvg - priorAvg)
        : null,
    z2WeeklyMinutes: Math.round(z2Seconds / 60),
  };
}

/**
 * Post-run verdict + previous-run stats for one routine. `beforeStartedAt`
 * excludes the run that was just synced so "last run" means the one before
 * it, not itself.
 */
export async function buildRoutineCoda(
  sequenceId: string,
  beforeStartedAt: Date
): Promise<RoutineCoda | null> {
  const [sequence, prevRun, suggestions] = await Promise.all([
    prisma.sequence.findUnique({
      where: { id: sequenceId },
      select: { name: true },
    }),
    prisma.workoutLog.findFirst({
      where: {
        metricsData: { path: ["sequenceId"], equals: sequenceId },
        startedAt: { lt: beforeStartedAt },
      },
      orderBy: { startedAt: "desc" },
      select: {
        startedAt: true,
        durationMinutes: true,
        caloriesBurned: true,
        avgHeartRateBpm: true,
        exercises: true,
        metricsData: true,
      },
    }),
    buildProgressionSuggestions(),
  ]);

  if (!sequence && !prevRun) return null;

  const suggestion = suggestions.find((s) => s.sequenceId === sequenceId);
  const prevMetrics = (prevRun?.metricsData ?? {}) as {
    roundsCompleted?: number;
    emom?: { roundsCompleted?: number };
  };

  return {
    sequenceId,
    sequenceName: sequence?.name ?? null,
    verdict: suggestion?.type ?? "hold",
    reason: suggestion?.reason ?? null,
    lastRun: prevRun
      ? {
          startedAt: prevRun.startedAt.toISOString(),
          durationMinutes: prevRun.durationMinutes,
          volumeKg: sessionVolumeKg(prevRun.exercises),
          caloriesBurned:
            prevRun.caloriesBurned != null
              ? Math.round(prevRun.caloriesBurned)
              : null,
          avgHeartRateBpm: prevRun.avgHeartRateBpm,
          roundsCompleted:
            prevMetrics.roundsCompleted ??
            prevMetrics.emom?.roundsCompleted ??
            null,
        }
      : null,
  };
}
