import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/utils";

// GET - List food entries with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const mealType = searchParams.get("mealType");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (date) {
      const dayStart = startOfDay(parseLocalDate(date));
      const dayEnd = endOfDay(parseLocalDate(date));
      where.loggedAt = {
        gte: dayStart,
        lte: dayEnd,
      };
    }

    if (mealType) {
      where.mealType = mealType;
    }

    if (search) {
      where.foodDescription = {
        contains: search,
        mode: "insensitive",
      };
    }

    const entries = await prisma.foodLog.findMany({
      where,
      select: {
        id: true,
        loggedAt: true,
        mealType: true,
        foodDescription: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        notes: true,
        source: true,
      },
      orderBy: { loggedAt: "desc" },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Food log fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch food logs" },
      { status: 500 }
    );
  }
}

// POST - Create a food entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = await prisma.foodLog.create({
      data: {
        mealType: body.mealType,
        foodDescription: body.foodDescription,
        calories: body.calories || 0,
        proteinG: body.proteinG || 0,
        carbsG: body.carbsG || 0,
        fatG: body.fatG || 0,
        notes: body.notes || null,
        source: body.source || "manual",
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Food log create error:", error);
    return NextResponse.json(
      { error: "Failed to create food log" },
      { status: 500 }
    );
  }
}

// PATCH - Update a food entry
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.mealType !== undefined) updateData.mealType = body.mealType;
    if (body.foodDescription !== undefined) updateData.foodDescription = body.foodDescription;
    if (body.calories !== undefined) updateData.calories = body.calories;
    if (body.proteinG !== undefined) updateData.proteinG = body.proteinG;
    if (body.carbsG !== undefined) updateData.carbsG = body.carbsG;
    if (body.fatG !== undefined) updateData.fatG = body.fatG;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.loggedAt !== undefined) updateData.loggedAt = new Date(body.loggedAt);

    const entry = await prisma.foodLog.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Food log update error:", error);
    return NextResponse.json(
      { error: "Failed to update food log" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a food entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.foodLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Food log delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete food log" },
      { status: 500 }
    );
  }
}
