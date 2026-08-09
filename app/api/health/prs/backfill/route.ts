import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectAndRecordPRs } from "@/lib/prs";

export const maxDuration = 60;

// POST - Rebuild personal records from full workout history, oldest first.
// Idempotent: safe to rerun whenever the exercise catalog learns new
// movements or aliases. Cookie-gated by the API middleware like everything
// else.
export async function POST() {
  try {
    await prisma.personalRecord.deleteMany({});

    const workouts = await prisma.workoutLog.findMany({
      where: { exercises: { not: { equals: null } } },
      orderBy: { startedAt: "asc" },
      select: { id: true, startedAt: true, exercises: true },
    });

    let recordsSet = 0;
    for (const workout of workouts) {
      const newPRs = await detectAndRecordPRs({
        workoutLogId: workout.id,
        exercises: workout.exercises,
        achievedAt: workout.startedAt,
      });
      recordsSet += newPRs.length;
    }

    const finalRecords = await prisma.personalRecord.count();
    return NextResponse.json({
      workoutsScanned: workouts.length,
      recordImprovements: recordsSet,
      currentRecords: finalRecords,
    });
  } catch (error) {
    console.error("PR backfill error:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
