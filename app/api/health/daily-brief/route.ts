import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yesterdayStart = startOfDay(subDays(now, 1));
    const yesterdayEnd = endOfDay(subDays(now, 1));
    const hour = now.getHours();

    // Get yesterday's data for the recap
    const [yesterdayFood, yesterdayWorkouts, todayTodos] = await Promise.all([
      prisma.foodLog.aggregate({
        where: {
          loggedAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        _sum: { calories: true, proteinG: true },
        _count: true,
      }),
      prisma.workoutLog.aggregate({
        where: {
          startedAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
        _sum: { durationMinutes: true, caloriesBurned: true },
        _count: true,
      }),
      prisma.todo.findMany({
        where: {
          completed: false,
          dueDate: { gte: todayStart, lte: todayEnd },
        },
        orderBy: [
          { priority: "desc" },
          { dueDate: "asc" },
        ],
        take: 5,
      }),
    ]);

    // Build brief
    const yCalories = Math.round(yesterdayFood._sum.calories || 0);
    const yProtein = Math.round(yesterdayFood._sum.proteinG || 0);
    const yMeals = yesterdayFood._count;
    const yWorkouts = yesterdayWorkouts._count;
    const yWorkoutMins = yesterdayWorkouts._sum.durationMinutes || 0;
    const yCalBurned = Math.round(yesterdayWorkouts._sum.caloriesBurned || 0);

    // Build summary text
    const parts: string[] = [];

    if (yCalories > 0) {
      parts.push(`Yesterday: ${yCalories} cal across ${yMeals} meal${yMeals !== 1 ? "s" : ""}, ${yProtein}g protein.`);
    }

    if (yWorkouts > 0) {
      parts.push(`${yWorkouts} workout${yWorkouts !== 1 ? "s" : ""} (${yWorkoutMins} min, ${yCalBurned} cal burned).`);
    }

    if (parts.length === 0) {
      // No data yesterday
      if (hour < 12) {
        parts.push("Fresh start today! Ready to crush it?");
      } else {
        parts.push("Let's get some meals and activity logged today!");
      }
    }

    // Generate a contextual tip
    let tip = "";
    if (yProtein > 0 && yCalories > 0) {
      const proteinPctYesterday = (yProtein * 4 / yCalories) * 100;
      if (proteinPctYesterday < 25) {
        tip = "Your protein was a bit low yesterday — try adding some with your first meal today.";
      } else if (proteinPctYesterday > 35) {
        tip = "Great protein intake yesterday! Keep that up.";
      }
    }

    if (!tip && yWorkouts === 0 && hour < 12) {
      tip = "No workout yesterday — today's a great day to move your body!";
    }

    if (!tip && hour >= 17 && yCalories === 0) {
      tip = "Don't forget to log what you've eaten today!";
    }

    // Priority todo
    const priorityMap: Record<string, number> = { high: 3, normal: 2, low: 1 };
    const sortedTodos = todayTodos.sort(
      (a, b) => (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0)
    );
    const topPriority = sortedTodos[0]?.title || null;

    return NextResponse.json({
      greeting: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
      summary: parts.join(" "),
      tip,
      todosToday: todayTodos.length,
      topPriority,
    });
  } catch (error) {
    console.error("Daily brief error:", error);
    return NextResponse.json(
      { greeting: "morning", summary: "Welcome back!", tip: "", todosToday: 0, topPriority: null },
    );
  }
}
