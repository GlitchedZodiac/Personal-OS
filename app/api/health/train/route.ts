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
import { normalizeExerciseName } from "@/lib/exercises";

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

    const [workouts, latestPRRow, trail, effortRow] = await Promise.all([
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
        },
      }),
      prisma.personalRecord.findFirst({ orderBy: { achievedAt: "desc" } }),
      prisma.workoutLog.findFirst({
        where: { distanceMeters: { gt: 0 } },
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

    const weeklyVolume = [...buckets.entries()].map(([weekStart, volumeKg]) => ({
      weekStart,
      label: `W${isoWeek(weekStart)}`,
      volumeKg,
    }));
    const first = weeklyVolume.find((b) => b.volumeKg > 0)?.volumeKg ?? 0;
    const last = weeklyVolume[weeklyVolume.length - 1]?.volumeKg ?? 0;
    const pctChange = first > 0 ? Math.round(((last - first) / first) * 100) : null;

    // Today's session rows, PR-flagged via records that point at this workout.
    let session: {
      rows: SessionRow[];
      durationMinutes: number;
      startedAt: string;
    } | null = null;
    if (todaysWorkout) {
      const prRecords = await prisma.personalRecord.findMany({
        where: { workoutLogId: todaysWorkout.id },
        select: { exercise: true },
      });
      const prIds = new Set(prRecords.map((r) => r.exercise));
      const rows: SessionRow[] = [];
      for (const raw of todaysWorkout.exercises as Array<Record<string, unknown>>) {
        if (!raw || typeof raw !== "object" || typeof raw.name !== "string") continue;
        const def = normalizeExerciseName(raw.name);
        const sets = Number(raw.sets) || null;
        const reps = Number(raw.reps) || null;
        const weight = Number(raw.weightKg ?? raw.weight) || null;
        const parts = [
          sets && reps ? `${sets} × ${reps}` : reps ? `${reps} reps` : null,
          weight ? `${weight} kg` : null,
        ].filter(Boolean);
        rows.push({
          name: def?.name ?? raw.name,
          detail: parts.join(" · "),
          isPR: def ? prIds.has(def.id) : false,
        });
      }
      session = {
        rows,
        durationMinutes: todaysWorkout.durationMinutes,
        startedAt: todaysWorkout.startedAt.toISOString(),
      };
    }

    // PR banner only stays fresh for a week — after that the shimmer would lie.
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

    return NextResponse.json({
      date: todayStr,
      weekNumber: isoWeek(todayStr),
      weekVolumeKg,
      latestPR,
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
