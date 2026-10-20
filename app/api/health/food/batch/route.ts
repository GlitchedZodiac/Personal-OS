import { NextRequest, NextResponse } from "next/server";
import { checkFoodItems } from "@/lib/food-check";
import { normalizeFoodDescription, normalizeFoodSource } from "@/lib/food-normalize";
import { prisma } from "@/lib/prisma";

// POST - Create multiple food entries at once (the chat card's Confirm, and
// any client that saves several rows together).
//
// 2026-10-18 (intake lane): every row goes through the same checks as the
// card did — types coerced, a component listed twice collapsed, the
// description tidied — and `source` is a closed vocabulary
// (lib/food-normalize.ts). The default stays "voice" so an older client that
// sends nothing keeps working; the chat card now sends the real one.
const MAX_ITEMS = 40;

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
    if (items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `At most ${MAX_ITEMS} items per save` },
        { status: 400 }
      );
    }

    const checked = checkFoodItems(items);
    if (checked.items.length === 0) {
      return NextResponse.json({ error: "No item has a description" }, { status: 400 });
    }
    const defaultSource = normalizeFoodSource(batchSource, "voice");
    const batchAt = typeof batchLoggedAt === "string" && batchLoggedAt ? new Date(batchLoggedAt) : null;

    const entries = await prisma.$transaction(
      checked.items.map((item) => {
        const own = item.loggedAt ? new Date(item.loggedAt) : null;
        return prisma.foodLog.create({
          data: {
            loggedAt:
              own && Number.isFinite(own.getTime())
                ? own
                : batchAt && Number.isFinite(batchAt.getTime())
                  ? batchAt
                  : undefined,
            mealType: item.mealType,
            foodDescription: normalizeFoodDescription(item.foodDescription),
            calories: item.calories,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            notes: item.notes ?? null,
            source: normalizeFoodSource(item.source, defaultSource),
          },
        });
      })
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
