import { Prisma } from "@prisma/client";
import { after, NextRequest, NextResponse } from "next/server";
import { routeDataAllowed } from "@/lib/activities";
import { requireMobileSession } from "@/lib/mobile-session";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import { markPlannedDone } from "@/lib/planner";
import { notify } from "@/lib/notify";
import {
  analyzeRoute,
  type RouteAnalytics,
  type RoutePointIn,
} from "@/lib/route-analytics";
import { prisma } from "@/lib/prisma";
import { detectAndRecordPRs, type NewPR } from "@/lib/prs";
import { buildStreamMetrics } from "@/lib/strava";
import {
  INTERVAL_STREAM_POINTS,
  JUMP_ROPE_TYPE,
  formatJumpRopePR,
} from "@/lib/jump-rope";
import { mergeResync, withCanonicalIds } from "@/lib/workout-resync";
import { isSetLog, type SetLogEntry } from "@/lib/set-log";
import { linkVoiceClips } from "@/lib/voice-audit";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import {
  buildHeroMetrics,
  buildRoutineCoda,
  type HeroMetrics,
  type RoutineCoda,
} from "@/lib/mobile-summary";
import { getUserTimeZone } from "@/lib/server-timezone";
import { readJsonCapped } from "@/lib/request-body";
import {
  errorCode,
  isItemDataError,
  sanitizeSyncItem,
  SYNC_LIMITS,
  type ItemIssue,
  type SanitizedSyncItem,
} from "@/lib/workout-sync-limits";

// A cold start plus a multi-item queue drain can outlive the 10s default —
// which the watch experienced as "tapped Save, nothing happened".
export const maxDuration = 60;

