import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Get favorite foods (sorted by most used)
export async function GET() {
  try {
    if (!prisma.favoriteFoods) {
      return NextResponse.json([]);
    }

    const favorites = await prisma.favoriteFoods.findMany({
      orderBy: { usageCount: "desc" },
      take: 20,
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
    const { foodDescription, mealType, calories, proteinG, carbsG, fatG, logNow } = body;

    // Optionally also log it as a food entry right now
    if (logNow) {
      await prisma.foodLog.create({
        data: {
          mealType: mealType || "snack",
          foodDescription,
          calories: calories || 0,
          proteinG: proteinG || 0,
          carbsG: carbsG || 0,
          fatG: fatG || 0,
          source: "favorite",
          notes: "Logged from favorites",
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
          data: { usageCount: favorite.usageCount + 1 },
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
