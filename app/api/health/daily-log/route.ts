import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay, endOfDay, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = parseInt(searchParams.get("range") || "30");
    const startDate = startOfDay(subDays(new Date(), range));
    const endDate = endOfDay(new Date());

    const [foodLogs, workoutLogs, waterLogs] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: startDate, lte: endDate } },
        orderBy: { loggedAt: "asc" },
        select: {
          loggedAt: true,
          mealType: true,
          foodDescription: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: startDate, lte: endDate } },
        orderBy: { startedAt: "asc" },
        select: {
          startedAt: true,
          workoutType: true,
          description: true,
          durationMinutes: true,
          caloriesBurned: true,
        },
      }),
      prisma.waterLog.findMany({
        where: { loggedAt: { gte: startDate, lte: endDate } },
        orderBy: { loggedAt: "asc" },
        select: { loggedAt: true, amountMl: true },
      }),
    ]);

    // Build day-by-day map
    const days: Record<string, {
      date: string;
      foods: Array<{ meal: string; description: string; calories: number; protein: number; carbs: number; fat: number }>;
      workouts: Array<{ type: string; description: string | null; minutes: number; burned: number }>;
      totalCalories: number;
      totalProtein: number;
      totalCarbs: number;
      totalFat: number;
      totalBurned: number;
      workoutMinutes: number;
      waterMl: number;
    }> = {};

    // Init all days in range
    let cur = new Date(startDate);
    while (cur <= endDate) {
      const key = format(cur, "yyyy-MM-dd");
      days[key] = {
        date: key,
        foods: [],
        workouts: [],
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalBurned: 0,
        workoutMinutes: 0,
        waterMl: 0,
      };
      cur = new Date(cur.getTime() + 86400000);
    }

    foodLogs.forEach((f) => {
      const key = format(new Date(f.loggedAt), "yyyy-MM-dd");
      if (days[key]) {
        days[key].foods.push({
          meal: f.mealType,
          description: f.foodDescription,
          calories: f.calories,
          protein: f.proteinG,
          carbs: f.carbsG,
          fat: f.fatG,
        });
        days[key].totalCalories += f.calories;
        days[key].totalProtein += f.proteinG;
        days[key].totalCarbs += f.carbsG;
        days[key].totalFat += f.fatG;
      }
    });

    workoutLogs.forEach((w) => {
      const key = format(new Date(w.startedAt), "yyyy-MM-dd");
      if (days[key]) {
        days[key].workouts.push({
          type: w.workoutType,
          description: w.description,
          minutes: w.durationMinutes,
          burned: w.caloriesBurned || 0,
        });
        days[key].totalBurned += w.caloriesBurned || 0;
        days[key].workoutMinutes += w.durationMinutes;
      }
    });

    waterLogs.forEach((w) => {
      const key = format(new Date(w.loggedAt), "yyyy-MM-dd");
      if (days[key]) {
        days[key].waterMl += w.amountMl;
      }
    });

    // Return as sorted array (newest first for the table)
    const result = Object.values(days).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ days: result });
  } catch (error) {
    console.error("Daily log error:", error);
    return NextResponse.json({ error: "Failed to fetch daily log" }, { status: 500 });
  }
}
