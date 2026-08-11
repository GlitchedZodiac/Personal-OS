import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";
import { generateChatText } from "@/lib/openai-text";
import { COACH_MODEL } from "@/lib/openai";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

// The Sunday Report (design 2026-08-11e rev): one Mon–Sun week, computed
// from the real logs and finished with a COACH_MODEL headline + paragraph.
// Generated Sunday night by cron (or on demand for any past week) and
// persisted to weekly_reports so opening it is instant and the copy is
// stable — a report re-read a month later must not rewrite itself.

interface SettingsData {
  calorieTarget?: number;
  proteinPct?: number;
  carbsPct?: number;
  fatPct?: number;
}

export interface WeeklyReportData {
  weekStart: string; // Mon YYYY-MM-DD
  weekEnd: string; // Sun YYYY-MM-DD
  weekNumber: number;
  writtenAt: string;
  headline: string;
  coach: string;
  calorieTarget: number;
  energy: {
    avgInKcal: number | null;
    avgBurnedKcal: number | null;
    dailyDeficitKcal: number | null;
    weekDeficitKcal: number | null;
    days: { date: string; inKcal: number; burnedKcal: number }[];
  };
  macros: {
    adherencePct: { protein: number | null; carbs: number | null; fat: number | null };
    proteinDaysHit: number;
    loggedDays: number;
    note: string;
  };
  training: {
    sessions: number;
    volumeKg: number;
    activeMinutes: number;
    kcalBurned: number;
    zonesPct: number[] | null;
  };
  weight: {
    startKg: number | null;
    endKg: number | null;
    deltaKg: number | null;
    series: number[];
  };
}

function isoWeekNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Compute + persist the report for the week containing `dayInWeek`. */
export async function generateWeeklyReport(dayInWeek: string, timeZone: string) {
  const weekStart = getWeekStartDateString(dayInWeek, 1);
  const weekEnd = addDaysToDateString(weekStart, 6);
  const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
    weekStart,
    weekEnd,
    timeZone
  );

  const [settingsRow, food, workouts, weighIns] = await Promise.all([
    prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
    prisma.foodLog.findMany({
      where: { loggedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.workoutLog.findMany({
      where: { startedAt: { gte: rangeStart, lte: rangeEnd } },
      select: {
        startedAt: true,
        durationMinutes: true,
        caloriesBurned: true,
        exercises: true,
        metricsData: true,
      },
    }),
    prisma.bodyMeasurement.findMany({
      where: { measuredAt: { gte: rangeStart, lte: rangeEnd }, weightKg: { not: null } },
      orderBy: { measuredAt: "asc" },
      select: { measuredAt: true, weightKg: true },
    }),
  ]);

  const settings = (settingsRow?.data ?? {}) as SettingsData;
  const goal = settings.calorieTarget ?? 2000;
  const proteinGoalG = Math.round((goal * (settings.proteinPct ?? 30)) / 100 / 4);
  const carbsGoalG = Math.round((goal * (settings.carbsPct ?? 40)) / 100 / 4);
  const fatGoalG = Math.round((goal * (settings.fatPct ?? 30)) / 100 / 9);

  // Per-day energy in/burned across the 7 local days.
  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) dayKeys.push(addDaysToDateString(weekStart, i));
  const inByDay = new Map<string, { kcal: number; p: number; c: number; f: number }>();
  for (const f of food) {
    const day = getDateStringInTimeZone(f.loggedAt, timeZone);
    const b = inByDay.get(day) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    b.kcal += f.calories;
    b.p += f.proteinG;
    b.c += f.carbsG;
    b.f += f.fatG;
    inByDay.set(day, b);
  }
  const burnByDay = new Map<string, number>();
  let volumeKg = 0;
  let activeMinutes = 0;
  let trainKcal = 0;
  const zoneSeconds = [0, 0, 0, 0, 0];
  let zonesTotal = 0;
  for (const w of workouts) {
    const day = getDateStringInTimeZone(w.startedAt, timeZone);
    burnByDay.set(day, (burnByDay.get(day) ?? 0) + Math.round(w.caloriesBurned ?? 0));
    volumeKg += sessionVolumeKg(w.exercises);
    activeMinutes += w.durationMinutes ?? 0;
    trainKcal += Math.round(w.caloriesBurned ?? 0);
    const z = (w.metricsData as { timeInZones?: { seconds: number[] } } | null)
      ?.timeInZones;
    if (z?.seconds?.length === 5) {
      z.seconds.forEach((s, i) => (zoneSeconds[i] += s));
      zonesTotal += z.seconds.reduce((a, b) => a + b, 0);
    }
  }

  const loggedDays = [...inByDay.keys()].length;
  const days = dayKeys.map((date) => ({
    date,
    inKcal: Math.round(inByDay.get(date)?.kcal ?? 0),
    burnedKcal: burnByDay.get(date) ?? 0,
  }));
  const avgIn =
    loggedDays > 0
      ? Math.round(
          [...inByDay.values()].reduce((s, d) => s + d.kcal, 0) / loggedDays
        )
      : null;
  // Burned = training burn only (no BMR model yet) — the report says so.
  const burnedDays = days.filter((d) => d.burnedKcal > 0).length;
  const avgBurned =
    burnedDays > 0
      ? Math.round(days.reduce((s, d) => s + d.burnedKcal, 0) / burnedDays)
      : null;

  // Adherence: average daily intake vs target, capped at 100 per macro.
  const adherence = (eatenAvg: number | null, target: number) =>
    eatenAvg == null || target <= 0
      ? null
      : Math.min(100, Math.round((eatenAvg / target) * 100));
  const avgOf = (pick: (d: { p: number; c: number; f: number }) => number) =>
    loggedDays > 0
      ? [...inByDay.values()].reduce((s, d) => s + pick(d), 0) / loggedDays
      : null;
  const avgP = avgOf((d) => d.p);
  const proteinDaysHit = [...inByDay.values()].filter((d) => d.p >= proteinGoalG).length;

  const startKg = weighIns[0]?.weightKg ?? null;
  const endKg = weighIns.length > 0 ? weighIns[weighIns.length - 1].weightKg : null;

  const zonesPct =
    zonesTotal > 0
      ? zoneSeconds.map((s) => Math.round((s / zonesTotal) * 100))
      : null;

  const stats: Omit<WeeklyReportData, "headline" | "coach" | "writtenAt"> = {
    weekStart,
    weekEnd,
    weekNumber: isoWeekNumber(weekStart),
    calorieTarget: goal,
    energy: {
      avgInKcal: avgIn,
      avgBurnedKcal: avgBurned,
      dailyDeficitKcal: avgIn != null ? goal - avgIn : null,
      weekDeficitKcal:
        avgIn != null ? Math.round((goal - avgIn) * loggedDays) : null,
      days,
    },
    macros: {
      adherencePct: {
        protein: adherence(avgP, proteinGoalG),
        carbs: adherence(avgOf((d) => d.c), carbsGoalG),
        fat: adherence(avgOf((d) => d.f), fatGoalG),
      },
      proteinDaysHit,
      loggedDays,
      note:
        loggedDays > 0
          ? `Protein ≥ ${proteinGoalG} g on ${proteinDaysHit} of ${loggedDays} logged days.`
          : "No food logged this week.",
    },
    training: {
      sessions: workouts.length,
      volumeKg: Math.round(volumeKg),
      activeMinutes,
      kcalBurned: trainKcal,
      zonesPct,
    },
    weight: {
      startKg,
      endKg,
      deltaKg:
        startKg != null && endKg != null
          ? Math.round((endKg - startKg) * 10) / 10
          : null,
      series: weighIns.map((w) => w.weightKg as number),
    },
  };

  // The AI writes the headline + coach paragraph from the real numbers.
  let headline = "The week, in numbers.";
  let coach = "";
  try {
    const { text } = await generateChatText({
      model: COACH_MODEL,
      surface: "weekly_report",
      maxCompletionTokens: 2400,
      retryMaxCompletionTokens: 3400,
      reasoningEffort: "low",
      messages: [
        {
          role: "system",
          content:
            "You are the coach inside Pitaya, a single-user health app (kettlebell training + calorie tracking). Write the Sunday weekly report. Voice: sharp, warm, concrete — a coach who reads the numbers and says what they mean. No markdown. Respond as JSON: {\"headline\": string, \"coach\": string}. headline: max 8 words, verdict-first (e.g. 'On plan. Deficit held, volume up.'). coach: one paragraph, 60-110 words: what drove the week, one thing the numbers warn about, one concrete instruction for next week. Use ONLY the numbers provided; if food logging was sparse, say so plainly. Burned kcal = training burn only.",
        },
        { role: "user", content: JSON.stringify(stats) },
      ],
    });
    const parsed = JSON.parse((text ?? "").replace(/^```json?\s*|\s*```$/g, ""));
    if (typeof parsed.headline === "string" && parsed.headline.trim())
      headline = parsed.headline.trim();
    if (typeof parsed.coach === "string") coach = parsed.coach.trim();
  } catch (err) {
    console.warn("Weekly report AI generation failed:", (err as Error)?.message);
  }

  const data: WeeklyReportData = {
    ...stats,
    headline,
    coach,
    writtenAt: new Date().toISOString(),
  };

  await prisma.weeklyReport.upsert({
    where: { weekStart },
    update: { data: data as object },
    create: { weekStart, data: data as object },
  });

  return data;
}
