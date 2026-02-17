import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/finance/goals — list all savings goals
export async function GET() {
  try {
    const goals = await prisma.savingsGoal.findMany({
      orderBy: [{ isCompleted: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ goals });
  } catch (error) {
    console.error("Error fetching goals:", error);
    return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 });
  }
}

// POST /api/finance/goals — create a new savings goal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      targetAmount,
      currentAmount = 0,
      currency = "COP",
      deadline,
      icon,
      color,
      notes,
    } = body;

    if (!name || !targetAmount) {
      return NextResponse.json(
        { error: "Name and target amount are required" },
        { status: 400 }
      );
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        name,
        targetAmount,
        currentAmount,
        currency,
        deadline: deadline ? new Date(deadline) : null,
        icon: icon ?? null,
        color: color ?? null,
        notes: notes ?? null,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error("Error creating goal:", error);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}

// PATCH /api/finance/goals — update a savings goal
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Goal ID is required" }, { status: 400 });
    }

    if (updates.deadline) {
      updates.deadline = new Date(updates.deadline);
    }

    // Check if goal is completed
    if (updates.currentAmount !== undefined) {
      const goal = await prisma.savingsGoal.findUnique({
        where: { id },
        select: { targetAmount: true },
      });
      if (goal && updates.currentAmount >= goal.targetAmount) {
        updates.isCompleted = true;
      }
    }

    const goal = await prisma.savingsGoal.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Error updating goal:", error);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

// DELETE /api/finance/goals — delete a savings goal
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Goal ID is required" }, { status: 400 });
    }

    await prisma.savingsGoal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting goal:", error);
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}
