import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Create multiple food entries at once (used by AI)
export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array required" },
        { status: 400 }
      );
    }

    const entries = await prisma.$transaction(
      items.map((item: {
        mealType: string;
        foodDescription: string;
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        notes?: string;
      }) =>
        prisma.foodLog.create({
          data: {
            mealType: item.mealType,
            foodDescription: item.foodDescription,
            calories: item.calories || 0,
            proteinG: item.proteinG || 0,
            carbsG: item.carbsG || 0,
            fatG: item.fatG || 0,
            notes: item.notes || null,
            source: "voice",
          },
        })
      )
    );

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Batch food log create error:", error);
    return NextResponse.json(
      { error: "Failed to create food logs" },
      { status: 500 }
    );
  }
}
