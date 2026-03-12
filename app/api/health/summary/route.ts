import { endOfDay, startOfDay } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { estimateFluidMlFromFoodLogs } from "@/lib/hydration";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getUtcDayBoundsForTimeZone } from "@/lib/timezone";
import { getUtcDayBounds, parseLocalDate } from "@/lib/utils";

// GET - Daily health summary
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
    const requestedTimeZone = searchParams.get("timeZone");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const parsedOffset =
      tzOffsetMinutes !== null ? Number(tzOffsetMinutes) : null;
    let dayStart: Date;
    let dayEnd: Date;
    let resolvedTimeZone: string | null = null;

    if (dateStr && parsedOffset !== null && Number.isFinite(parsedOffset)) {
      ({ dayStart, dayEnd } = getUtcDayBounds(dateStr, parsedOffset));
      resolvedTimeZone = await getUserTimeZone(requestedTimeZone);
    } else if (dateStr) {
      resolvedTimeZone = await getUserTimeZone(requestedTimeZone);
      ({ dayStart, dayEnd } = getUtcDayBoundsForTimeZone(
        dateStr,
        resolvedTimeZone
      ));
    } else {
      dayStart = startOfDay(date);
      dayEnd = endOfDay(date);
      resolvedTimeZone = await getUserTimeZone(requestedTimeZone);
    }

    const dateFilter = { gte: dayStart, lte: dayEnd };

    const [
      foodAgg,
      latestMeasurement,
      workoutAgg,
      waterAgg,
      foodLogsForHydration,
      dailyHealthSnapshot,
    ] = await Promise.all([
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
          distanceMeters: true,
          stepCount: true,
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
      prisma.foodLog.findMany({
        where: { loggedAt: dateFilter },
        select: { foodDescription: true, notes: true },
      }),
      dateStr && resolvedTimeZone
        ? prisma.dailyHealthSnapshot.findFirst({
            where: {
              localDate: dateStr,
              timeZone: resolvedTimeZone,
            },
            orderBy: { updatedAt: "desc" },
          })
        : null,
    ]);

    const totalCalories = foodAgg._sum.calories ?? 0;
    const totalProtein = foodAgg._sum.proteinG ?? 0;
    const totalCarbs = foodAgg._sum.carbsG ?? 0;
    const totalFat = foodAgg._sum.fatG ?? 0;
    const workoutMinutes = workoutAgg._sum.durationMinutes ?? 0;
    const caloriesBurned = workoutAgg._sum.caloriesBurned ?? 0;
    const manualWaterMl = waterAgg._sum.amountMl ?? 0;
    const inferredFluidMl = estimateFluidMlFromFoodLogs(foodLogsForHydration);
    const waterMl = manualWaterMl + inferredFluidMl;
    const workoutSteps = workoutAgg._sum.stepCount ?? 0;
    const snapshotSteps = dailyHealthSnapshot?.steps ?? 0;

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
      waterMlManual: manualWaterMl,
      waterMlInferred: inferredFluidMl,
      waterGlasses: waterAgg._count,
      distanceMeters: Math.round(workoutAgg._sum.distanceMeters ?? 0),
      steps: Math.max(snapshotSteps, workoutSteps),
      workoutSteps,
      restingHeartRateBpm: dailyHealthSnapshot?.restingHeartRateBpm ?? null,
      activeEnergyKcal: dailyHealthSnapshot?.activeEnergyKcal ?? null,
      walkingRunningDistanceMeters:
        dailyHealthSnapshot?.walkingRunningDistanceMeters ?? null,
      timeZone: resolvedTimeZone,
    });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
