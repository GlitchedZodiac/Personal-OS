import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  startOfWeek,
  endOfWeek,
} from "date-fns";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

export async function GET() {
  try {
    const now = new Date();
    const weekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(subDays(now, 1), { weekStartsOn: 1 });     // Sunday
    const prevWeekStart = subDays(weekStart, 7);
    const prevWeekEnd = subDays(weekStart, 1);

    // Fetch all data for the past week and previous week in parallel
    const [
      foodLogs,
      prevFoodLogs,
      workoutLogs,
      prevWorkoutLogs,
      bodyMeasurements,
      waterLogs,
      prevWaterLogs,
    ] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: startOfDay(weekStart), lte: endOfDay(weekEnd) } },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: startOfDay(prevWeekStart), lte: endOfDay(prevWeekEnd) } },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: startOfDay(weekStart), lte: endOfDay(weekEnd) } },
        orderBy: { startedAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: startOfDay(prevWeekStart), lte: endOfDay(prevWeekEnd) } },
      }),
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: subDays(now, 30) } },
        orderBy: { measuredAt: "desc" },
        take: 10,
      }),
      prisma.waterLog.findMany({
        where: { loggedAt: { gte: startOfDay(weekStart), lte: endOfDay(weekEnd) } },
      }),
      prisma.waterLog.findMany({
        where: { loggedAt: { gte: startOfDay(prevWeekStart), lte: endOfDay(prevWeekEnd) } },
      }),
    ]);

    // ── Aggregate stats ──────────────────────────────────────────────

    // Food stats
    const foodDays = new Set(foodLogs.map((l) => format(l.loggedAt, "yyyy-MM-dd")));
    const totalCalories = foodLogs.reduce((s, l) => s + l.calories, 0);
    const totalProtein = foodLogs.reduce((s, l) => s + l.proteinG, 0);
    const totalCarbs = foodLogs.reduce((s, l) => s + l.carbsG, 0);
    const totalFat = foodLogs.reduce((s, l) => s + l.fatG, 0);
    const daysLogged = foodDays.size;
    const avgCalories = daysLogged > 0 ? Math.round(totalCalories / daysLogged) : 0;
    const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;

    const prevTotalCal = prevFoodLogs.reduce((s, l) => s + l.calories, 0);
    const prevDays = new Set(prevFoodLogs.map((l) => format(l.loggedAt, "yyyy-MM-dd"))).size;
    const prevAvgCal = prevDays > 0 ? Math.round(prevTotalCal / prevDays) : 0;

    // Workout stats
    const totalWorkouts = workoutLogs.length;
    const totalWorkoutMinutes = workoutLogs.reduce((s, l) => s + (l.durationMinutes || 0), 0);
    const totalBurned = workoutLogs.reduce((s, l) => s + (l.caloriesBurned || 0), 0);
    const prevTotalWorkouts = prevWorkoutLogs.length;

    // Water stats
    const totalWaterMl = waterLogs.reduce((s, l) => s + l.amountMl, 0);
    const prevWaterMl = prevWaterLogs.reduce((s, l) => s + l.amountMl, 0);

    // Body stats
    const latestWeight = bodyMeasurements.find((m) => m.weightKg)?.weightKg ?? null;
    const oldestWeight = [...bodyMeasurements].reverse().find((m) => m.weightKg)?.weightKg ?? null;
    const weightChange =
      latestWeight && oldestWeight
        ? Math.round((latestWeight - oldestWeight) * 10) / 10
        : null;

    // ── Build report ─────────────────────────────────────────────────
    const report = {
      weekOf: format(weekStart, "MMM d") + " – " + format(weekEnd, "MMM d, yyyy"),
      nutrition: {
        daysLogged,
        avgCalories,
        avgProtein,
        totalCalories: Math.round(totalCalories),
        totalProtein: Math.round(totalProtein),
        totalCarbs: Math.round(totalCarbs),
        totalFat: Math.round(totalFat),
        caloriesTrend: prevAvgCal > 0 ? avgCalories - prevAvgCal : null,
      },
      workouts: {
        total: totalWorkouts,
        totalMinutes: totalWorkoutMinutes,
        totalBurned: Math.round(totalBurned),
        workoutsTrend: prevTotalWorkouts > 0 ? totalWorkouts - prevTotalWorkouts : null,
      },
      hydration: {
        totalMl: totalWaterMl,
        avgGlassesPerDay: daysLogged > 0 ? Math.round(totalWaterMl / daysLogged / 250) : 0,
        trend: prevWaterMl > 0 ? totalWaterMl - prevWaterMl : null,
      },
      body: {
        latestWeight,
        weightChange,
      },
    };

    // ── AI Coach Summary ────────────────────────────────────────────
    let aiSummary = "";
    try {
      const dataContext = `Week of ${report.weekOf}:
- Days logged: ${daysLogged}/7
- Avg daily calories: ${avgCalories} kcal
- Avg daily protein: ${avgProtein}g
- Total workouts: ${totalWorkouts} (${totalWorkoutMinutes} min)
- Calories burned: ${Math.round(totalBurned)}
- Water: ${Math.round(totalWaterMl / 250)} glasses total
${latestWeight ? `- Current weight: ${latestWeight}kg` : ""}
${weightChange !== null ? `- Weight change (month): ${weightChange > 0 ? "+" : ""}${weightChange}kg` : ""}
vs. Previous week:
- Avg calories: ${prevAvgCal} kcal (${avgCalories - prevAvgCal > 0 ? "+" : ""}${avgCalories - prevAvgCal} change)
- Workouts: ${prevTotalWorkouts} (${totalWorkouts - prevTotalWorkouts > 0 ? "+" : ""}${totalWorkouts - prevTotalWorkouts} change)`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content:
              "You are a concise, motivating fitness coach writing a Sunday weekly recap. Give 3-4 sentences: celebrate wins, identify one area to improve, and give one specific actionable tip for next week. Use **bold** for key numbers. Be warm and encouraging.",
          },
          {
            role: "user",
            content: `Write my weekly fitness recap based on this data:\n${dataContext}`,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: 200,
      });
      aiSummary =
        completion.choices[0].message?.content?.trim() ||
        "Great week! Keep up the consistency.";
    } catch (err) {
      console.error("Weekly report AI error:", err);
      aiSummary = "Keep pushing — consistency is everything! 💪";
    }

    return NextResponse.json({
      ...report,
      aiSummary,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Weekly report error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly report" },
      { status: 500 }
    );
  }
}
