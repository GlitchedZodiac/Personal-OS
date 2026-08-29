import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildRoutePoints,
  buildStreamMetrics,
  fetchActivityStreams,
  getValidAccessToken,
} from "@/lib/strava";
import { analyzeRoute } from "@/lib/route-analytics";
import { routeDataAllowed } from "@/lib/activities";

// One-shot historical enrichment v2 (2026-08-29, Strava retirement): for
// already-imported Strava rows, fetch streams INCLUDING latlng, reconstruct
// routeData.points[], and run the same route analyzer watch rows get —
// April's Tres Cruces baseline becomes natively comparable. Best-effort by
// design: a dead refresh token reports {tokenDead: true} and nothing else
// happens, ever. Idempotency: version-stamped (streamsVersion 2); the old
// presence-check would have skipped the 89 v1-enriched rows.
// ?take=N (max 100) widens the window; ?before=ISO pages into older history.

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // One token for the whole run — the per-activity DB read is gone.
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        tokenDead: true,
        message: "Strava refresh failed — history stays as imported. Nothing to maintain.",
      });
    }

    const { searchParams } = new URL(request.url);
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take")) || 40));
    const before = searchParams.get("before");
    const beforeDate = before ? new Date(before) : null;

    const candidates = await prisma.workoutLog.findMany({
      where: {
        externalSource: "strava",
        stravaActivityId: { not: null },
        ...(beforeDate && Number.isFinite(beforeDate.getTime())
          ? { startedAt: { lt: beforeDate } }
          : {}),
      },
      orderBy: { startedAt: "desc" },
      take,
      select: {
        id: true,
        stravaActivityId: true,
        workoutType: true,
        distanceMeters: true,
        metricsData: true,
        routeData: true,
      },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const deadline = Date.now() + 50_000;

    for (const w of candidates) {
      if (Date.now() > deadline) {
        errors.push("time budget reached — run again to continue");
        break;
      }
      const metrics = (w.metricsData ?? {}) as Record<string, unknown>;
      if ((metrics.streamsVersion as number | undefined ?? 1) >= 2) {
        skipped++;
        continue;
      }
      try {
        const streams = await fetchActivityStreams(
          w.stravaActivityId as string,
          accessToken
        );
        if (!streams) {
          skipped++;
          continue;
        }
        const streamMetrics = buildStreamMetrics(
          streams,
          typeof metrics.sufferScore === "number" ? metrics.sufferScore : undefined
        );

        // The reconstruction that matters: points → the existing analyzer.
        const points = routeDataAllowed(w.workoutType) ? buildRoutePoints(streams) : [];
        const analytics =
          points.length > 1
            ? analyzeRoute(points, { authoritativeMeters: w.distanceMeters })
            : null;
        const existingRoute = (w.routeData ?? {}) as Record<string, unknown>;

        await prisma.workoutLog.update({
          where: { id: w.id },
          data: {
            metricsData: {
              ...metrics,
              ...streamMetrics,
              ...(analytics ? { routeAnalytics: analytics } : {}),
              streamsVersion: 2,
            } as unknown as Prisma.InputJsonValue,
            ...(points.length > 1
              ? {
                  routeData: {
                    ...existingRoute,
                    points,
                    source: "strava-streams",
                  } as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
        updated++;
      } catch (err) {
        errors.push(`${w.stravaActivityId}: ${(err as Error)?.message}`);
      }
    }

    return NextResponse.json({ scanned: candidates.length, updated, skipped, errors });
  } catch (error) {
    console.error("Stream backfill error:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
