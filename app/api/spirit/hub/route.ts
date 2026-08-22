import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone, addDaysToDateString } from "@/lib/timezone";

// The Home mini-hub (00): three glance widgets — Training · Eating ·
// Measurements — real numbers from the phone's own tables, nothing
// redesigned. Plus the Spirit resume cards' server half.

export async function GET() {
  try {
    const now = new Date();
    const tz = DEFAULT_TIME_ZONE;
    const today = getDateStringInTimeZone(now, tz);
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(addDaysToDateString(today, -i));
    const since = new Date(now.getTime() - 8 * 86400_000);

    const [workouts, prs, foods, weights, series, sermonPages, latestRec] = await Promise.all([
      prisma.workoutLog.findMany({ where: { startedAt: { gte: since } }, select: { startedAt: true, workoutType: true } }),
      prisma.personalRecord.findMany({ where: { achievedAt: { gte: since } }, select: { achievedAt: true } }),
      prisma.foodLog.findMany({ where: { loggedAt: { gte: since } }, select: { loggedAt: true, calories: true } }),
      prisma.bodyMeasurement.findMany({ where: { weightKg: { not: null } }, orderBy: { measuredAt: "desc" }, take: 30, select: { measuredAt: true, weightKg: true } }),
      prisma.churchSeries.findFirst({ where: { status: "active" } }),
      prisma.inkPage.findMany({ where: { kind: "sermon" }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, title: true, subtitle: true, updatedAt: true, recordingId: true, transcribedAt: true, refs: true, seriesId: true, weekIndex: true } }),
      prisma.recording.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true, durationSec: true, status: true, pageId: true } }),
    ]);

    const dayOf = (d: Date) => getDateStringInTimeZone(d, tz);
    const weekStart = days[days.length - 1];
    // Monday of this week (Bogotá)
    const dow = new Date(`${today}T12:00:00`).getDay(); // 0 Sun..6 Sat (approximate, noon avoids DST edges)
    const mondayOffset = (dow + 6) % 7;
    const monday = addDaysToDateString(today, -mondayOffset);
    void weekStart;

    const sessionsThisWeek = workouts.filter((w) => dayOf(w.startedAt) >= monday).length;
    const prsThisWeek = prs.filter((p) => dayOf(p.achievedAt) >= monday).length;
    const trainingSpark = days.map((d) => workouts.filter((w) => dayOf(w.startedAt) === d).length);

    const kcalByDay = days.map((d) => foods.filter((f) => dayOf(f.loggedAt) === d).reduce((s, f) => s + (f.calories || 0), 0));
    const kcalToday = kcalByDay[kcalByDay.length - 1] ?? 0;
    const loggedDays = kcalByDay.filter((k) => k > 0).length;

    const last7 = weights.filter((w) => dayOf(w.measuredAt) >= days[0]);
    const prior7 = weights.filter((w) => dayOf(w.measuredAt) < days[0]);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const w7 = avg(last7.map((w) => w.weightKg as number));
    const wPrior = avg(prior7.map((w) => w.weightKg as number));
    const weightSpark = days.map((d) => {
      const ws = weights.filter((w) => dayOf(w.measuredAt) === d).map((w) => w.weightKg as number);
      return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
    });
    const lastWeight = weights[0] ?? null;

    const sermonPage = sermonPages[0] ?? null;
    const rec = latestRec && sermonPage && latestRec.pageId === sermonPage.id ? latestRec : null;

    return NextResponse.json({
      today,
      training: { sessionsThisWeek, prsThisWeek, spark: trainingSpark, lastType: workouts[0]?.workoutType ?? null },
      eating: { kcalToday: Math.round(kcalToday), loggedDays, spark: kcalByDay.map((k) => Math.round(k)) },
      measurements: {
        // the 7-day average when the week has weigh-ins; otherwise the latest weigh-in (he weighs in weekly-ish)
        weight7dAvg: w7 ? Math.round(w7 * 10) / 10 : lastWeight?.weightKg ? Math.round((lastWeight.weightKg as number) * 10) / 10 : null,
        delta: w7 && wPrior ? Math.round((w7 - wPrior) * 10) / 10 : weights.length >= 2 && lastWeight ? Math.round(((lastWeight.weightKg as number) - (weights[1].weightKg as number)) * 10) / 10 : null,
        lastMeasuredAt: lastWeight?.measuredAt ?? null,
        spark: weightSpark,
      },
      sunday: series
        ? {
            seriesId: series.id,
            title: series.title,
            currentWeek: series.currentWeek,
            expectedWeeks: series.expectedWeeks,
            page: sermonPage,
            recording: rec,
            isSunday: new Date(`${today}T12:00:00`).getDay() === 0,
          }
        : null,
    });
  } catch (error) {
    console.error("Spirit hub error:", error);
    return NextResponse.json({ error: "Failed to load hub" }, { status: 500 });
  }
}
