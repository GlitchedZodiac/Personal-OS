import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/utils";

// GET - Daily health summary (optimized with aggregates — no full row fetches)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const dateFilter = { gte: dayStart, lte: dayEnd };

    // Run all aggregations in parallel — DB does the math, not JS
    const [foodAgg, latestMeasurement, workoutAgg, waterAgg] =
      await Promise.all([
        prisma.foodLog.aggregate({
          where: { loggedAt: dateFilter },
          _sum: {
            calories: true,
            proteinG: true,
            carbsG: true,
            fatG: true,
          },
          _count: true,
        }),
        prisma.bodyMeasurement.findFirst({
          where: { weightKg: { not: null } },
          orderBy: { measuredAt: "desc" },
          select: { weightKg: true, bodyFatPct: true },
        }),
        prisma.workoutLog.aggregate({
          where: { startedAt: dateFilter },
          _sum: {
            durationMinutes: true,
            caloriesBurned: true,
          },
          _count: true,
        }),
        prisma.waterLog
          .aggregate({
            where: { loggedAt: dateFilter },
            _sum: { amountMl: true },
            _count: true,
          })
          .catch(() => ({ _sum: { amountMl: null }, _count: 0 })),
      ]);

    const totalCalories = foodAgg._sum.calories ?? 0;
    const totalProtein = foodAgg._sum.proteinG ?? 0;
    const totalCarbs = foodAgg._sum.carbsG ?? 0;
    const totalFat = foodAgg._sum.fatG ?? 0;
    const workoutMinutes = workoutAgg._sum.durationMinutes ?? 0;
    const caloriesBurned = workoutAgg._sum.caloriesBurned ?? 0;
    const waterMl = waterAgg._sum.amountMl ?? 0;

    return NextResponse.json({
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      mealCount: foodAgg._count,
      latestWeight: latestMeasurement?.weightKg ?? null,
      latestBodyFat: latestMeasurement?.bodyFatPct ?? null,
      workoutCount: workoutAgg._count,
      workoutMinutes,
      caloriesBurned,
      netCalories: totalCalories - caloriesBurned,
      waterMl,
      waterGlasses: waterAgg._count,
    });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
