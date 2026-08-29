// One-shot backfill for routeAnalytics (2026-08-28): every GPS workout whose
// routeData carries the full-res points[] gets moving/stopped time, breaks,
// splits and grade-adjusted pace written into metricsData — the same math the
// sync route now runs for new sessions. Idempotent: rows already carrying
// CURRENT-version routeAnalytics are skipped; older versions are recomputed
// (v2, 2026-08-29: reconciled pace, spike-filtered max speed, absolute
// min/max altitude, descent totals). Cookie-gated like every /api/health/*
// route; curl it (or re-run it) freely.

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { GPS_WORKOUT_TYPES } from "@/lib/activities";
import { prisma } from "@/lib/prisma";
import { analyzeRoute, type RoutePointIn } from "@/lib/route-analytics";

export const maxDuration = 60;

export async function POST() {
  try {
    const candidates = await prisma.workoutLog.findMany({
      where: { workoutType: { in: [...GPS_WORKOUT_TYPES] } },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: { id: true, routeData: true, metricsData: true, distanceMeters: true },
    });

    let processed = 0;
    let updated = 0;
    let skippedExisting = 0;
    let skippedNoPoints = 0;

    for (const row of candidates) {
      processed++;
      const metrics =
        row.metricsData && typeof row.metricsData === "object" && !Array.isArray(row.metricsData)
          ? (row.metricsData as Record<string, unknown>)
          : {};
      const existing = metrics.routeAnalytics as { version?: number } | undefined;
      if (existing && (existing.version ?? 1) >= 2) {
        skippedExisting++;
        continue;
      }
      const route = row.routeData as { points?: unknown } | null;
      const points = Array.isArray(route?.points) ? (route.points as RoutePointIn[]) : null;
      const analytics = points
        ? analyzeRoute(points, { authoritativeMeters: row.distanceMeters })
        : null;
      if (!analytics) {
        skippedNoPoints++;
        continue;
      }
      await prisma.workoutLog.update({
        where: { id: row.id },
        data: {
          metricsData: {
            ...metrics,
            routeAnalytics: analytics,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      updated++;
    }

    return NextResponse.json({ processed, updated, skippedExisting, skippedNoPoints });
  } catch (error) {
    console.error("Route analytics backfill error:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
