import { NextRequest, NextResponse } from "next/server";
import { allExercises } from "@/lib/exercises";
import { createUserExercise, ensureUserExercisesLoaded } from "@/lib/user-exercises";

// Exercise vocabulary (web, cookie-gated by proxy.ts). GET feeds pickers the
// full merged list (catalog + user-minted); POST is the chat confirm path for
// "add a movement" proposals — the AI proposes, the user confirms, THEN this
// persists (the confirmation-dock shape).

export async function GET() {
  try {
    await ensureUserExercisesLoaded(true);
    return NextResponse.json({
      exercises: allExercises().map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        isCustom: e.isCustom === true,
      })),
    });
  } catch (error) {
    console.error("Exercises fetch error:", error);
    return NextResponse.json({ error: "Failed to load exercises" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createUserExercise(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      exercise: result.def,
      created: result.created, // false = the name already resolved to a known movement
    });
  } catch (error) {
    console.error("Exercise create error:", error);
    return NextResponse.json({ error: "Failed to create exercise" }, { status: 500 });
  }
}
