import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Workout progress trends
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    const exercise = searchParams.get("exercise"); // Optional: filter by exercise name

    if (!planId) {
      return NextResponse.json(
        { error: "planId is required" },
        { status: 400 }
      );
    }

    const completions = await prisma.workoutPlanCompletion.findMany({
      where: {
        planId,
        completed: true,
        actualExercises: { not: undefined },
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Build exercise progression data
    interface ExerciseDataPoint {
      date: string;
      weight: number;
      sets: number;
      reps: number;
      volume: number; // sets × reps × weight
    }

    const exerciseProgressions: Record<string, ExerciseDataPoint[]> = {};

    for (const completion of completions) {
      const exercises = completion.actualExercises as Array<{
        name: string;
        sets?: number;
        reps?: number;
        weightKg?: number;
        targetWeightKg?: number;
      }> | null;

      if (!exercises) continue;

      const dateStr = new Date(completion.scheduledDate)
        .toISOString()
        .split("T")[0];

      for (const ex of exercises) {
        if (exercise && ex.name.toLowerCase() !== exercise.toLowerCase()) continue;

        const weight = ex.weightKg || ex.targetWeightKg || 0;
        const sets = ex.sets || 0;
        const reps = ex.reps || 0;

        if (!exerciseProgressions[ex.name]) {
          exerciseProgressions[ex.name] = [];
        }

        exerciseProgressions[ex.name].push({
          date: dateStr,
          weight,
          sets,
          reps,
          volume: sets * reps * weight,
        });
      }
    }

    // Total volume trend (aggregate per workout day)
    const volumeTrend = completions.map((c) => {
      const exercises = c.actualExercises as Array<{
        name: string;
        sets?: number;
        reps?: number;
        weightKg?: number;
        targetWeightKg?: number;
      }> | null;

      let totalVolume = 0;
      if (exercises) {
        for (const ex of exercises) {
          const w = ex.weightKg || ex.targetWeightKg || 0;
          totalVolume += (ex.sets || 0) * (ex.reps || 0) * w;
        }
      }

      return {
        date: new Date(c.scheduledDate).toISOString().split("T")[0],
        dayLabel: c.dayLabel,
        totalVolume,
        caloriesBurned: c.caloriesBurned || 0,
        durationMinutes: c.durationMinutes || 0,
      };
    });

    // Calorie burn trend
    const calorieTrend = completions.map((c) => ({
      date: new Date(c.scheduledDate).toISOString().split("T")[0],
      calories: c.caloriesBurned || 0,
    }));

    // Personal records
    const personalRecords: Record<string, { weight: number; date: string; reps: number }> = {};
    for (const [exName, dataPoints] of Object.entries(exerciseProgressions)) {
      let maxWeight = 0;
      let prDate = "";
      let prReps = 0;

      for (const dp of dataPoints) {
        if (dp.weight > maxWeight) {
          maxWeight = dp.weight;
          prDate = dp.date;
          prReps = dp.reps;
        }
      }

      if (maxWeight > 0) {
        personalRecords[exName] = { weight: maxWeight, date: prDate, reps: prReps };
      }
    }

    return NextResponse.json({
      exerciseProgressions,
      volumeTrend,
      calorieTrend,
      personalRecords,
      totalCompletions: completions.length,
    });
  } catch (error) {
    console.error("Workout trends error:", error);
    return NextResponse.json({
      exerciseProgressions: {},
      volumeTrend: [],
      calorieTrend: [],
      personalRecords: {},
      totalCompletions: 0,
    });
  }
}
