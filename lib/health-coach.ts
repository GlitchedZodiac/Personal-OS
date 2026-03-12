import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getUtcDayBoundsForTimeZone,
} from "@/lib/timezone";

type SettingsLike = {
  calorieTarget?: number;
  proteinPct?: number;
  carbsPct?: number;
  fatPct?: number;
  workoutGoals?: {
    daysPerWeek?: number;
  };
};

export type CoachTargets = {
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  plannedWorkoutDays: number;
};

export function getCoachTargets(settings: SettingsLike | null | undefined): CoachTargets {
  const calorieTarget = Number(settings?.calorieTarget ?? 2000);
  const proteinPct = Number(settings?.proteinPct ?? 30);
  const carbsPct = Number(settings?.carbsPct ?? 40);
  const fatPct = Number(settings?.fatPct ?? 30);
  const plannedWorkoutDays = Number(settings?.workoutGoals?.daysPerWeek ?? 4);

  return {
    calorieTarget,
    proteinTargetG: Math.round((calorieTarget * proteinPct) / 100 / 4),
    carbsTargetG: Math.round((calorieTarget * carbsPct) / 100 / 4),
    fatTargetG: Math.round((calorieTarget * fatPct) / 100 / 9),
    plannedWorkoutDays: Number.isFinite(plannedWorkoutDays)
      ? plannedWorkoutDays
      : 4,
  };
}

export async function getStoredCoachTargets() {
  const row = await prisma.userSettings.findUnique({
    where: { id: "default" },
    select: { data: true },
  });

  return getCoachTargets((row?.data as SettingsLike | null) ?? null);
}

export function getCoachLanguageLabel(aiLanguage?: string | null) {
  const labels: Record<string, string> = {
    english: "English",
    spanish: "Spanish",
    portuguese: "Portuguese",
    french: "French",
  };

  return labels[aiLanguage || "english"] || "English";
}

export function buildCoachStyleGuide(responseLanguage: string) {
  return [
    `You are a precise performance coach. Respond in ${responseLanguage}.`,
    "Be direct, specific, and metric-aware.",
    "Keep it mobile-friendly: 2-4 short paragraphs or compact bullets.",
    "Use only numbers supplied in the context.",
    "Say what is on track, what is off track, and the single best next action.",
    "Avoid filler, hype, or generic wellness language.",
  ].join("\n");
}

export async function getDailyHealthContext(timeZone: string, localDate?: string | null) {
  const dateStr = localDate || getDateStringInTimeZone(new Date(), timeZone);
  const yesterday = addDaysToDateString(dateStr, -1);
  const { dayStart, dayEnd } = getUtcDayBoundsForTimeZone(dateStr, timeZone);
  const { dayStart: yesterdayStart, dayEnd: yesterdayEnd } =
    getUtcDayBoundsForTimeZone(yesterday, timeZone);

  const [todayFood, todayWorkouts, todayWater, yesterdayFood, yesterdayWorkouts] =
    await Promise.all([
      prisma.foodLog.aggregate({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
        _count: true,
      }),
      prisma.workoutLog.aggregate({
        where: { startedAt: { gte: dayStart, lte: dayEnd } },
        _sum: {
          durationMinutes: true,
          caloriesBurned: true,
          distanceMeters: true,
          stepCount: true,
        },
        _count: true,
      }),
      prisma.waterLog.aggregate({
        where: { loggedAt: { gte: dayStart, lte: dayEnd } },
        _sum: { amountMl: true },
        _count: true,
      }),
      prisma.foodLog.aggregate({
        where: { loggedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
        _sum: { calories: true, proteinG: true },
        _count: true,
      }),
      prisma.workoutLog.aggregate({
        where: { startedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
        _sum: { durationMinutes: true, caloriesBurned: true },
        _count: true,
      }),
    ]);

  return {
    localDate: dateStr,
    yesterdayDate: yesterday,
    today: {
      calories: Math.round(todayFood._sum.calories ?? 0),
      proteinG: Math.round(todayFood._sum.proteinG ?? 0),
      carbsG: Math.round(todayFood._sum.carbsG ?? 0),
      fatG: Math.round(todayFood._sum.fatG ?? 0),
      meals: todayFood._count,
      workoutCount: todayWorkouts._count,
      workoutMinutes: todayWorkouts._sum.durationMinutes ?? 0,
      caloriesBurned: Math.round(todayWorkouts._sum.caloriesBurned ?? 0),
      distanceMeters: Math.round(todayWorkouts._sum.distanceMeters ?? 0),
      stepCount: Math.round(todayWorkouts._sum.stepCount ?? 0),
      waterMl: Math.round(todayWater._sum.amountMl ?? 0),
      waterEntries: todayWater._count,
    },
    yesterday: {
      calories: Math.round(yesterdayFood._sum.calories ?? 0),
      proteinG: Math.round(yesterdayFood._sum.proteinG ?? 0),
      meals: yesterdayFood._count,
      workoutCount: yesterdayWorkouts._count,
      workoutMinutes: yesterdayWorkouts._sum.durationMinutes ?? 0,
      caloriesBurned: Math.round(yesterdayWorkouts._sum.caloriesBurned ?? 0),
    },
  };
}

export async function getWeeklyHealthContext(input: {
  timeZone: string;
  startDate: string;
  endDate: string;
}) {
  const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
    input.startDate,
    input.endDate,
    input.timeZone
  );

  const [foods, workouts, waters, measurements] = await Promise.all([
    prisma.foodLog.findMany({
      where: { loggedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
      orderBy: { loggedAt: "asc" },
    }),
    prisma.workoutLog.findMany({
      where: { startedAt: { gte: rangeStart, lte: rangeEnd } },
      select: {
        startedAt: true,
        workoutType: true,
        durationMinutes: true,
        caloriesBurned: true,
        distanceMeters: true,
        stepCount: true,
        avgHeartRateBpm: true,
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.waterLog.findMany({
      where: { loggedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { amountMl: true },
    }),
    prisma.bodyMeasurement.findMany({
      where: { measuredAt: { gte: rangeStart, lte: rangeEnd } },
      select: { measuredAt: true, weightKg: true, bodyFatPct: true, waistCm: true },
      orderBy: { measuredAt: "asc" },
    }),
  ]);

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    foods,
    workouts,
    waters,
    measurements,
  };
}