/** A watch item that carries a per-entry log (voice or taps). */
function hasSetLog(metricsData: unknown): boolean {
  return (
    !!metricsData &&
    typeof metricsData === "object" &&
    Array.isArray((metricsData as { setLog?: unknown }).setLog)
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Bounded read (SEC-024): the platform's own ~4.5 MB limit, matched here
    // so a local or self-hosted run is bounded the same way.
    const read = await readJsonCapped(request, SYNC_LIMITS.maxBodyBytes);
    if (!read.ok) {
      return NextResponse.json({ error: read.error }, { status: read.status });
    }
    const body = (read.value && typeof read.value === "object" ? read.value : {}) as { items?: unknown };
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Workout items are required" },
        { status: 400 }
      );
    }

    // Per-item report (additive, SEC-024). The watch removes every pending
    // item on any 2xx, so the rule is: trim and keep wherever possible,
    // report every change, and NEVER fail the whole batch for one item.
    const itemIssues: ItemIssue[] = [];
    const idOf = (raw: unknown) =>
      raw && typeof raw === "object" && typeof (raw as { externalId?: unknown }).externalId === "string"
        ? ((raw as { externalId: string }).externalId.slice(0, SYNC_LIMITS.strings.externalId))
        : null;
    rawItems.slice(SYNC_LIMITS.maxItems).forEach((raw, k) => {
      itemIssues.push({ index: SYNC_LIMITS.maxItems + k, externalId: idOf(raw), action: "rejected", reasons: ["batch_limit"] });
    });
    const items: Array<SanitizedSyncItem & { index: number }> = [];
    rawItems.slice(0, SYNC_LIMITS.maxItems).forEach((raw, index) => {
      const clean = sanitizeSyncItem(raw);
      if (!clean) {
        itemIssues.push({ index, externalId: null, action: "rejected", reasons: ["not_an_object"] });
        return;
      }
      items.push({ ...clean, index });
    });

    // Custom movements must be in the index before any row is given an id.
    if (items.some((i) => hasSetLog(i.metricsData))) {
      await ensureUserExercisesLoaded();
    }

    let created = 0;
    let updated = 0;
    let strippedRoutes = 0;
    // Per-item PR results, keyed by externalId (or index when absent) so the
    // watch can celebrate server-confirmed records after sync.
    const prResults: Array<{ externalId: string | null; newPRs: NewPR[] }> = [];
    const voiceLogs: Array<{
      workoutLogId: string;
      externalId: string | null;
      setLog: SetLogEntry[];
    }> = [];

    // Watch sends raw parallel streams (hrStream bpm + timeStream elapsed-s,
    // optional altitudeStream); the SERVER owns the analytics — same
    // downsample/zones/load math the Strava import runs, so the Activities
    // detail charts light up identically for watch-recorded sessions.
    const enrichMetrics = (
      raw: Prisma.InputJsonValue | undefined,
      workoutType: string
    ): Prisma.InputJsonValue | undefined => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
      const m = raw as Record<string, unknown>;
      const hr = Array.isArray(m.hrStream) ? (m.hrStream as number[]) : [];
      const time = Array.isArray(m.timeStream) ? (m.timeStream as number[]) : [];
      if (hr.length < 2 || time.length < 2 || m.timeInZones) return raw;
      const alt = Array.isArray(m.altitudeStream)
        ? (m.altitudeStream as number[])
        : undefined;
      // Jump rope keeps a finer stream: the per-round peaks and troughs are
      // read off it, and 120 points leaves a 30-second round three samples.
      const computed = buildStreamMetrics(
        { heartrate: hr, time, altitude: alt },
        undefined,
        workoutType === JUMP_ROPE_TYPE ? INTERVAL_STREAM_POINTS : undefined
      );
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
        sequenceId: (item.metricsData as { sequenceId?: string } | null)
          ?.sequenceId,
        startedAt: item.startedAt,
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
          .map((i) => i.trailId ?? "")
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

    // One row, written the dedupe-safe way. Returns what was finally stored
    // (a re-send is merged with edits made on the phone since).
    const writeRow = async (
      data: Prisma.WorkoutLogUncheckedCreateInput & {
        exercises: Prisma.InputJsonValue | typeof Prisma.JsonNull;
        metricsData: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      },
      externalSource: string,
      externalId: string | null
    ) => {
      if (!externalId) {
        const entry = await prisma.workoutLog.create({ data });
        return { id: entry.id, created: true, exercises: data.exercises, metricsData: data.metricsData };
      }
      // Atomicity lives in the DB: (externalSource, externalId) is unique,
      // so a raced or retried POST loses the create and lands as an update.
      // The find-then-create this replaces let two in-flight queue drains
      // both see "not found" and both insert.
      try {
        const entry = await prisma.workoutLog.create({ data });
        return { id: entry.id, created: true, exercises: data.exercises, metricsData: data.metricsData };
      } catch (error) {
        const isDup =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!isDup) throw error;
        // A re-send must not undo what was fixed on the phone since the
        // first one — lib/workout-resync.ts holds the rule.
        const where = { externalSource_externalId: { externalSource, externalId } };
        const prior = await prisma.workoutLog.findUnique({
          where,
          select: { exercises: true, metricsData: true, description: true },
        });
        const merged = prior
          ? mergeResync(prior, {
              exercises: data.exercises === Prisma.JsonNull ? null : data.exercises,
              metricsData: data.metricsData === Prisma.JsonNull ? null : data.metricsData,
              description: data.description ?? null,
            })
          : null;
        const finalExercises = merged
          ? ((merged.exercises as Prisma.InputJsonValue | null) ?? Prisma.JsonNull)
          : data.exercises;
        const finalMetrics = merged
          ? ((merged.metricsData as Prisma.InputJsonValue | null) ?? Prisma.JsonNull)
          : data.metricsData;
        const entry = await prisma.workoutLog.update({
          where,
          data: merged
            ? { ...data, description: merged.description, exercises: finalExercises, metricsData: finalMetrics }
            : data,
        });
        return { id: entry.id, created: false, exercises: finalExercises, metricsData: finalMetrics };
      }
    };

    for (const item of items) {
      const { externalSource, externalId, workoutType } = item;
      const notes = [...item.notes];

      // GPS trails only ride genuinely outdoor types — pre-2026-08-28 watch
      // builds could attach a stale tracker buffer to stationary sessions.
      // Strip, never reject: a sync must not lose a workout.
      const routeAllowed = routeDataAllowed(workoutType);
      if (item.routeData != null && !routeAllowed) strippedRoutes++;
      const routePoints =
        routeAllowed && item.routeData && typeof item.routeData === "object"
          ? (item.routeData as { points?: unknown }).points
          : null;
      // Analytics are derived, never essential: a malformed stream or route
      // costs the derived numbers, not the session.
      let routeAnalytics: RouteAnalytics | null = null;
      try {
        routeAnalytics = Array.isArray(routePoints)
          ? analyzeRoute(routePoints as RoutePointIn[], {
              authoritativeMeters: item.distanceMeters,
            })
          : null;
      } catch {
        notes.push("routeAnalytics:skipped");
      }
      let metrics: Prisma.InputJsonValue | undefined;
      try {
        metrics = enrichMetrics((item.metricsData ?? undefined) as Prisma.InputJsonValue | undefined, workoutType);
      } catch {
        notes.push("streamMetrics:skipped");
        metrics = (item.metricsData ?? undefined) as Prisma.InputJsonValue | undefined;
      }

      const data = {
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        durationMinutes: item.durationMinutes,
        workoutType,
        description: item.description,
        caloriesBurned: item.caloriesBurned,
        distanceMeters: item.distanceMeters,
        stepCount: item.stepCount,
        avgHeartRateBpm: item.avgHeartRateBpm,
        maxHeartRateBpm: item.maxHeartRateBpm,
        elevationGainM: item.elevationGainM,
        // DbNull (SQL NULL), not JsonNull: a JSON-level null made every
        // "routeData IS NOT NULL" audit lie.
        routeData:
          item.routeData != null && routeAllowed
            ? (item.routeData as Prisma.InputJsonValue)
            : Prisma.DbNull,
        metricsData:
          withRouteAnalytics(metrics, routeAnalytics) ?? Prisma.JsonNull,
        // Voice-logged rows arrive named by the server's own parser; the id
        // is added where it is missing so they are findable like edited rows.
        exercises: hasSetLog(item.metricsData)
          ? ((withCanonicalIds(item.exercises) as Prisma.InputJsonValue | undefined) ??
            Prisma.JsonNull)
          : ((item.exercises as Prisma.InputJsonValue | null) ?? Prisma.JsonNull),
        deviceType: item.deviceType ?? session.deviceType,
        externalSource,
        externalId,
        syncStatus: item.syncStatus ?? "synced",
        source: item.source ?? "mobile",
        // Present only when valid, so a retry without it never clears a link.
        ...(item.trailId && validTrailIds.has(item.trailId) ? { trailId: item.trailId } : {}),
      };

      let stored: Awaited<ReturnType<typeof writeRow>>;
      let action: ItemIssue["action"] | null = notes.length > 0 ? "trimmed" : null;
      try {
        stored = await writeRow(data, externalSource, externalId);
      } catch (error) {
        // Only an error about THIS item's data is handled here. The database
        // being unreachable (or anything unknown) fails the request with 500
        // so the watch keeps its whole queue and retries — a 200 that marked
        // every item rejected would make it drop them all.
        if (!isItemDataError(error)) throw error;
        notes.push(`db:${errorCode(error)}`);
        // Keep the session with only its scalar facts; the heavy JSON that
        // the database refused is what is let go, and the row says so.
        const minimal = {
          ...data,
          routeData: Prisma.DbNull,
          exercises: Prisma.JsonNull,
          metricsData: { syncFallback: { reason: errorCode(error), notes: notes.slice(0, 20) } } as Prisma.InputJsonValue,
          description: data.description ? data.description.slice(0, 2_000) : null,
        };
        delete (minimal as { trailId?: string }).trailId;
        try {
          stored = await writeRow(minimal, externalSource, externalId);
          action = "stored_minimal";
        } catch (fallbackError) {
          if (!isItemDataError(fallbackError)) throw fallbackError;
          notes.push(`db:${errorCode(fallbackError)}`);
          itemIssues.push({ index: item.index, externalId, action: "rejected", reasons: notes });
          console.warn(`[sync] item ${item.index} (${externalId ?? "no id"}) rejected: ${notes.join(", ")}`);
          continue;
        }
      }
      if (stored.created) created++;
      else updated++;
      const workoutId = stored.id;
      if (action) {
        itemIssues.push({ index: item.index, externalId, action, reasons: notes });
        if (action === "stored_minimal") {
          console.warn(`[sync] item ${item.index} (${externalId ?? "no id"}) stored minimal: ${notes.join(", ")}`);
        }
      }

      // The session's voice clips get tied to the row they ended up on.
      const savedLog = (stored.metricsData as { setLog?: unknown } | null)?.setLog;
      if (isSetLog(savedLog)) {
        voiceLogs.push({ workoutLogId: workoutId, externalId, setLog: savedLog });
      }

      // Server-side PR detection — same engine as web logging, so wrist
      // sessions land in personal_records too. Never blocks the sync.
      try {
        const newPRs = await detectAndRecordPRs({
          workoutLogId: workoutId,
          exercises: stored.exercises === Prisma.JsonNull ? null : stored.exercises,
          achievedAt: data.startedAt,
          workoutType,
          metricsData: stored.metricsData === Prisma.JsonNull ? null : stored.metricsData,
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
    // Off the critical path, after the response: a saved session on a
    // planned day completes the plan, and a fresh PR earns its (pref-gated)
    // celebration push. Neither may tax the watch's wait or fail the sync.
    const newestSaved = items
      .map((item) => ({
        startedAt: item.startedAt,
        sequenceId:
          (item.metricsData as { sequenceId?: string } | null)?.sequenceId ??
          null,
      }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    after(async () => {
      for (const log of voiceLogs) await linkVoiceClips(log);
      try {
        const timeZone = (await timeZonePromise) || "America/Bogota";
        if (newestSaved) {
          await markPlannedDone({
            startedAt: newestSaved.startedAt,
            timeZone,
            sequenceId: newestSaved.sequenceId,
          });
        }
      } catch (error) {
        console.warn("Planned-done hook failed:", (error as Error)?.message);
      }
      try {
        const firstPR = prResults[0]?.newPRs[0];
        if (firstPR) {
          const prefs = await getNotificationPrefs();
          if (prefs.prCelebration) {
            // Jump rope records are rounds, a duration or a jump count —
            // one formatter so the push reads like the phone.
            const isRope = firstPR.unit !== "kg" && firstPR.unit !== "kg-reps";
            const unit = firstPR.unit === "kg-reps" ? "kg total" : firstPR.unit;
            await notify({
              category: "prCelebration",
              title: `PR · ${firstPR.exerciseName}`,
              body: isRope
                ? `${formatJumpRopePR(firstPR.kind, firstPR.value)}${
                    firstPR.previousValue != null
                      ? ` — was ${formatJumpRopePR(firstPR.kind, firstPR.previousValue)}`
                      : ""
                  }`
                : `${firstPR.value} ${unit}${
                firstPR.previousValue != null ? ` — was ${firstPR.previousValue}` : ""
              }`,
              url: "/health/workouts",
              tag: "pr-celebration",
            });
          }
        }
      } catch (error) {
        console.warn("PR push failed:", (error as Error)?.message);
      }
    });

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
      total: rawItems.length,
      // Additive (2026-08-28): items whose routeData was dropped because the
      // workoutType can't legitimately carry a GPS trail.
      strippedRoutes,
      // Additive (2026-10, SEC-024): every item that was trimmed, stored in a
      // minimal form, or not stored — with why. Older watch builds ignore it
      // (their decoder skips unknown keys, as it already does strippedRoutes).
      itemIssues: itemIssues.sort((a, b) => a.index - b.index),
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
