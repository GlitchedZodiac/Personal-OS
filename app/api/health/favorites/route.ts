import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Favorites, most-used first. `?id=` returns one WITH its label
// photo; the list omits photoData so 20 base64 labels can't bloat the
// payload the Food screen loads on every visit.
export async function GET(request: NextRequest) {
  try {
    if (!prisma.favoriteFoods) {
      return NextResponse.json([]);
    }

    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const favorite = await prisma.favoriteFoods.findUnique({ where: { id } });
      if (!favorite) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(favorite);
    }

    const favorites = await prisma.favoriteFoods.findMany({
      orderBy: { usageCount: "desc" },
      take: 20,
      select: {
        id: true,
        foodDescription: true,
        mealType: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        usageCount: true,
        kind: true,
        servingLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(favorites);
  } catch (error) {
    console.error("Favorites error:", error);
    // If table doesn't exist, return empty gracefully
    return NextResponse.json([]);
  }
}

// POST - Add a favorite food (or log it if it already exists)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      foodDescription,
      mealType,
      calories,
      proteinG,
      carbsG,
      fatG,
      logNow,
      loggedAt,
      // Products (scanned nutrition labels): macros above are PER SERVING,
      // and `servings` scales what actually gets logged.
      kind,
      servingLabel,
      photoData,
      servings,
    } = body;

    const isProduct = kind === "product";
    const multiplier =
      isProduct && Number.isFinite(Number(servings)) && Number(servings) > 0
        ? Number(servings)
        : 1;
    const round = (n: number) => Math.round((n || 0) * multiplier * 10) / 10;

    // Optionally also log it as a food entry right now
    if (logNow) {
      const servingNote =
        isProduct && servingLabel
          ? `${multiplier} × ${servingLabel}`
          : "Logged from favorites";
      await prisma.foodLog.create({
        data: {
          loggedAt: loggedAt ? new Date(loggedAt) : undefined,
          mealType: mealType || "snack",
          foodDescription:
            isProduct && multiplier !== 1
              ? `${foodDescription} (${multiplier}×)`
              : foodDescription,
          calories: round(calories),
          proteinG: round(proteinG),
          carbsG: round(carbsG),
          fatG: round(fatG),
          // Drives the design's "usual" pill on the Food timeline.
          source: "usual",
          notes: servingNote,
        },
      });
    }

    // Try to save to favorites table (may not exist yet)
    try {
      if (!prisma.favoriteFoods) {
        return NextResponse.json({ success: true, message: "Food logged but favorites table not set up yet." });
      }

      // Check if this food already exists in favorites
      let favorite = await prisma.favoriteFoods.findFirst({
        where: { foodDescription: { equals: foodDescription, mode: "insensitive" } },
      });

      if (favorite) {
        favorite = await prisma.favoriteFoods.update({
          where: { id: favorite.id },
          data: {
            usageCount: favorite.usageCount + 1,
            // A re-scan refreshes the stored label/serving without
            // clobbering them when the caller doesn't supply them.
            ...(photoData ? { photoData } : {}),
            ...(servingLabel ? { servingLabel } : {}),
            ...(kind ? { kind } : {}),
          },
        });
      } else {
        favorite = await prisma.favoriteFoods.create({
          data: {
            foodDescription,
            mealType: mealType || "snack",
            calories: calories || 0,
            proteinG: proteinG || 0,
            carbsG: carbsG || 0,
            fatG: fatG || 0,
            usageCount: 1,
            kind: isProduct ? "product" : "meal",
            servingLabel: servingLabel || null,
            photoData: photoData || null,
          },
        });
      }

      return NextResponse.json(favorite);
    } catch {
      // Favorites table might not exist — food was still logged
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Favorites error:", error);
    return NextResponse.json(
      { error: "Failed to save" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a favorite
export async function DELETE(request: NextRequest) {
  try {
    if (!prisma.favoriteFoods) {
      return NextResponse.json({ success: true });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID required" },
        { status: 400 }
      );
    }

    await prisma.favoriteFoods.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorites delete error:", error);
    return NextResponse.json({ success: true });
  }
}
