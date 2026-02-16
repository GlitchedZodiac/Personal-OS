import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, parse } from "date-fns";

function parseLocalDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

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
