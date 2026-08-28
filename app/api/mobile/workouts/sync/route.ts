import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { routeDataAllowed } from "@/lib/activities";
import { requireMobileSession } from "@/lib/mobile-session";
import {
  analyzeRoute,
  type RouteAnalytics,
  type RoutePointIn,
} from "@/lib/route-analytics";
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

// A cold start plus a multi-item queue drain can outlive the 10s default —
// which the watch experienced as "tapped Save, nothing happened".
export const maxDuration = 60;

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
  // Additive (2026-08-28, §Trails): set when the session was started from a
  // saved trail on the wrist.
  trailId?: string;
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
    let strippedRoutes = 0;
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

    // Route analytics (2026-08-28): moving/stopped time, breaks, splits and
    // grade-adjusted pace from the full-res GPS buffer — additive key, same
    // server-owns-analytics policy as the zone math above.
    const withRouteAnalytics = (
      metrics: Prisma.InputJsonValue | undefined,
      analytics: RouteAnalytics | null
    ): Prisma.InputJsonValue | undefined => {
      if (!analytics) return metrics;
      const base =
        metrics && typeof metrics === "object" && !Array.isArray(metrics)
          ? (metrics as Record<string, unknown>)
          : {};
      return { ...base, routeAnalytics: analytics } as unknown as Prisma.InputJsonValue;
    };

    // The routine coda belongs to the newest synced run that names a
    // sequence; its own startedAt is the cutoff so lastRun = the run BEFORE
    // this one, not itself. That also means it never needs to see this sync's
    // inserts — start it (and the timezone read) now so their DB work overlaps
    // the insert loop instead of extending the watch's wait afterwards.
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
    const timeZonePromise = getUserTimeZone(null).catch((error: unknown) => {
      console.warn("Sync timezone read failed:", (error as Error)?.message);
      return null;
    });
    const routinePromise: Promise<RoutineCoda | null> = routineRun
      ? buildRoutineCoda(routineRun.sequenceId, routineRun.startedAt).catch(
          (error: unknown) => {
            console.warn("Sync routine coda failed:", (error as Error)?.message);
            return null;
          }
        )
      : Promise.resolve(null);

    // Trail links ride the item only when the id is real — an unknown id is
    // dropped silently rather than failing the save.
    const requestedTrailIds = [
      ...new Set(
        items
          .map((i) => (typeof i.trailId === "string" ? i.trailId.trim() : ""))
          .filter(Boolean)
      ),
    ];
    const validTrailIds = new Set(
      requestedTrailIds.length
        ? (
            await prisma.trail.findMany({
              where: { id: { in: requestedTrailIds } },
              select: { id: true },
            })
          ).map((t) => t.id)
        : []
    );

    for (const item of items) {
      const externalSource =
        typeof item.externalSource === "string" && item.externalSource.trim().length > 0
          ? item.externalSource.trim()
          : "app_watch";
      const externalId =
        typeof item.externalId === "string" && item.externalId.trim().length > 0
          ? item.externalId.trim()
          : null;

      const workoutType =
        typeof item.workoutType === "string" && item.workoutType.trim().length > 0
          ? item.workoutType.trim()
          : "other";
      // GPS trails only ride genuinely outdoor types — pre-2026-08-28 watch
      // builds could attach a stale tracker buffer to stationary sessions.
      // Strip, never reject: a sync must not lose a workout.
      const routeAllowed = routeDataAllowed(workoutType);
      if (item.routeData != null && !routeAllowed) strippedRoutes++;
      const routePoints =
        routeAllowed && item.routeData && typeof item.routeData === "object"
          ? (item.routeData as { points?: unknown }).points
          : null;
      const routeAnalytics = Array.isArray(routePoints)
        ? analyzeRoute(routePoints as RoutePointIn[])
        : null;

      const data = {
        startedAt: item.startedAt ? new Date(item.startedAt) : new Date(),
        endedAt: item.endedAt ? new Date(item.endedAt) : null,
        durationMinutes: Math.max(0, Number(item.durationMinutes || 0)),
        workoutType,
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
        // DbNull (SQL NULL), not JsonNull: a JSON-level null made every
        // "routeData IS NOT NULL" audit lie.
        routeData:
          item.routeData != null && routeAllowed
            ? item.routeData
            : Prisma.DbNull,
        metricsData:
          withRouteAnalytics(enrichMetrics(item.metricsData), routeAnalytics) ??
          Prisma.JsonNull,
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
        // Present only when valid, so a retry without it never clears a link.
        ...(typeof item.trailId === "string" && validTrailIds.has(item.trailId.trim())
          ? { trailId: item.trailId.trim() }
          : {}),
      };

      let workoutId: string;
      if (externalId) {
        // Atomicity lives in the DB: (externalSource, externalId) is unique,
        // so a raced or retried POST loses the create and lands as an update.
        // The find-then-create this replaces let two in-flight queue drains
        // both see "not found" and both insert.
        try {
          const entry = await prisma.workoutLog.create({ data });
          created++;
          workoutId = entry.id;
        } catch (error) {
          const isDup =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002";
          if (!isDup) throw error;
          const entry = await prisma.workoutLog.update({
            where: { externalSource_externalId: { externalSource, externalId } },
            data,
          });
          updated++;
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
    // summary hiccup fail a sync that already persisted. Hero metrics stay
    // AFTER the loop: z2WeeklyMinutes must count the rows just written.
    let summary: HeroMetrics | null = null;
    const routine: RoutineCoda | null = await routinePromise;
    try {
      const timeZone = await timeZonePromise;
      if (timeZone) summary = await buildHeroMetrics(timeZone);
    } catch (error) {
      console.warn("Sync summary enrichment failed:", (error as Error)?.message);
    }

    return NextResponse.json({
      created,
      updated,
      total: items.length,
      // Additive (2026-08-28): items whose routeData was dropped because the
      // workoutType can't legitimately carry a GPS trail.
      strippedRoutes,
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
