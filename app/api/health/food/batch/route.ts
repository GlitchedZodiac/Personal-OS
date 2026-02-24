import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Create multiple food entries at once (used by AI voice + photo)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, source: batchSource, loggedAt: batchLoggedAt } = body;

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
        source?: string;
        loggedAt?: string;
      }) =>
        prisma.foodLog.create({
          data: {
            loggedAt: item.loggedAt
              ? new Date(item.loggedAt)
              : batchLoggedAt
                ? new Date(batchLoggedAt)
                : undefined,
            mealType: item.mealType,
            foodDescription: item.foodDescription,
            calories: item.calories || 0,
            proteinG: item.proteinG || 0,
            carbsG: item.carbsG || 0,
            fatG: item.fatG || 0,
            notes: item.notes || null,
            source: item.source || batchSource || "voice",
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
