import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Get active workout plan (or all plans)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") !== "false";
    const id = searchParams.get("id");

    if (id) {
      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          completions: {
            orderBy: { scheduledDate: "desc" },
          },
        },
      });
      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }
      return NextResponse.json(plan);
    }

    const plans = await prisma.workoutPlan.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        completions: {
          orderBy: { scheduledDate: "desc" },
          take: 30,
        },
      },
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error("Workout plan fetch error:", error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST - Create a workout plan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Deactivate existing plans if this one is active
    if (body.isActive !== false) {
      await prisma.workoutPlan.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const plan = await prisma.workoutPlan.create({
      data: {
        name: body.name,
        goal: body.goal,
        fitnessLevel: body.fitnessLevel,
        daysPerWeek: body.daysPerWeek || 4,
        schedule: body.schedule,
        isActive: body.isActive !== false,
        aiGenerated: body.aiGenerated || false,
        notes: body.notes || null,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Workout plan create error:", error);
    return NextResponse.json(
      { error: "Failed to create workout plan" },
      { status: 500 }
    );
  }
}

// PUT - Update a workout plan (e.g., modify schedule after AI adjustment)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Plan ID required" }, { status: 400 });
    }

    const plan = await prisma.workoutPlan.update({
      where: { id },
      data,
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Workout plan update error:", error);
    return NextResponse.json(
      { error: "Failed to update workout plan" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a workout plan
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.workoutPlan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workout plan delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete workout plan" },
      { status: 500 }
    );
  }
}
