import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Spirit preferences singleton — posture (how doctrine is taught) and
// the pause-the-term switch. Reader typography lives on-device.

const POSTURES = new Set(["westminster", "1689", "compare"]);

export async function GET() {
  try {
    const prefs = await prisma.spiritPref.findUnique({ where: { id: "main" } });
    return NextResponse.json({
      posture: prefs?.posture ?? "westminster",
      termPaused: prefs?.termPaused ?? false,
    });
  } catch (error) {
    console.error("Spirit prefs error:", error);
    return NextResponse.json({ error: "Failed to load prefs" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const data: { posture?: string; termPaused?: boolean } = {};
    if (typeof body.posture === "string") {
      if (!POSTURES.has(body.posture)) {
        return NextResponse.json({ error: "Unknown posture" }, { status: 400 });
      }
      data.posture = body.posture;
    }
    if (typeof body.termPaused === "boolean") data.termPaused = body.termPaused;

    const prefs = await prisma.spiritPref.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
    return NextResponse.json({
      posture: prefs.posture,
      termPaused: prefs.termPaused,
    });
  } catch (error) {
    console.error("Spirit prefs update error:", error);
    return NextResponse.json({ error: "Failed to save prefs" }, { status: 500 });
  }
}
