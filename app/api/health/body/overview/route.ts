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

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKS = 12;

// GET ?date=YYYY-MM-DD — the Body screen in one call: 12-week trend series
// (weight / training volume / calories), the tape (latest + history per
// dimension), latest progress photos, and whether sleep data exists yet.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const dateParam = searchParams.get("date");
    const todayStr = LOCAL_DATE_RE.test(dateParam ?? "")
      ? (dateParam as string)
      : getDateStringInTimeZone(new Date(), timeZone);

    const weekStartStr = getWeekStartDateString(todayStr, 1);
    const rangeStartStr = addDaysToDateString(weekStartStr, -7 * (WEEKS - 1));
    const { rangeStart } = getUtcDateRangeForTimeZone(rangeStartStr, todayStr, timeZone);

    const [measurements, workouts, food, photos] = await Promise.all([
      prisma.bodyMeasurement.findMany({
        orderBy: { measuredAt: "desc" },
        take: 120,
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: rangeStart } },
        select: { startedAt: true, exercises: true },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: rangeStart } },
        select: { loggedAt: true, calories: true },
      }),
      prisma.progressPhoto.findMany({
        orderBy: { takenAt: "desc" },
        take: 2,
        select: { id: true, takenAt: true, imageData: true },
      }),
    ]);

    // Weekly buckets, Mon-start, oldest → newest.
    const weekKeys: string[] = [];
    for (let i = 0; i < WEEKS; i++) {
      weekKeys.push(addDaysToDateString(rangeStartStr, i * 7));
    }
    const weekIndex = new Map(weekKeys.map((k, i) => [k, i]));
    const bucketOf = (d: Date) =>
      weekIndex.get(getWeekStartDateString(getDateStringInTimeZone(d, timeZone), 1));

    // Weight is its own series: the last 12 weigh-ins whatever their age —
    // weeks between readings is normal, and a fresh 12-week window would
    // hide older history entirely.
    const weighIns = [...measurements]
      .filter((m) => m.weightKg != null)
      .slice(0, 12)
      .reverse()
      .map((m) => ({
        date: getDateStringInTimeZone(m.measuredAt, timeZone),
        value: m.weightKg as number,
      }));

    const volumeSeries = weekKeys.map(() => 0);
    for (const w of workouts) {
      const i = bucketOf(w.startedAt);
      if (i != null) volumeSeries[i] += sessionVolumeKg(w.exercises);
    }

    // Calories: daily totals averaged per logged day in each week.
    const kcalByDay = new Map<string, number>();
    for (const f of food) {
      const day = getDateStringInTimeZone(f.loggedAt, timeZone);
      kcalByDay.set(day, (kcalByDay.get(day) ?? 0) + f.calories);
    }
    const kcalSums = weekKeys.map(() => ({ total: 0, days: 0 }));
    for (const [day, total] of kcalByDay) {
      const i = weekIndex.get(getWeekStartDateString(day, 1));
      if (i != null) {
        kcalSums[i].total += total;
        kcalSums[i].days += 1;
      }
    }
    const kcalSeries = kcalSums.map((s) =>
      s.days > 0 ? Math.round(s.total / s.days) : null
    );

    // The tape: history per dimension (oldest → newest, only rows that have it).
    const DIMS = [
      "neckCm",
      "chestCm",
      "armsCm",
      "waistCm",
      "hipsCm",
      "legsCm",
      "calvesCm",
    ] as const;
    const tape: Record<
      string,
      { points: { date: string; value: number }[] }
    > = {};
    for (const dim of DIMS) {
      const points = [...measurements]
        .reverse()
        .filter((m) => m[dim] != null)
        .map((m) => ({
          date: getDateStringInTimeZone(m.measuredAt, timeZone),
          value: m[dim] as number,
        }));
      tape[dim] = { points };
    }

    const latest = measurements[0] ?? null;
    const latestWeight =
      measurements.find((m) => m.weightKg != null)?.weightKg ?? null;

    // Photo compare: pair each photo with the weight nearest its date.
    const nearestWeight = (at: Date) => {
      let best: { diff: number; kg: number } | null = null;
      for (const m of measurements) {
        if (m.weightKg == null) continue;
        const diff = Math.abs(m.measuredAt.getTime() - at.getTime());
        if (!best || diff < best.diff) best = { diff, kg: m.weightKg };
      }
      return best?.kg ?? null;
    };

    return NextResponse.json({
      date: todayStr,
      latestWeightKg: latestWeight,
      weekLabels: { start: weekKeys[0], end: todayStr },
      weighIns,
      series: {
        volume: volumeSeries,
        kcal: kcalSeries,
      },
      lastTapedAt: latest ? getDateStringInTimeZone(latest.measuredAt, timeZone) : null,
      tape,
      photos: photos.map((p) => ({
        id: p.id,
        takenAt: p.takenAt.toISOString(),
        imageData: p.imageData,
        weightKg: nearestWeight(p.takenAt),
      })),
      sleepAvailable: false, // arrives with the watch's sleep sync
    });
  } catch (error) {
    console.error("Body overview error:", error);
    return NextResponse.json({ error: "Failed to load body data" }, { status: 500 });
  }
}
