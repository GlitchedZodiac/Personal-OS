import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildStreamMetrics, fetchActivityStreams } from "@/lib/strava";

// One-shot: fetch HR/time/altitude streams for already-imported Strava
// workouts and attach zone/load analytics to metricsData. Idempotent —
// rows that already carry hrStream or altitudeStream are skipped.
// ?take=N (max 100) widens the window; ?before=ISO pages into older
// history (the default newest-40 window could never reach 2024 rows).

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
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
      select: { id: true, stravaActivityId: true, metricsData: true },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const w of candidates) {
      const metrics = (w.metricsData ?? {}) as Record<string, unknown>;
      if (metrics.hrStream || metrics.altitudeStream) {
        skipped++;
        continue;
      }
      try {
        const streams = await fetchActivityStreams(w.stravaActivityId as string);
        if (!streams || (!streams.heartrate?.length && !streams.altitude?.length)) {
          skipped++;
          continue;
        }
        const streamMetrics = buildStreamMetrics(
          streams,
          typeof metrics.sufferScore === "number" ? metrics.sufferScore : undefined
        );
        await prisma.workoutLog.update({
          where: { id: w.id },
          data: {
            metricsData: { ...metrics, ...streamMetrics } as Prisma.InputJsonValue,
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
