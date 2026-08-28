// Bulk GPX export (2026-08-28): every GPS session in range as one multi-track
// file (valid GPX 1.1 — no zip needed). Watch rows carry <ele>/<time>;
// polyline-only Strava rows are coordinates alone.

import { NextRequest, NextResponse } from "next/server";
import { GPS_WORKOUT_TYPES } from "@/lib/activities";
import { buildGpx, type GpxWorkout } from "@/lib/gpx";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(at.getTime()) ? at : null;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = parseDay(sp.get("from"));
  const toDay = parseDay(sp.get("to"));
  const to = toDay ? new Date(toDay.getTime() + 24 * 3600 * 1000) : null;

  const rows = await prisma.workoutLog.findMany({
    where: {
      workoutType: { in: [...GPS_WORKOUT_TYPES] },
      routeData: { not: { equals: null } },
      ...(from || to
        ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    orderBy: { startedAt: "asc" },
    take: 500,
    select: {
      startedAt: true,
      workoutType: true,
      description: true,
      routeData: true,
    },
  });

  const { gpx, trackCount } = buildGpx(rows as unknown as GpxWorkout[]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="pitaya-gps-tracks-${stamp}.gpx"`,
      "X-Track-Count": String(trackCount),
    },
  });
}
