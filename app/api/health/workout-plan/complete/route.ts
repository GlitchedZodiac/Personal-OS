import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Mark a scheduled workout day as complete
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      planId,
      scheduledDate,
      dayIndex,
      dayLabel,
      completed,
      feedback,
      actualExercises,
      caloriesBurned,
      durationMinutes,
      userNotes,
    } = body;

    if (!planId || scheduledDate === undefined || dayIndex === undefined) {
      return NextResponse.json(
        { error: "planId, scheduledDate, and dayIndex are required" },
        { status: 400 }
      );
    }

    // Upsert — create or update the completion record
    const completion = await prisma.workoutPlanCompletion.upsert({
      where: {
        planId_scheduledDate_dayIndex: {
          planId,
          scheduledDate: new Date(scheduledDate),
          dayIndex,
        },
      },
      create: {
        planId,
        scheduledDate: new Date(scheduledDate),
        dayIndex,
        dayLabel: dayLabel || `Day ${dayIndex + 1}`,
        completed: completed !== false,
        feedback: feedback || null,
        actualExercises: actualExercises || null,
        caloriesBurned: caloriesBurned || null,
        durationMinutes: durationMinutes || null,
        userNotes: userNotes || null,
      },
      update: {
        completed: completed !== false,
        feedback: feedback || null,
        actualExercises: actualExercises || null,
        caloriesBurned: caloriesBurned || null,
        durationMinutes: durationMinutes || null,
        userNotes: userNotes || null,
      },
    });

    // Also sync to WorkoutLog so the health dashboard picks up calories burned & minutes
    if (completed !== false) {
      try {
        // Derive a workout type from the day label (e.g. "Day 1 - Push" -> "strength")
        const label = (dayLabel || "").toLowerCase();
        let workoutType = "strength";
        if (label.includes("cardio") || label.includes("hiit") || label.includes("conditioning"))
          workoutType = "cardio";
        else if (label.includes("run")) workoutType = "run";
        else if (label.includes("yoga") || label.includes("stretch") || label.includes("mobility"))
          workoutType = "flexibility";

        await prisma.workoutLog.upsert({
          where: {
            // Use a deterministic lookup: find existing log for this plan completion
            id: `plan-${planId}-${dayIndex}-${new Date(scheduledDate).toISOString().slice(0, 10)}`,
          },
          create: {
            id: `plan-${planId}-${dayIndex}-${new Date(scheduledDate).toISOString().slice(0, 10)}`,
            startedAt: new Date(scheduledDate),
            durationMinutes: durationMinutes || 0,
            workoutType,
            description: dayLabel || `Workout Plan Day ${dayIndex + 1}`,
            caloriesBurned: caloriesBurned || null,
            exercises: actualExercises || null,
            source: "plan",
          },
          update: {
            durationMinutes: durationMinutes || 0,
            workoutType,
            description: dayLabel || `Workout Plan Day ${dayIndex + 1}`,
            caloriesBurned: caloriesBurned || null,
            exercises: actualExercises || null,
          },
        });
      } catch (syncError) {
        // Don't fail the completion if the WorkoutLog sync fails
        console.warn("Failed to sync completion to WorkoutLog:", syncError);
      }
    }

    return NextResponse.json(completion);
  } catch (error) {
    console.error("Workout completion error:", error);
    return NextResponse.json(
      { error: "Failed to record completion" },
      { status: 500 }
    );
  }
}

// GET - Get completions for a plan (optionally filtered by date range)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!planId) {
      return NextResponse.json(
        { error: "planId is required" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { planId };
    if (from || to) {
      where.scheduledDate = {};
      if (from) (where.scheduledDate as Record<string, unknown>).gte = new Date(from);
      if (to) (where.scheduledDate as Record<string, unknown>).lte = new Date(to);
    }

    const completions = await prisma.workoutPlanCompletion.findMany({
      where,
      orderBy: { scheduledDate: "asc" },
    });

    return NextResponse.json(completions);
  } catch (error) {
    console.error("Workout completions fetch error:", error);
    return NextResponse.json([]);
  }
}
