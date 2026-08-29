import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";
import { sessionVolumeKg } from "@/lib/prs";
import { GPS_WORKOUT_TYPES } from "@/lib/activities";
import { volumeTrendPct } from "@/lib/format-training";
import { normalizeExerciseName } from "@/lib/exercises";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import { buildMovementHistories, tonnageByMovement } from "@/lib/strength-history";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ISO-8601 week number (design header: "WEEK 32 · KETTLEBELL BLOCK").
function isoWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

interface SessionRow {
  name: string;
  detail: string; // "5 × 10 · 24 kg"
  isPR: boolean;
  workSeconds?: number; // per-step working time (watch circuit runs)
}

// Routine-run metadata a watch/web run leaves in metricsData.
interface RunMetrics {
  sequenceId?: string;
  sequenceName?: string;
  roundsCompleted?: number;
  stepSeconds?: number[];
  emom?: { roundsCompleted?: number; totalRounds?: number };
}

// GET ?date=YYYY-MM-DD — everything the Train screen shows in one call:
// weekly volume, latest PR banner, today's session rows, 8-week volume
// buckets, latest trail.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const dateParam = searchParams.get("date");
    const todayStr = LOCAL_DATE_RE.test(dateParam ?? "")
      ? (dateParam as string)
      : getDateStringInTimeZone(new Date(), timeZone);

    const weekStartStr = getWeekStartDateString(todayStr, 1);
    const chartStartStr = addDaysToDateString(weekStartStr, -7 * 7); // 8 buckets incl. current
    const { rangeStart } = getUtcDateRangeForTimeZone(chartStartStr, todayStr, timeZone);

    // Custom movements must resolve for display names and PR chips.
    await ensureUserExercisesLoaded();

    const [workouts, weightRecords, trail, effortRow] = await Promise.all([
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: rangeStart } },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          workoutType: true,
          description: true,
          exercises: true,
          durationMinutes: true,
          caloriesBurned: true,
          distanceMeters: true,
        },
      }),
      // Heaviest-ever ("weight") records are the banner's subject: they mean
      // the same thing on every movement. Session-tonnage ("volume") records
      // only surface when there's no recent weight PR to show.
      // v4 (2026-08-29): the FULL weight-record list rides too — the PR
      // WALL card (one banner was the only PR surface on the whole page).
      prisma.personalRecord.findMany({
        where: { kind: "weight" },
        orderBy: { achievedAt: "desc" },
      }),
      prisma.workoutLog.findFirst({
        // TRAILS means ground actually covered — typed GPS sessions only. A
        // bare distance filter once surfaced a freestyle row carrying leaked
        // GPS distance as the "latest trail".
        where: {
          distanceMeters: { gt: 0 },
          workoutType: { in: [...GPS_WORKOUT_TYPES] },
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          workoutType: true,
          description: true,
          distanceMeters: true,
          elevationGainM: true,
          durationMinutes: true,
          avgHeartRateBpm: true,
          metricsData: true,
        },
      }),
      // Latest session with zone analytics (HR stream present) — Strava
      // imports today, watch recordings next.
      prisma.workoutLog.findFirst({
        where: { metricsData: { path: ["loadScore"], gt: 0 } },
        orderBy: { startedAt: "desc" },
        select: {
          startedAt: true,
          workoutType: true,
          description: true,
          durationMinutes: true,
          avgHeartRateBpm: true,
          metricsData: true,
        },
      }),
    ]);

    // Bucket volume per week (Mon-start, user TZ).
    const buckets = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      buckets.set(addDaysToDateString(chartStartStr, i * 7), 0);
    }
    let weekVolumeKg = 0;
    let todaysWorkout: (typeof workouts)[number] | null = null;

    for (const w of workouts) {
      const localDate = getDateStringInTimeZone(w.startedAt, timeZone);
      const week = getWeekStartDateString(localDate, 1);
      const volume = sessionVolumeKg(w.exercises);
      if (buckets.has(week)) buckets.set(week, (buckets.get(week) ?? 0) + volume);
      if (week === weekStartStr) weekVolumeKg += volume;
      if (
        localDate === todayStr &&
        !todaysWorkout &&
        Array.isArray(w.exercises) &&
        (w.exercises as unknown[]).length > 0
      ) {
        todaysWorkout = w;
      }
    }

    // THIS WEEK · OVERVIEW (design 2026-08-11 rev): sessions, active time,
    // burn, outdoor distance for the current Mon-start week.
    const weekOverview = { sessions: 0, activeMinutes: 0, kcal: 0, outdoorKm: 0 };
    for (const w of workouts) {
      const localDate = getDateStringInTimeZone(w.startedAt, timeZone);
      if (getWeekStartDateString(localDate, 1) !== weekStartStr) continue;
      weekOverview.sessions += 1;
      weekOverview.activeMinutes += w.durationMinutes ?? 0;
      weekOverview.kcal += Math.round(w.caloriesBurned ?? 0);
      weekOverview.outdoorKm += (w.distanceMeters ?? 0) / 1000;
    }
    weekOverview.outdoorKm = Math.round(weekOverview.outdoorKm * 10) / 10;

    const weeklyVolume = [...buckets.entries()].map(([weekStart, volumeKg]) => ({
      weekStart,
      label: `W${isoWeek(weekStart)}`,
      volumeKg,
    }));
    // Week over week, not week-vs-first-ever: comparing the only bucket with
    // work in it to itself printed a confident "+0%".
    const pctChange = volumeTrendPct(weeklyVolume);

    // Today's session rows, PR-flagged via records that point at this workout.
    let session: {
      rows: SessionRow[];
      durationMinutes: number;
      startedAt: string;
      routine: { name: string; roundsCompleted: number | null } | null;
    } | null = null;
    if (todaysWorkout) {
      const [prRecords, metricsRow] = await Promise.all([
        prisma.personalRecord.findMany({
          where: { workoutLogId: todaysWorkout.id },
          select: { exercise: true },
        }),
        prisma.workoutLog.findUnique({
          where: { id: todaysWorkout.id },
          select: { metricsData: true },
        }),
      ]);
      const run = (metricsRow?.metricsData ?? {}) as RunMetrics;

      // Routine attribution: the watch sends sequenceName; older web runs
      // only carry sequenceId — resolve the name so the card can say it.
      let routineName = run.sequenceName ?? null;
      if (!routineName && run.sequenceId) {
        const seq = await prisma.sequence.findUnique({
          where: { id: run.sequenceId },
          select: { name: true },
        });
        routineName = seq?.name ?? null;
      }
      const roundsCompleted =
        run.roundsCompleted ?? run.emom?.roundsCompleted ?? null;

      const prIds = new Set(prRecords.map((r) => r.exercise));
      const rows: SessionRow[] = [];
      const exercises = todaysWorkout.exercises as Array<Record<string, unknown>>;
      // Per-step working time aligns positionally — only trust it when the
      // arrays actually correspond (a zero-tap step can drop its row).
      const stepSeconds =
        Array.isArray(run.stepSeconds) && run.stepSeconds.length === exercises.length
          ? run.stepSeconds
          : null;
      for (const [i, raw] of exercises.entries()) {
        if (!raw || typeof raw !== "object" || typeof raw.name !== "string") continue;
        const def = normalizeExerciseName(raw.name);
        const sets = Number(raw.sets) || null;
        const reps = Number(raw.reps) || null;
        const weight = Number(raw.weightKg ?? raw.weight) || null;
        const parts = [
          sets && reps ? `${sets} × ${reps}` : reps ? `${reps} reps` : null,
          weight ? `${weight} kg` : null,
        ].filter(Boolean);
        const workSeconds = stepSeconds?.[i];
        rows.push({
          name: def?.name ?? raw.name,
          detail: parts.join(" · "),
          isPR: def ? prIds.has(def.id) : false,
          ...(workSeconds && workSeconds > 0 ? { workSeconds } : {}),
        });
      }
      session = {
        rows,
        durationMinutes: todaysWorkout.durationMinutes,
        startedAt: todaysWorkout.startedAt.toISOString(),
        routine: routineName
          ? { name: routineName, roundsCompleted }
          : null,
      };
    }

    // PR banner only stays fresh for a week — after that the shimmer would lie.
    const latestPRRow = weightRecords[0] ?? null;
    const latestPR =
      latestPRRow &&
      Date.now() - latestPRRow.achievedAt.getTime() < 7 * 86_400_000
        ? {
            exerciseName: latestPRRow.exerciseName,
            kind: latestPRRow.kind,
            value: latestPRRow.value,
            unit: latestPRRow.unit,
            previousValue: latestPRRow.previousValue,
            achievedAt: latestPRRow.achievedAt.toISOString(),
            isToday:
              getDateStringInTimeZone(latestPRRow.achievedAt, timeZone) === todayStr,
          }
        : null;

    // v4: the PR wall — every heaviest-ever record — and 8-week tonnage by
    // movement from the same rows the volume chart already fetched.
    const prWall = weightRecords.map((r) => ({
      exercise: r.exercise,
      exerciseName: r.exerciseName,
      valueKg: r.value,
      previousKg: r.previousValue,
      achievedAt: r.achievedAt.toISOString(),
      workoutLogId: r.workoutLogId,
    }));
    const movementTonnage = tonnageByMovement(
      buildMovementHistories(
        workouts.map((w) => ({ id: w.id, startedAt: w.startedAt, exercises: w.exercises }))
      ),
      8,
      6
    );

    return NextResponse.json({
      date: todayStr,
      weekNumber: isoWeek(todayStr),
      weekVolumeKg,
      weekOverview,
      latestPR,
      prWall,
      movementTonnage,
      session,
      weeklyVolume,
      pctChange,
      latestTrail: trail
        ? {
            id: trail.id,
            startedAt: trail.startedAt.toISOString(),
            workoutType: trail.workoutType,
            description: trail.description,
            distanceKm: Math.round(((trail.distanceMeters ?? 0) / 1000) * 10) / 10,
            elevationGainM: trail.elevationGainM,
            durationMinutes: trail.durationMinutes,
            avgHeartRateBpm: trail.avgHeartRateBpm,
            altitudeSpark:
              ((trail.metricsData as { altitudeStream?: number[] } | null)
                ?.altitudeStream ?? null),
          }
        : null,
      latestEffort: (() => {
        if (!effortRow) return null;
        const m = effortRow.metricsData as {
          timeInZones?: { seconds: number[]; pct: number[]; totalSeconds: number };
          loadScore?: number;
          relativeEffort?: number;
        } | null;
        if (!m?.timeInZones) return null;
        return {
          startedAt: effortRow.startedAt.toISOString(),
          workoutType: effortRow.workoutType,
          description: effortRow.description,
          durationMinutes: effortRow.durationMinutes,
          avgHeartRateBpm: effortRow.avgHeartRateBpm,
          timeInZones: m.timeInZones,
          loadScore: m.loadScore ?? null,
          relativeEffort: m.relativeEffort ?? null,
        };
      })(),
    });
  } catch (error) {
    console.error("Train screen error:", error);
    return NextResponse.json({ error: "Failed to load train data" }, { status: 500 });
  }
}
