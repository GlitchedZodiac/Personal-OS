import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, parse } from "date-fns";

/**
 * Daily brief API.
 * Accepts ?localDate=YYYY-MM-DD&localHour=HH from the client so we
 * always reason about the user's actual "today", not the server's UTC time.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const localDateStr = searchParams.get("localDate"); // e.g. "2026-02-17"
    const localHour = parseInt(searchParams.get("localHour") || String(new Date().getHours()));

    // Use client-provided date or fall back to server date
    const referenceDate = localDateStr
      ? parse(localDateStr, "yyyy-MM-dd", new Date())
      : new Date();

    const todayStart = startOfDay(referenceDate);
    const todayEnd = endOfDay(referenceDate);
    const yesterdayStart = startOfDay(subDays(referenceDate, 1));
    const yesterdayEnd = endOfDay(subDays(referenceDate, 1));

    // Fetch both today and yesterday data + todos
    const [todayFood, todayWorkouts, yesterdayFood, yesterdayWorkouts, todayTodos] =
      await Promise.all([
        prisma.foodLog.aggregate({
          where: { loggedAt: { gte: todayStart, lte: todayEnd } },
          _sum: { calories: true, proteinG: true },
          _count: true,
        }),
        prisma.workoutLog.aggregate({
          where: { startedAt: { gte: todayStart, lte: todayEnd } },
          _sum: { durationMinutes: true, caloriesBurned: true },
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
        prisma.todo.findMany({
          where: {
            completed: false,
            dueDate: { gte: todayStart, lte: todayEnd },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: 5,
        }),
      ]);

    // Today's stats
    const tCalories = Math.round(todayFood._sum.calories || 0);
    const tProtein = Math.round(todayFood._sum.proteinG || 0);
    const tMeals = todayFood._count;
    const tWorkouts = todayWorkouts._count;
    const tWorkoutMins = todayWorkouts._sum.durationMinutes || 0;
    const tCalBurned = Math.round(todayWorkouts._sum.caloriesBurned || 0);

    // Yesterday's stats
    const yCalories = Math.round(yesterdayFood._sum.calories || 0);
    const yProtein = Math.round(yesterdayFood._sum.proteinG || 0);
    const yMeals = yesterdayFood._count;
    const yWorkouts = yesterdayWorkouts._count;
    const yWorkoutMins = yesterdayWorkouts._sum.durationMinutes || 0;
    const yCalBurned = Math.round(yesterdayWorkouts._sum.caloriesBurned || 0);

    const parts: string[] = [];

    // Show today's progress if there's data
    if (tCalories > 0 || tWorkouts > 0) {
      if (tCalories > 0) {
        parts.push(
          `Today so far: ${tCalories} cal across ${tMeals} meal${tMeals !== 1 ? "s" : ""}, ${tProtein}g protein.`
        );
      }
      if (tWorkouts > 0) {
        parts.push(
          `${tWorkouts} workout${tWorkouts !== 1 ? "s" : ""} today (${tWorkoutMins} min, ${tCalBurned} cal burned).`
        );
      }
    }

    // Add yesterday's recap
    if (yCalories > 0 || yWorkouts > 0) {
      const yParts: string[] = [];
      if (yCalories > 0) {
        yParts.push(`${yCalories} cal, ${yProtein}g protein across ${yMeals} meal${yMeals !== 1 ? "s" : ""}`);
      }
      if (yWorkouts > 0) {
        yParts.push(`${yWorkouts} workout${yWorkouts !== 1 ? "s" : ""} (${yWorkoutMins} min, ${yCalBurned} cal burned)`);
      }
      if (parts.length > 0) {
        parts.push(`Yesterday: ${yParts.join(", ")}.`);
      } else {
        parts.push(`Yesterday you hit ${yParts.join(", ")}. Let's keep the momentum going!`);
      }
    }

    // Fallback if no data at all
    if (parts.length === 0) {
      if (localHour < 12) {
        parts.push("Fresh start today! Ready to crush it? 💪");
      } else {
        parts.push("Let's get some meals and activity logged today!");
      }
    }

    // Generate contextual tip
    let tip = "";
    if (tProtein > 0 && tCalories > 0) {
      const proteinPct = (tProtein * 4 / tCalories) * 100;
      if (proteinPct < 25) {
        tip = "Protein's a bit low today — try adding some with your next meal.";
      } else if (proteinPct > 35) {
        tip = "Great protein ratio today! Keep it up.";
      }
    } else if (yProtein > 0 && yCalories > 0) {
      const proteinPctYesterday = (yProtein * 4 / yCalories) * 100;
      if (proteinPctYesterday < 25) {
        tip = "Protein was a bit low yesterday — try boosting it today.";
      }
    }

    if (!tip && tWorkouts === 0 && yWorkouts === 0 && localHour < 14) {
      tip = "No workout in the last day — today's a great day to move your body!";
    }

    if (!tip && localHour >= 17 && tCalories === 0) {
      tip = "Don't forget to log what you've eaten today!";
    }

    // Priority todo
    const priorityMap: Record<string, number> = { high: 3, normal: 2, low: 1 };
    const sortedTodos = todayTodos.sort(
      (a, b) => (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0)
    );
    const topPriority = sortedTodos[0]?.title || null;

    return NextResponse.json({
      greeting: localHour < 12 ? "morning" : localHour < 17 ? "afternoon" : "evening",
      summary: parts.join(" "),
      tip,
      todosToday: todayTodos.length,
      topPriority,
    });
  } catch (error) {
    console.error("Daily brief error:", error);
    return NextResponse.json({
      greeting: "morning",
      summary: "Welcome back!",
      tip: "",
      todosToday: 0,
      topPriority: null,
    });
  }
}
