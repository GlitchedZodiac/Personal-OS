import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, parse } from "date-fns";

// Parse a "yyyy-MM-dd" string in LOCAL time (not UTC)
function parseLocalDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

// GET - Daily health summary
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Food totals for the day
    const foodLogs = await prisma.foodLog.findMany({
      where: {
        loggedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const totalCalories = foodLogs.reduce((sum, f) => sum + f.calories, 0);
    const totalProtein = foodLogs.reduce((sum, f) => sum + f.proteinG, 0);
    const totalCarbs = foodLogs.reduce((sum, f) => sum + f.carbsG, 0);
    const totalFat = foodLogs.reduce((sum, f) => sum + f.fatG, 0);

    // Latest body measurement
    const latestMeasurement = await prisma.bodyMeasurement.findFirst({
      orderBy: { measuredAt: "desc" },
    });

    // Workouts for the day
    const workouts = await prisma.workoutLog.findMany({
      where: {
        startedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const workoutMinutes = workouts.reduce(
      (sum, w) => sum + w.durationMinutes,
      0
    );
    const caloriesBurned = workouts.reduce(
      (sum, w) => sum + (w.caloriesBurned || 0),
      0
    );

    // Water for the day (graceful if table doesn't exist yet)
    let waterMl = 0;
    let waterGlasses = 0;
    try {
      if (prisma.waterLog) {
        const waterLogs = await prisma.waterLog.findMany({
          where: {
            loggedAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });
        waterMl = waterLogs.reduce((sum, w) => sum + w.amountMl, 0);
        waterGlasses = waterLogs.length;
      }
    } catch {
      // Water table might not exist yet — that's ok
    }

    return NextResponse.json({
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      mealCount: foodLogs.length,
      latestWeight: latestMeasurement?.weightKg || null,
      latestBodyFat: latestMeasurement?.bodyFatPct || null,
      workoutCount: workouts.length,
      workoutMinutes,
      caloriesBurned,
      netCalories: totalCalories - caloriesBurned,
      waterMl,
      waterGlasses,
    });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
