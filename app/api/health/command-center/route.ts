import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getUtcDayBounds, parseLocalDate } from "@/lib/utils";
import { getUtcDayBoundsForTimeZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/server-timezone";

type TimelineEventType =
  | "food"
  | "workout"
  | "water"
  | "measurement"
  | "todo"
  | "reminder";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  title: string;
  subtitle: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
    const requestedTimeZone = searchParams.get("timeZone");
    const date = dateStr ? parseLocalDate(dateStr) : new Date();

    const parsedOffset = tzOffsetMinutes !== null ? Number(tzOffsetMinutes) : null;
    let dayStart: Date;
    let dayEnd: Date;
    if (dateStr && parsedOffset !== null && Number.isFinite(parsedOffset)) {
      ({ dayStart, dayEnd } = getUtcDayBounds(dateStr, parsedOffset));
    } else if (dateStr) {
      const timeZone = await getUserTimeZone(requestedTimeZone);
      ({ dayStart, dayEnd } = getUtcDayBoundsForTimeZone(dateStr, timeZone));
    } else {
      dayStart = startOfDay(date);
      dayEnd = endOfDay(date);
    }

    const [foods, workouts, waters, measurements, todos, reminders] =
      await Promise.all([
        prisma.foodLog.findMany({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          select: {
            id: true,
            loggedAt: true,
            foodDescription: true,
            mealType: true,
            calories: true,
          },
        }),
        prisma.workoutLog.findMany({
          where: { startedAt: { gte: dayStart, lte: dayEnd } },
          select: {
            id: true,
            startedAt: true,
            workoutType: true,
            durationMinutes: true,
            caloriesBurned: true,
          },
        }),
        prisma.waterLog.findMany({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          select: {
            id: true,
            loggedAt: true,
            amountMl: true,
          },
        }),
        prisma.bodyMeasurement.findMany({
          where: { measuredAt: { gte: dayStart, lte: dayEnd } },
          select: {
            id: true,
            measuredAt: true,
            weightKg: true,
            bodyFatPct: true,
            waistCm: true,
          },
        }),
        prisma.todo.findMany({
          where: {
            OR: [
              { dueDate: { gte: dayStart, lte: dayEnd } },
              { completedAt: { gte: dayStart, lte: dayEnd } },
            ],
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            completed: true,
            completedAt: true,
          },
        }),
        prisma.reminder.findMany({
          where: { remindAt: { gte: dayStart, lte: dayEnd } },
          select: {
            id: true,
            title: true,
            remindAt: true,
            fired: true,
          },
        }),
      ]);

    const events: TimelineEvent[] = [
      ...foods.map((entry) => ({
        id: `food-${entry.id}`,
        type: "food" as const,
        occurredAt: entry.loggedAt.toISOString(),
        title: entry.foodDescription,
        subtitle: `${entry.mealType} - ${Math.round(entry.calories)} kcal`,
      })),
      ...workouts.map((entry) => ({
        id: `workout-${entry.id}`,
        type: "workout" as const,
        occurredAt: entry.startedAt.toISOString(),
        title: `${entry.workoutType} workout`,
        subtitle: `${entry.durationMinutes} min${
          entry.caloriesBurned ? ` - ${Math.round(entry.caloriesBurned)} kcal burned` : ""
        }`,
      })),
      ...waters.map((entry) => ({
        id: `water-${entry.id}`,
        type: "water" as const,
        occurredAt: entry.loggedAt.toISOString(),
        title: "Hydration logged",
        subtitle: `${entry.amountMl} ml`,
      })),
      ...measurements.map((entry) => ({
        id: `measurement-${entry.id}`,
        type: "measurement" as const,
        occurredAt: entry.measuredAt.toISOString(),
        title: "Body measurement logged",
        subtitle: [
          entry.weightKg != null ? `${entry.weightKg}kg` : null,
          entry.bodyFatPct != null ? `${entry.bodyFatPct}% bf` : null,
          entry.waistCm != null ? `${entry.waistCm}cm waist` : null,
        ]
          .filter(Boolean)
          .join(" - "),
      })),
      ...todos.map((entry) => ({
        id: `todo-${entry.id}`,
        type: "todo" as const,
        occurredAt: (entry.completedAt || entry.dueDate || dayStart).toISOString(),
        title: entry.title,
        subtitle: entry.completed ? "Task completed" : "Task due",
      })),
      ...reminders.map((entry) => ({
        id: `reminder-${entry.id}`,
        type: "reminder" as const,
        occurredAt: entry.remindAt.toISOString(),
        title: entry.title,
        subtitle: entry.fired ? "Reminder fired" : "Reminder scheduled",
      })),
    ]
      .filter((event) => event.subtitle.length > 0)
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );

    const summary = {
      foodCount: foods.length,
      workoutCount: workouts.length,
      hydrationEntries: waters.length,
      todoCount: todos.length,
      reminderCount: reminders.length,
      totalCalories: Math.round(foods.reduce((sum, item) => sum + item.calories, 0)),
      totalWorkoutMinutes: workouts.reduce((sum, item) => sum + item.durationMinutes, 0),
      totalWaterMl: waters.reduce((sum, item) => sum + item.amountMl, 0),
    };

    return NextResponse.json({ summary, events });
  } catch (error) {
    console.error("Command center fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load command center timeline" },
      { status: 500 }
    );
  }
}
