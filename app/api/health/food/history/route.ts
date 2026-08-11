import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
} from "@/lib/timezone";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — daily calorie/macro totals for the
// Food History screen (design 2026-08-11e rev). Defaults to the last 14
// days. Day detail reuses the existing GET /api/health/food?date=.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 120;

interface SettingsData {
  calorieTarget?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const todayStr = getDateStringInTimeZone(new Date(), timeZone);

    let to = searchParams.get("to") ?? todayStr;
    if (!DAY_RE.test(to) || to > todayStr) to = todayStr;
    let from = searchParams.get("from") ?? addDaysToDateString(to, -13);
    if (!DAY_RE.test(from) || from > to) from = addDaysToDateString(to, -13);
    // Cap the span server-side so a wild range can't drag the whole table.
    if (addDaysToDateString(from, MAX_DAYS) < to) {
      from = addDaysToDateString(to, -MAX_DAYS);
    }

    const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(from, to, timeZone);

    const [rows, settingsRow] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: rangeStart, lte: rangeEnd } },
        select: {
          loggedAt: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { id: "default" },
        select: { data: true },
      }),
    ]);

    const byDay = new Map<
      string,
      { kcal: number; proteinG: number; carbsG: number; fatG: number }
    >();
    for (const r of rows) {
      const day = getDateStringInTimeZone(r.loggedAt, timeZone);
      const b = byDay.get(day) ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
      b.kcal += r.calories;
      b.proteinG += r.proteinG;
      b.carbsG += r.carbsG;
      b.fatG += r.fatG;
      byDay.set(day, b);
    }

    // Only days that were actually logged — gaps are honest gaps.
    const days = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, b]) => ({
        date,
        kcal: Math.round(b.kcal),
        proteinG: Math.round(b.proteinG),
        carbsG: Math.round(b.carbsG),
        fatG: Math.round(b.fatG),
        isToday: date === todayStr,
      }));

    const goal =
      ((settingsRow?.data ?? {}) as SettingsData).calorieTarget ?? 2000;
    const closed = days.filter((d) => !d.isToday);
    const avgKcal =
      closed.length > 0
        ? Math.round(closed.reduce((s, d) => s + d.kcal, 0) / closed.length)
        : null;

    return NextResponse.json({ from, to, goal, avgKcal, days });
  } catch (error) {
    console.error("Food history error:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
