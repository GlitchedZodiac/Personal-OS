// Single-workout GPX download (2026-08-28): the recorded track as the
// standard interchange format, so a hike opens in any mapping tool.

import { NextRequest, NextResponse } from "next/server";
import { routeDataAllowed } from "@/lib/activities";
import { buildGpx } from "@/lib/gpx";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const workout = await prisma.workoutLog.findUnique({
    where: { id },
    select: {
      id: true,
      startedAt: true,
      workoutType: true,
      description: true,
      routeData: true,
    },
  });
  if (!workout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!routeDataAllowed(workout.workoutType) || !workout.routeData) {
    return NextResponse.json({ error: "No GPS track on this workout" }, { status: 404 });
  }

  const { gpx, trackCount } = buildGpx([
    {
      startedAt: workout.startedAt,
      workoutType: workout.workoutType,
      description: workout.description,
      routeData: workout.routeData as {
        summaryPolyline?: string | null;
        points?: Array<{ lat?: number; lng?: number; alt?: number | null; t?: number }>;
      },
    },
  ]);
  if (trackCount === 0) {
    return NextResponse.json({ error: "No GPS track on this workout" }, { status: 404 });
  }

  const day = workout.startedAt.toISOString().slice(0, 10);
  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="pitaya-${workout.workoutType}-${day}.gpx"`,
    },
  });
}
