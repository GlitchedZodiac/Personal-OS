import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Number.parseInt(searchParams.get("limit") || "50", 10) || 50,
      200
    );

    const entries = await prisma.workoutLog.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      deviceSessionId: session.id,
      entries,
    });
  } catch (error) {
    console.error("Mobile workouts fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}
