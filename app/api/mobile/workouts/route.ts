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

    // Slim payload (2026-08-29): this used to return WHOLE rows — routeData
    // points and full metricsData streams for 50 workouts — of which the
    // wrist decodes three metricsData keys. Selecting the decoded columns
    // and trimming metricsData to those keys cuts the launch payload by an
    // order of magnitude. The watch's decoder was always lenient.
    const rows = await prisma.workoutLog.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        workoutType: true,
        description: true,
        caloriesBurned: true,
        distanceMeters: true,
        avgHeartRateBpm: true,
        maxHeartRateBpm: true,
        externalSource: true,
        externalId: true,
        source: true,
        exercises: true,
        metricsData: true,
      },
    });
    const entries = rows.map((row) => {
      const m = (row.metricsData ?? null) as {
        sequenceId?: unknown;
        sequenceName?: unknown;
        timeInZones?: { seconds?: unknown };
      } | null;
      return {
        ...row,
        metricsData: m
          ? {
              sequenceId: m.sequenceId,
              sequenceName: m.sequenceName,
              timeInZones: m.timeInZones ? { seconds: m.timeInZones.seconds } : undefined,
            }
          : null,
      };
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
