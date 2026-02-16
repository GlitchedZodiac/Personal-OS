import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay, endOfDay, format, parse } from "date-fns";

function parseLocalDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

// GET - Trends data for charts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "30"; // days
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    let startDate: Date;
    let endDate: Date;

    if (fromDate && toDate) {
      startDate = startOfDay(parseLocalDate(fromDate));
      endDate = endOfDay(parseLocalDate(toDate));
    } else {
      const days = parseInt(range);
      startDate = startOfDay(subDays(new Date(), days));
      endDate = endOfDay(new Date());
    }

    // Fetch all data in the range
    const [foodLogs, bodyMeasurements, workoutLogs] = await Promise.all([
      prisma.foodLog.findMany({
        where: {
          loggedAt: { gte: startDate, lte: endDate },
        },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.bodyMeasurement.findMany({
        where: {
          measuredAt: { gte: startDate, lte: endDate },
        },
        orderBy: { measuredAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: {
          startedAt: { gte: startDate, lte: endDate },
        },
        orderBy: { startedAt: "asc" },
      }),
    ]);

    // Aggregate daily calories
    const dailyCalories: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};
    foodLogs.forEach((log) => {
      const day = format(new Date(log.loggedAt), "yyyy-MM-dd");
      if (!dailyCalories[day]) {
        dailyCalories[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
      }
      dailyCalories[day].calories += log.calories;
      dailyCalories[day].protein += log.proteinG;
      dailyCalories[day].carbs += log.carbsG;
      dailyCalories[day].fat += log.fatG;
      dailyCalories[day].count += 1;
    });

    // Format daily calories as array
    const caloriesChart = Object.entries(dailyCalories)
      .map(([date, data]) => ({
        date,
        ...data,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Weight trend
    const weightChart = bodyMeasurements
      .filter((m) => m.weightKg !== null)
      .map((m) => ({
        date: format(new Date(m.measuredAt), "yyyy-MM-dd"),
        weight: m.weightKg,
      }));

    // Body fat trend
    const bodyFatChart = bodyMeasurements
      .filter((m) => m.bodyFatPct !== null)
      .map((m) => ({
        date: format(new Date(m.measuredAt), "yyyy-MM-dd"),
        bodyFat: m.bodyFatPct,
      }));

    // Workout summary
    const dailyWorkouts: Record<string, { count: number; minutes: number; caloriesBurned: number }> = {};
    workoutLogs.forEach((log) => {
      const day = format(new Date(log.startedAt), "yyyy-MM-dd");
      if (!dailyWorkouts[day]) {
        dailyWorkouts[day] = { count: 0, minutes: 0, caloriesBurned: 0 };
      }
      dailyWorkouts[day].count += 1;
      dailyWorkouts[day].minutes += log.durationMinutes;
      dailyWorkouts[day].caloriesBurned += log.caloriesBurned || 0;
    });

    const workoutChart = Object.entries(dailyWorkouts)
      .map(([date, data]) => ({
        date,
        ...data,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Macro totals for pie chart
    const macroTotals = foodLogs.reduce(
      (acc, log) => ({
        protein: acc.protein + log.proteinG,
        carbs: acc.carbs + log.carbsG,
        fat: acc.fat + log.fatG,
      }),
      { protein: 0, carbs: 0, fat: 0 }
    );

    // Daily macro chart (for macro adherence over time)
    const macroChart = caloriesChart.map((day) => ({
      date: day.date,
      protein: Math.round(day.protein),
      carbs: Math.round(day.carbs),
      fat: Math.round(day.fat),
    }));

    // Circumference trends from body measurements
    const circumferenceChart = bodyMeasurements
      .filter(
        (m) =>
          m.waistCm !== null ||
          m.chestCm !== null ||
          m.armsCm !== null ||
          m.hipsCm !== null ||
          m.legsCm !== null ||
          m.neckCm !== null ||
          m.shouldersCm !== null
      )
      .map((m) => ({
        date: format(new Date(m.measuredAt), "yyyy-MM-dd"),
        waist: m.waistCm,
        chest: m.chestCm,
        arms: m.armsCm,
        hips: m.hipsCm,
        legs: m.legsCm,
        neck: m.neckCm,
        shoulders: m.shouldersCm,
      }));

    // Body composition chart (smart scale data)
    const bodyCompChart = bodyMeasurements
      .filter(
        (m) =>
          m.muscleMassKg !== null ||
          m.bodyWaterPct !== null ||
          m.visceralFat !== null ||
          m.bmrKcal !== null ||
          m.bmi !== null
      )
      .map((m) => ({
        date: format(new Date(m.measuredAt), "yyyy-MM-dd"),
        bmi: m.bmi,
        muscleMassKg: m.muscleMassKg,
        fatFreeWeightKg: m.fatFreeWeightKg,
        bodyWaterPct: m.bodyWaterPct,
        skeletalMusclePct: m.skeletalMusclePct,
        visceralFat: m.visceralFat,
        subcutaneousFatPct: m.subcutaneousFatPct,
        boneMassKg: m.boneMassKg,
        proteinPct: m.proteinPct,
        bmrKcal: m.bmrKcal,
        metabolicAge: m.metabolicAge,
        heartRateBpm: m.heartRateBpm,
      }));

    // Body fat change
    const bodyFatChange =
      bodyFatChart.length >= 2
        ? Math.round(
            ((bodyFatChart[bodyFatChart.length - 1].bodyFat as number) -
              (bodyFatChart[0].bodyFat as number)) *
              10
          ) / 10
        : null;

    return NextResponse.json({
      caloriesChart,
      weightChart,
      bodyFatChart,
      workoutChart,
      macroTotals,
      macroChart,
      circumferenceChart,
      bodyCompChart,
      summary: {
        avgCalories:
          caloriesChart.length > 0
            ? Math.round(
                caloriesChart.reduce((sum, d) => sum + d.calories, 0) /
                  caloriesChart.length
              )
            : 0,
        totalWorkouts: workoutLogs.length,
        totalWorkoutMinutes: workoutLogs.reduce(
          (sum, w) => sum + w.durationMinutes,
          0
        ),
        totalCaloriesBurned: Math.round(
          workoutLogs.reduce((sum, w) => sum + (w.caloriesBurned || 0), 0)
        ),
        weightChange:
          weightChart.length >= 2
            ? Math.round(
                ((weightChart[weightChart.length - 1].weight as number) -
                  (weightChart[0].weight as number)) *
                  10
              ) / 10
            : null,
        bodyFatChange,
        avgProtein:
          macroChart.length > 0
            ? Math.round(
                macroChart.reduce((s, d) => s + d.protein, 0) / macroChart.length
              )
            : 0,
        avgCarbs:
          macroChart.length > 0
            ? Math.round(
                macroChart.reduce((s, d) => s + d.carbs, 0) / macroChart.length
              )
            : 0,
        avgFat:
          macroChart.length > 0
            ? Math.round(
                macroChart.reduce((s, d) => s + d.fat, 0) / macroChart.length
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("Trends error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trends" },
      { status: 500 }
    );
  }
}
