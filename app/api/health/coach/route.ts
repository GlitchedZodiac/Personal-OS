import { NextRequest, NextResponse } from "next/server";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/utils";

type SettingsLike = {
  calorieTarget?: number;
  proteinPct?: number;
  workoutGoals?: {
    daysPerWeek?: number;
  };
};

function getTargetsFromSettings(settings: SettingsLike | null) {
  const calorieTarget = Number(settings?.calorieTarget ?? 2000);
  const proteinPct = Number(settings?.proteinPct ?? 30);
  const proteinTarget = Math.round((calorieTarget * proteinPct) / 100 / 4);
  const plannedWorkoutDays = Number(settings?.workoutGoals?.daysPerWeek ?? 4);
  return {
    calorieTarget,
    proteinTarget,
    plannedWorkoutDays: Number.isFinite(plannedWorkoutDays)
      ? plannedWorkoutDays
      : 4,
  };
}

function getCoachTasks(input: {
  avgProtein: number;
  proteinTarget: number;
  avgHydrationMl: number;
  workoutCount: number;
  plannedWorkoutDays: number;
}) {
  const tasks: string[] = [];

  if (input.avgProtein < input.proteinTarget * 0.8) {
    tasks.push("Prep 2 high-protein meals for the next 48 hours");
    tasks.push("Add one protein-first snack to your daily routine");
  }

  if (input.avgHydrationMl < 2200) {
    tasks.push("Set a hydration checkpoint at 11:00, 15:00, and 19:00");
  }

  if (input.workoutCount < input.plannedWorkoutDays) {
    tasks.push("Schedule your remaining workout sessions in calendar blocks");
  }

  if (tasks.length === 0) {
    tasks.push("Keep the same plan and increase one performance target by 5%");
  }

  return tasks;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStartParam = searchParams.get("weekStart");
    const weekStart = weekStartParam
      ? parseLocalDate(weekStartParam)
      : startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    const [settingsRow, foods, workouts, waters, completedTodos] = await Promise.all([
      prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: weekStart, lte: weekEnd } },
        select: { calories: true, proteinG: true, loggedAt: true },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: weekStart, lte: weekEnd } },
        select: { durationMinutes: true, caloriesBurned: true },
      }),
      prisma.waterLog.findMany({
        where: { loggedAt: { gte: weekStart, lte: weekEnd } },
        select: { amountMl: true },
      }),
      prisma.todo.count({
        where: { completed: true, completedAt: { gte: weekStart, lte: weekEnd } },
      }),
    ]);

    const settings = (settingsRow?.data as SettingsLike | null) ?? null;
    const { calorieTarget, proteinTarget, plannedWorkoutDays } =
      getTargetsFromSettings(settings);

    const elapsedDays = Math.max(
      1,
      Math.min(7, Math.floor((Date.now() - weekStart.getTime()) / 86_400_000) + 1)
    );

    const totalCalories = foods.reduce((sum, item) => sum + item.calories, 0);
    const totalProtein = foods.reduce((sum, item) => sum + item.proteinG, 0);
    const totalWaterMl = waters.reduce((sum, item) => sum + item.amountMl, 0);
    const workoutCount = workouts.length;
    const totalWorkoutMinutes = workouts.reduce(
      (sum, item) => sum + item.durationMinutes,
      0
    );
    const totalBurned = workouts.reduce(
      (sum, item) => sum + (item.caloriesBurned ?? 0),
      0
    );

    const avgCalories = totalCalories / elapsedDays;
    const avgProtein = totalProtein / elapsedDays;
    const avgHydrationMl = totalWaterMl / elapsedDays;

    const remainingWorkoutSessions = Math.max(
      plannedWorkoutDays - workoutCount,
      0
    );

    const focusAreas = [
      avgProtein < proteinTarget * 0.8 ? "Increase daily protein consistency" : null,
      avgHydrationMl < 2200 ? "Raise hydration pace earlier in the day" : null,
      workoutCount < plannedWorkoutDays
        ? "Protect workout blocks on your calendar"
        : "Maintain training momentum and recover well",
    ].filter(Boolean) as string[];

    const tasks = getCoachTasks({
      avgProtein,
      proteinTarget,
      avgHydrationMl,
      workoutCount,
      plannedWorkoutDays,
    });

    return NextResponse.json({
      week: {
        start: format(weekStart, "yyyy-MM-dd"),
        end: format(weekEnd, "yyyy-MM-dd"),
      },
      summary: {
        avgCalories: Math.round(avgCalories),
        calorieTarget,
        avgProtein: Math.round(avgProtein),
        proteinTarget,
        avgHydrationMl: Math.round(avgHydrationMl),
        workoutCount,
        plannedWorkoutDays,
        remainingWorkoutSessions,
        totalWorkoutMinutes,
        totalBurnedCalories: Math.round(totalBurned),
        completedTodos,
      },
      focusAreas,
      tasks,
      weeklyPlan: {
        training: remainingWorkoutSessions
          ? `Schedule ${remainingWorkoutSessions} focused session${
              remainingWorkoutSessions > 1 ? "s" : ""
            } before week close.`
          : "You are on top of your training schedule. Keep intensity controlled.",
        nutrition:
          avgProtein < proteinTarget
            ? `Raise protein to ${proteinTarget}g/day with one anchor meal per day.`
            : "Protein is on track. Keep meal quality and consistency high.",
        execution:
          completedTodos < 5
            ? "Run a 10-minute nightly review and lock tomorrow's priorities."
            : "Execution quality is good. Keep task batching and focus blocks.",
      },
    });
  } catch (error) {
    console.error("Weekly coach plan error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly coach plan" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tasks: string[] = Array.isArray(body.tasks) ? body.tasks : [];
    const weekStart = body.weekStart
      ? parseLocalDate(body.weekStart)
      : startOfWeek(new Date(), { weekStartsOn: 1 });

    if (tasks.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0 });
    }

    let created = 0;
    let skipped = 0;

    for (let index = 0; index < tasks.length; index++) {
      const title = tasks[index].trim();
      if (!title) {
        skipped++;
        continue;
      }

      const dueDate = addDays(weekStart, Math.min(index, 6));
      dueDate.setHours(12, 0, 0, 0);

      const existing = await prisma.todo.findFirst({
        where: {
          title,
          dueDate: {
            gte: new Date(dueDate.getTime() - 60_000),
            lte: new Date(dueDate.getTime() + 60_000),
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.todo.create({
        data: {
          title,
          dueDate,
          priority: "normal",
          category: "ai_coach",
          notes: "Created from weekly AI coach plan",
        },
      });
      created++;
    }

    return NextResponse.json({ created, skipped });
  } catch (error) {
    console.error("Weekly coach apply error:", error);
    return NextResponse.json(
      { error: "Failed to apply coach tasks" },
      { status: 500 }
    );
  }
}
