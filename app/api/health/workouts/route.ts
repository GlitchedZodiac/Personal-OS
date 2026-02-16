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
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        workoutType: body.workoutType,
        durationMinutes: body.durationMinutes || 0,
        description: body.description || null,
        caloriesBurned: body.caloriesBurned || null,
        exercises: body.exercises || undefined,
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

// PATCH - Update an existing workout entry
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    // Build update data, only include fields that were provided
    const data: Record<string, unknown> = {};
    if (updates.startedAt !== undefined) data.startedAt = new Date(updates.startedAt);
    if (updates.workoutType !== undefined) data.workoutType = updates.workoutType;
    if (updates.durationMinutes !== undefined) data.durationMinutes = updates.durationMinutes;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.caloriesBurned !== undefined) data.caloriesBurned = updates.caloriesBurned;
    if (updates.exercises !== undefined) data.exercises = updates.exercises;

    const entry = await prisma.workoutLog.update({
      where: { id },
      data,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Workout update error:", error);
    return NextResponse.json(
      { error: "Failed to update workout" },
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
