import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDayBoundsForTimeZone,
  getWeekStartDateString,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";
import { sessionVolumeKg } from "@/lib/prs";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface SettingsData {
  calorieTarget?: number;
  proteinPct?: number;
  carbsPct?: number;
  fatPct?: number;
}

// GET ?date=YYYY-MM-DD — the whole Today screen in one call: streak,
// calorie ring + macros, train tile, weight tile, journal, habits.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeZone = await getUserTimeZone(searchParams.get("tz"));
    const dateParam = searchParams.get("date");
    const todayStr = LOCAL_DATE_RE.test(dateParam ?? "")
      ? (dateParam as string)
      : getDateStringInTimeZone(new Date(), timeZone);

    const { dayStart, dayEnd } = getUtcDayBoundsForTimeZone(todayStr, timeZone);
    const weekStartStr = getWeekStartDateString(todayStr, 1);
    const weekStart = zonedLocalDateTimeToUtc(weekStartStr, timeZone);
    const streakSince = zonedLocalDateTimeToUtc(
      addDaysToDateString(todayStr, -400),
      timeZone
    );

    const [
      settingsRow,
      todayFood,
      streakFood,
      weekWorkouts,
      weekPRCount,
      weights,
      journalEntry,
      journalCount,
      habitChecks,
    ] = await Promise.all([
      prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        select: { calories: true, proteinG: true, carbsG: true, fatG: true },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: streakSince } },
        select: { loggedAt: true },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: weekStart, lte: dayEnd } },
        select: { exercises: true },
      }),
      prisma.personalRecord.count({ where: { achievedAt: { gte: weekStart } } }),
      prisma.bodyMeasurement.findMany({
        where: { weightKg: { not: null } },
        orderBy: { measuredAt: "desc" },
        take: 12,
        select: { weightKg: true, measuredAt: true },
      }),
      prisma.journalEntry.findUnique({ where: { localDate: todayStr } }),
      prisma.journalEntry.count(),
      prisma.habitCheck.findMany({ where: { localDate: todayStr } }),
    ]);

    // Streak: consecutive local days with any food log, today optional.
    const loggedDates = new Set(
      streakFood.map((f) => getDateStringInTimeZone(f.loggedAt, timeZone))
    );
    let streak = loggedDates.has(todayStr) ? 1 : 0;
    let cursor = addDaysToDateString(todayStr, -1);
    while (loggedDates.has(cursor)) {
      streak++;
      cursor = addDaysToDateString(cursor, -1);
    }

    const settings = (settingsRow?.data ?? {}) as SettingsData;
    const calorieGoal = settings.calorieTarget ?? 2000;
    const proteinPct = settings.proteinPct ?? 30;
    const carbsPct = settings.carbsPct ?? 40;
    const fatPct = settings.fatPct ?? 30;

    let eaten = 0,
      proteinG = 0,
      carbsG = 0,
      fatG = 0;
    for (const f of todayFood) {
      eaten += f.calories;
      proteinG += f.proteinG;
      carbsG += f.carbsG;
      fatG += f.fatG;
    }

    const weekVolumeKg = weekWorkouts.reduce(
      (sum, w) => sum + sessionVolumeKg(w.exercises),
      0
    );

    const latestWeight = weights[0]?.weightKg ?? null;
    const prevWeight = weights[1]?.weightKg ?? null;

    return NextResponse.json({
      date: todayStr,
      streak,
      calories: {
        eaten: Math.round(eaten),
        goal: calorieGoal,
        protein: {
          g: Math.round(proteinG),
          goalG: Math.round((calorieGoal * proteinPct) / 100 / 4),
        },
        carbs: {
          g: Math.round(carbsG),
          goalG: Math.round((calorieGoal * carbsPct) / 100 / 4),
        },
        fat: {
          g: Math.round(fatG),
          goalG: Math.round((calorieGoal * fatPct) / 100 / 9),
        },
        mealsLogged: todayFood.length,
      },
      train: { weekVolumeKg, weekPRCount },
      weight: {
        latestKg: latestWeight,
        deltaKg:
          latestWeight != null && prevWeight != null
            ? Math.round((latestWeight - prevWeight) * 10) / 10
            : null,
        spark: weights
          .map((w) => w.weightKg as number)
          .reverse(),
      },
      journal: {
        exists: Boolean(journalEntry?.text || journalEntry?.photoData),
        text: journalEntry?.text ?? "",
        photo: journalEntry?.photoData ?? null,
        dayNumber: journalCount + (journalEntry ? 0 : 1),
      },
      habits: habitChecks.map((h) => h.name),
    });
  } catch (error) {
    console.error("Today screen error:", error);
    return NextResponse.json({ error: "Failed to load today data" }, { status: 500 });
  }
}
