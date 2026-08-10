import { NextRequest, NextResponse } from "next/server";
import { generateEmom, type EmomEquipment } from "@/lib/emom-generator";
import { KETTLEBELL_WEIGHTS_KG } from "@/lib/exercises";

// "Surprise me" — proposes a balanced random EMOM. Deliberately does NOT
// persist: the proposal comes back, he starts it or re-rolls, and only a
// deliberate save writes a routine. Same shape as the confirm-first dock.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const durationMinutes = Number.isFinite(Number(body.durationMinutes))
      ? Math.max(5, Math.min(60, Math.round(Number(body.durationMinutes))))
      : 20;
    const movements = Number.isFinite(Number(body.movements))
      ? Math.max(2, Math.min(6, Math.round(Number(body.movements))))
      : 4;
    const equipment: EmomEquipment = ["kettlebell", "dumbbell", "any"].includes(
      body.equipment
    )
      ? body.equipment
      : "kettlebell";
    const kettlebellKg = KETTLEBELL_WEIGHTS_KG.includes(
      Number(body.kettlebellKg) as (typeof KETTLEBELL_WEIGHTS_KG)[number]
    )
      ? Number(body.kettlebellKg)
      : undefined;

    const recipe = generateEmom({
      durationMinutes,
      movements,
      equipment,
      kettlebellKg,
    });

    if (!recipe) {
      return NextResponse.json(
        { error: "No movements available for that equipment" },
        { status: 422 }
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Random EMOM error:", error);
    return NextResponse.json(
      { error: "Couldn't build a routine" },
      { status: 500 }
    );
  }
}
