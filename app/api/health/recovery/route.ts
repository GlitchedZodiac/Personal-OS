import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { estimateFluidMlFromFoodLogs } from "@/lib/hydration";
import { getUtcDayBounds, parseLocalDate } from "@/lib/utils";
import { getUtcDayBoundsForTimeZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/server-timezone";

type SettingsLike = {
  calorieTarget?: number;
  proteinPct?: number;
  workoutGoals?: {
    daysPerWeek?: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTargetsFromSettings(settings: SettingsLike | null) {
  const calorieTarget = Number(settings?.calorieTarget ?? 2000);
  const proteinPct = Number(settings?.proteinPct ?? 30);
  const proteinTarget = Math.round((calorieTarget * proteinPct) / 100 / 4);
  const plannedWorkoutDays = Number(settings?.workoutGoals?.daysPerWeek ?? 4);
  return {
    proteinTarget,
    plannedWorkoutDays: Number.isFinite(plannedWorkoutDays)
      ? plannedWorkoutDays
      : 4,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
    const requestedTimeZone = searchParams.get("timeZone");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const parsedOffset = tzOffsetMinutes !== null ? Number(tzOffsetMinutes) : null;
    let dayStart: Date;
    let dayEnd: Date;
    if (dateStr && parsedOffset !== null && Number.isFinite(parsedOffset)) {
      ({ dayStart, dayEnd } = getUtcDayBounds(dateStr, parsedOffset));
    } else if (dateStr) {
      const timeZone = await getUserTimeZone(requestedTimeZone);
      ({ dayStart, dayEnd } = getUtcDayBoundsForTimeZone(dateStr, timeZone));
    } else {
      dayStart = startOfDay(date);
      dayEnd = endOfDay(date);
    }

    const recentWindowStart = subDays(dayStart, 6);
    const loadWindowStart = subDays(dayStart, 2);

    const [settingsRow, foodAgg, foods, waterAgg, workoutTodayAgg, recentWorkouts] =
      await Promise.all([
        prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
        prisma.foodLog.aggregate({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          _sum: { proteinG: true },
        }),
        prisma.foodLog.findMany({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          select: { foodDescription: true, notes: true },
        }),
        prisma.waterLog.aggregate({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          _sum: { amountMl: true },
        }),
        prisma.workoutLog.aggregate({
          where: { startedAt: { gte: dayStart, lte: dayEnd } },
          _sum: { durationMinutes: true, caloriesBurned: true },
        }),
        prisma.workoutLog.findMany({
          where: { startedAt: { gte: recentWindowStart, lte: dayEnd } },
          select: { startedAt: true, durationMinutes: true, caloriesBurned: true },
        }),
      ]);

    const settings = (settingsRow?.data as SettingsLike | null) ?? null;
    const { proteinTarget, plannedWorkoutDays } = getTargetsFromSettings(settings);

    const proteinToday = foodAgg._sum.proteinG ?? 0;
    const proteinPct = proteinTarget > 0 ? (proteinToday / proteinTarget) * 100 : 0;

    const manualWaterMl = waterAgg._sum.amountMl ?? 0;
    const inferredWaterMl = estimateFluidMlFromFoodLogs(foods);
    const workoutMinutesToday = workoutTodayAgg._sum.durationMinutes ?? 0;
    const workoutAdjustmentMl = Math.round((workoutMinutesToday / 30) * 350);
    const hydrationTargetMl = 2500 + workoutAdjustmentMl;
    const hydrationTodayMl = manualWaterMl + inferredWaterMl;
    const hydrationPct = hydrationTargetMl > 0 ? (hydrationTodayMl / hydrationTargetMl) * 100 : 0;

    const loadWindowWorkouts = recentWorkouts.filter(
      (workout) => workout.startedAt >= loadWindowStart
    );
    const loadMinutes = loadWindowWorkouts.reduce(
      (sum, workout) => sum + workout.durationMinutes,
      0
    );
    const loadBurned = loadWindowWorkouts.reduce(
      (sum, workout) => sum + (workout.caloriesBurned ?? 0),
      0
    );
    const strainScore = clamp((loadMinutes / 240) * 100, 0, 100);
    const strainPenalty = clamp(strainScore * 0.55, 0, 45);

    const weeklyWorkoutDays = new Set(
      recentWorkouts.map((workout) => workout.startedAt.toISOString().slice(0, 10))
    ).size;
    const consistencyPct = clamp(
      (weeklyWorkoutDays / Math.max(1, plannedWorkoutDays)) * 100,
      0,
      100
    );

    const hydrationScore = clamp(hydrationPct, 0, 100);
    const proteinScore = clamp(proteinPct, 0, 100);
    const readinessScore = Math.round(
      hydrationScore * 0.35 +
        proteinScore * 0.35 +
        (100 - strainPenalty) * 0.2 +
        consistencyPct * 0.1
    );

    let recommendation = "Train as planned.";
    let workoutIntensity = "full";
    let calorieAdjustmentPct = 0;
    if (readinessScore < 50) {
      recommendation = "Recovery focus today: mobility and easy movement only.";
      workoutIntensity = "recovery";
      calorieAdjustmentPct = -8;
    } else if (readinessScore < 70) {
      recommendation = "Moderate day: reduce training intensity and prioritize hydration.";
      workoutIntensity = "moderate";
      calorieAdjustmentPct = -3;
    } else if (readinessScore > 85) {
      recommendation = "Green day: proceed with full training load.";
      workoutIntensity = "full";
      calorieAdjustmentPct = 3;
    }

    return NextResponse.json({
      score: readinessScore,
      factors: [
        {
          key: "hydration",
          label: "Hydration",
          value: Math.round(hydrationPct),
          target: 100,
          detail: `${Math.round(hydrationTodayMl)} / ${hydrationTargetMl} ml`,
        },
        {
          key: "protein",
          label: "Protein",
          value: Math.round(proteinPct),
          target: 100,
          detail: `${Math.round(proteinToday)} / ${proteinTarget} g`,
        },
        {
          key: "strain",
          label: "Recent training strain",
          value: Math.round(100 - strainPenalty),
          target: 75,
          detail: `${loadMinutes} min and ${Math.round(loadBurned)} kcal in last 3 days`,
        },
        {
          key: "consistency",
          label: "7-day consistency",
          value: Math.round(consistencyPct),
          target: 100,
          detail: `${weeklyWorkoutDays} active day${
            weeklyWorkoutDays === 1 ? "" : "s"
          } in last week`,
        },
      ],
      recommendation,
      adjustments: {
        workoutIntensity,
        calorieAdjustmentPct,
        hydrationTargetMl,
      },
    });
  } catch (error) {
    console.error("Recovery score error:", error);
    return NextResponse.json(
      { error: "Failed to calculate recovery score" },
      { status: 500 }
    );
  }
}
