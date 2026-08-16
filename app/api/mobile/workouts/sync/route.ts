import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { detectAndRecordPRs, type NewPR } from "@/lib/prs";
import { buildStreamMetrics } from "@/lib/strava";
import {
  buildHeroMetrics,
  buildRoutineCoda,
  type HeroMetrics,
  type RoutineCoda,
} from "@/lib/mobile-summary";
import { getUserTimeZone } from "@/lib/server-timezone";

type MobileWorkoutPayload = {
  externalId?: string;
  externalSource?: string;
  startedAt?: string;
  endedAt?: string | null;
  durationMinutes?: number;
  workoutType?: string;
  description?: string | null;
  caloriesBurned?: number | null;
  distanceMeters?: number | null;
  stepCount?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  elevationGainM?: number | null;
  routeData?: Prisma.InputJsonValue;
  metricsData?: Prisma.InputJsonValue;
  exercises?: Prisma.InputJsonValue;
  source?: string;
  syncStatus?: string;
  deviceType?: string | null;
};

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const items: MobileWorkoutPayload[] = Array.isArray(body.items)
      ? body.items
      : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Workout items are required" },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    // Per-item PR results, keyed by externalId (or index when absent) so the
    // watch can celebrate server-confirmed records after sync.
    const prResults: Array<{ externalId: string | null; newPRs: NewPR[] }> = [];

    // Watch sends raw parallel streams (hrStream bpm + timeStream elapsed-s,
    // optional altitudeStream); the SERVER owns the analytics — same
    // downsample/zones/load math the Strava import runs, so the Activities
    // detail charts light up identically for watch-recorded sessions.
    const enrichMetrics = (
      raw: Prisma.InputJsonValue | undefined
    ): Prisma.InputJsonValue | undefined => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const m = raw as Record<string, unknown>;
      const hr = Array.isArray(m.hrStream) ? (m.hrStream as number[]) : [];
      const time = Array.isArray(m.timeStream) ? (m.timeStream as number[]) : [];
      if (hr.length < 2 || time.length < 2 || m.timeInZones) return raw;
      const alt = Array.isArray(m.altitudeStream)
        ? (m.altitudeStream as number[])
        : undefined;
      const computed = buildStreamMetrics({ heartrate: hr, time, altitude: alt });
      return { ...m, ...computed } as Prisma.InputJsonValue;
    };

    for (const item of items) {
      const externalSource =
        typeof item.externalSource === "string" && item.externalSource.trim().length > 0
          ? item.externalSource.trim()
          : "app_watch";
      const externalId =
        typeof item.externalId === "string" && item.externalId.trim().length > 0
          ? item.externalId.trim()
          : null;

      const data = {
        startedAt: item.startedAt ? new Date(item.startedAt) : new Date(),
        endedAt: item.endedAt ? new Date(item.endedAt) : null,
        durationMinutes: Math.max(0, Number(item.durationMinutes || 0)),
        workoutType:
          typeof item.workoutType === "string" && item.workoutType.trim().length > 0
            ? item.workoutType.trim()
            : "other",
        description:
          typeof item.description === "string" ? item.description : null,
        caloriesBurned: toNullableNumber(item.caloriesBurned),
        distanceMeters: toNullableNumber(item.distanceMeters),
        stepCount:
          item.stepCount === undefined || item.stepCount === null
            ? null
            : Math.round(Number(item.stepCount)),
        avgHeartRateBpm:
          item.avgHeartRateBpm === undefined || item.avgHeartRateBpm === null
            ? null
            : Math.round(Number(item.avgHeartRateBpm)),
        maxHeartRateBpm:
          item.maxHeartRateBpm === undefined || item.maxHeartRateBpm === null
            ? null
            : Math.round(Number(item.maxHeartRateBpm)),
        elevationGainM: toNullableNumber(item.elevationGainM),
        routeData: item.routeData ?? Prisma.JsonNull,
        metricsData: enrichMetrics(item.metricsData) ?? Prisma.JsonNull,
        exercises: item.exercises ?? Prisma.JsonNull,
        deviceType:
          typeof item.deviceType === "string" && item.deviceType.trim().length > 0
            ? item.deviceType.trim()
            : session.deviceType,
        externalSource,
        externalId,
        syncStatus:
          typeof item.syncStatus === "string" && item.syncStatus.trim().length > 0
            ? item.syncStatus.trim()
            : "synced",
        source:
          typeof item.source === "string" && item.source.trim().length > 0
            ? item.source.trim()
            : "mobile",
      };

      let workoutId: string;
      if (externalId) {
        const existing = await prisma.workoutLog.findFirst({
          where: { externalSource, externalId },
          select: { id: true },
        });

        if (existing) {
          await prisma.workoutLog.update({
            where: { id: existing.id },
            data,
          });
          updated++;
          workoutId = existing.id;
        } else {
          const entry = await prisma.workoutLog.create({ data });
          created++;
          workoutId = entry.id;
        }
      } else {
        const entry = await prisma.workoutLog.create({ data });
        created++;
        workoutId = entry.id;
      }

      // Server-side PR detection — same engine as web logging, so wrist
      // sessions land in personal_records too. Never blocks the sync.
      try {
        const newPRs = await detectAndRecordPRs({
          workoutLogId: workoutId,
          exercises: data.exercises === Prisma.JsonNull ? null : data.exercises,
          achievedAt: data.startedAt,
        });
        if (newPRs.length > 0) prResults.push({ externalId, newPRs });
      } catch (error) {
        console.warn("Sync PR detection failed:", (error as Error)?.message);
      }
    }

    // Watch Round 1+2 handoff (spec § API dependencies): the response carries
    // everything the wrist Summary + complication need, so no second round
    // trip. Additive — created/updated/total/prs are unchanged. Never lets a
    // summary hiccup fail a sync that already persisted.
    let summary: HeroMetrics | null = null;
    let routine: RoutineCoda | null = null;
    try {
      const timeZone = await getUserTimeZone(null);
      // The routine coda belongs to the newest synced run that names a
      // sequence; its own startedAt is the cutoff so lastRun = the run BEFORE
      // this one, not itself.
      const routineRun = items
        .map((item) => ({
          sequenceId: (item.metricsData as { sequenceId?: string } | undefined)
            ?.sequenceId,
          startedAt: item.startedAt ? new Date(item.startedAt) : new Date(),
        }))
        .filter(
          (r): r is { sequenceId: string; startedAt: Date } =>
            typeof r.sequenceId === "string" && r.sequenceId.length > 0
        )
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

      [summary, routine] = await Promise.all([
        buildHeroMetrics(timeZone),
        routineRun
          ? buildRoutineCoda(routineRun.sequenceId, routineRun.startedAt)
          : Promise.resolve(null),
      ]);
    } catch (error) {
      console.warn("Sync summary enrichment failed:", (error as Error)?.message);
    }

    return NextResponse.json({
      created,
      updated,
      total: items.length,
      prs: prResults,
      summary,
      routine,
    });
  } catch (error) {
    console.error("Mobile workout sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync workouts" },
      { status: 500 }
    );
  }
}
