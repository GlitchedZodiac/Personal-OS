import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

// GET ?metric=fat|muscle|bmr|weight|volume|kcal&weeks=4|8|12 — Mon-week
// series for the composition drill-in (design 2026-08-11e rev). Scale
// metrics average the week's readings; volume sums tonnage; kcal averages
// logged days. Weeks with no data are omitted (honest gaps).

const METRICS = new Set(["fat", "muscle", "bmr", "weight", "volume", "kcal"]);

interface SettingsData {
  calorieTarget?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric") ?? "fat";
    if (!METRICS.has(metric)) {
      return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
    }
    const weeks = [4, 8, 12].includes(Number(searchParams.get("weeks")))
      ? Number(searchParams.get("weeks"))
      : 12;

    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const todayStr = getDateStringInTimeZone(new Date(), timeZone);
    const currentWeekStart = getWeekStartDateString(todayStr, 1);
    const firstWeekStart = addDaysToDateString(currentWeekStart, -7 * (weeks - 1));
    const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
      firstWeekStart,
      todayStr,
      timeZone
    );

    const weekOf = (d: Date) =>
      getWeekStartDateString(getDateStringInTimeZone(d, timeZone), 1);

    const buckets = new Map<string, number[]>();
    const push = (week: string, v: number) => {
      const b = buckets.get(week) ?? [];
      b.push(v);
      buckets.set(week, b);
    };

    let unit = "";
    let decimals = 1;
    let goal: number | null = null;

    if (metric === "volume") {
      unit = "kg / week";
      decimals = 0;
      const rows = await prisma.workoutLog.findMany({
        where: { startedAt: { gte: rangeStart, lte: rangeEnd } },
        select: { startedAt: true, exercises: true },
      });
      // Sum tonnage per week (push one summed value per week).
      const sums = new Map<string, number>();
      for (const w of rows) {
        const wk = weekOf(w.startedAt);
        sums.set(wk, (sums.get(wk) ?? 0) + sessionVolumeKg(w.exercises));
      }
      for (const [wk, v] of sums) if (v > 0) push(wk, v);
    } else if (metric === "kcal") {
      unit = "kcal / day";
      decimals = 0;
      const [rows, settingsRow] = await Promise.all([
        prisma.foodLog.findMany({
          where: { loggedAt: { gte: rangeStart, lte: rangeEnd } },
          select: { loggedAt: true, calories: true },
        }),
        prisma.userSettings.findUnique({
          where: { id: "default" },
          select: { data: true },
        }),
      ]);
      goal = ((settingsRow?.data ?? {}) as SettingsData).calorieTarget ?? 2000;
      const byDay = new Map<string, number>();
      for (const r of rows) {
        const day = getDateStringInTimeZone(r.loggedAt, timeZone);
        byDay.set(day, (byDay.get(day) ?? 0) + r.calories);
      }
      for (const [day, kcal] of byDay) push(getWeekStartDateString(day, 1), kcal);
    } else {
      const field =
        metric === "fat"
          ? "bodyFatPct"
          : metric === "muscle"
            ? "muscleMassKg"
            : metric === "bmr"
              ? "bmrKcal"
              : "weightKg";
      unit =
        metric === "fat" ? "%" : metric === "bmr" ? "kcal / day" : "kg";
      decimals = metric === "bmr" ? 0 : 1;
      const rows = await prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: rangeStart, lte: rangeEnd }, [field]: { not: null } },
        orderBy: { measuredAt: "asc" },
        select: { measuredAt: true, [field]: true },
      });
      for (const r of rows) {
        push(weekOf(r.measuredAt), r[field as keyof typeof r] as unknown as number);
      }
    }

    const factor = 10 ** decimals;
    const series = [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([weekStart, values]) => ({
        weekStart,
        value:
          Math.round(
            (values.reduce((s, x) => s + x, 0) / values.length) * factor
          ) / factor,
        readings: values.length,
      }));

    return NextResponse.json({ metric, unit, weeks, goal, series });
  } catch (error) {
    console.error("Body metric error:", error);
    return NextResponse.json({ error: "Failed to load metric" }, { status: 500 });
  }
}
