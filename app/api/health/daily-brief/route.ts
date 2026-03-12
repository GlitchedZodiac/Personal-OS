import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDailyHealthContext, getStoredCoachTargets } from "@/lib/health-coach";
import { getDateStringInTimeZone, getHourInTimeZone, getUtcDayBoundsForTimeZone } from "@/lib/timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Daily brief API.
 * Accepts ?localDate=YYYY-MM-DD&localHour=HH from the client so we
 * always reason about the user's actual "today", not the server's UTC time.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTimeZone = searchParams.get("timeZone");
    const timeZone = await getUserTimeZone(requestedTimeZone);
    const now = new Date();
    const localDateParam = searchParams.get("localDate");
    const localDateStr =
      localDateParam && DATE_RE.test(localDateParam)
        ? localDateParam
        : getDateStringInTimeZone(now, timeZone);
    const parsedHour = Number.parseInt(searchParams.get("localHour") || "", 10);
    const localHour = Number.isFinite(parsedHour)
      ? Math.max(0, Math.min(23, parsedHour))
      : getHourInTimeZone(now, timeZone);

    const [context, targets] = await Promise.all([
      getDailyHealthContext(timeZone, localDateStr),
      getStoredCoachTargets(),
    ]);

    const { dayStart, dayEnd } = getUtcDayBoundsForTimeZone(localDateStr, timeZone);
    const todayTodos = await prisma.todo.findMany({
      where: {
        completed: false,
        dueDate: { gte: dayStart, lte: dayEnd },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
    });

    const lines: string[] = [];
    const today = context.today;
    const yesterday = context.yesterday;

    if (today.calories > 0 || today.workoutCount > 0 || today.stepCount > 0) {
      lines.push(
        `Today: ${today.calories} kcal, ${today.proteinG}g protein, ${today.meals} meals, ${today.workoutMinutes} workout min, ${today.stepCount.toLocaleString()} steps.`
      );
    } else if (yesterday.calories > 0 || yesterday.workoutCount > 0) {
      lines.push(
        `Yesterday closed at ${yesterday.calories} kcal, ${yesterday.proteinG}g protein, and ${yesterday.workoutMinutes} workout min.`
      );
    } else if (localHour < 12) {
      lines.push("Fresh start. No activity is logged yet.");
    } else {
      lines.push("No meaningful data is logged yet today.");
    }

    const proteinGap = Math.max(targets.proteinTargetG - today.proteinG, 0);
    const calorieGap = Math.max(targets.calorieTarget - today.calories, 0);

    let tip = "";
    if (today.proteinG > 0 && proteinGap > 0) {
      tip = `Next move: add roughly ${proteinGap}g protein across your next meal or snack.`;
    } else if (today.workoutCount === 0 && localHour < 16) {
      tip = "Next move: protect one workout block before the afternoon gets away from you.";
    } else if (today.waterMl < 1800 && localHour >= 12) {
      tip = `Next move: close the hydration gap with about ${Math.max(600, 2200 - today.waterMl)} ml before evening.`;
    } else if (today.stepCount < 6000 && localHour >= 15) {
      tip = "Next move: get a short walk in and bring your step count up before the day ends.";
    } else if (calorieGap > 0 && localHour >= 17) {
      tip = `Next move: finish the day with a controlled meal around ${Math.min(700, calorieGap)} kcal.`;
    } else {
      tip = "Next move: keep execution tight and log the next thing you do.";
    }

    const priorityMap: Record<string, number> = { high: 3, normal: 2, low: 1 };
    const sortedTodos = [...todayTodos].sort(
      (a, b) => (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0)
    );
    const topPriority = sortedTodos[0]?.title || null;

    return NextResponse.json({
      timeZone,
      localDate: localDateStr,
      greeting: localHour < 12 ? "morning" : localHour < 17 ? "afternoon" : "evening",
      summary: lines.join(" "),
      tip,
      todosToday: todayTodos.length,
      topPriority,
    });
  } catch (error) {
    console.error("Daily brief error:", error);
    return NextResponse.json({
      greeting: "morning",
      summary: "Welcome back.",
      tip: "Next move: log your first action of the day.",
      todosToday: 0,
      topPriority: null,
    });
  }
}
