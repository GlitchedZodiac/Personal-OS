import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List workout entries
export async function GET() {
  try {
    const entries = await prisma.workoutLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Workout fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}

// POST - Create a workout entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = await prisma.workoutLog.create({
      data: {
        workoutType: body.workoutType,
        durationMinutes: body.durationMinutes || 0,
        description: body.description || null,
        caloriesBurned: body.caloriesBurned || null,
        exercises: body.exercises || null,
        stravaActivityId: body.stravaActivityId || null,
        source: body.source || "manual",
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Workout create error:", error);
    return NextResponse.json(
      { error: "Failed to create workout" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a workout entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.workoutLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workout delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete workout" },
      { status: 500 }
    );
  }
}
