import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionVolumeKg, type RawExercise } from "@/lib/prs";
import { activityTypeOf, routeDataAllowed, type RunMetrics } from "@/lib/activities";
import { getZoneTops } from "@/lib/server-zones";
import type { RouteAnalytics } from "@/lib/route-analytics";
import { movementContext, timeUnderLoadSeconds } from "@/lib/strength-history";
import { getMovementHistoriesCached } from "@/lib/strength-history-db";
import { runProfileMatchesTrail } from "@/lib/trails";
import {
  JUMP_ROPE_NAME,
  JUMP_ROPE_TYPE,
  analyzeIntervals,
  groupByProtocol,
  readIntervals,
} from "@/lib/jump-rope";
import { isSetLog, withGaps } from "@/lib/set-log";

// GET ?id= — everything the activity detail screen shows (design 2026-08-11
// rev): stats, per-movement segments with time-vs-last-run comparison,
// segment-timeline blocks, HR stream + zones, elevation, route. One call.

type LoadedExercise = RawExercise & {
  seconds?: number | string;
  exercise?: string;
  perSide?: boolean;
  load?: { type?: string; kg?: number; assumed?: boolean };
};

function clock(seconds: number): string {
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
    : `${Math.round(seconds)}s`;
}

// A timed row used to print nothing at all ("Jump Rope" with a blank line
// under it); a worn vest is shown beside the implement weight, never added.
function segSub(e: LoadedExercise): string {
  const sets = Number(e.sets) || null;
  const reps = Number(e.reps) || null;
  const seconds = Number(e.seconds) || null;
  const weight = Number(e.weightKg ?? e.weight) || null;
  const side = e.perSide ? "/side" : "";
  const dose = reps
    ? sets
      ? `${sets} × ${reps}${side}`
      : `${reps} reps${side}`
    : seconds
      ? sets && sets > 1
        ? `${sets} × ${clock(seconds)}`
        : clock(seconds)
      : null;
  const vest =
    e.load?.type === "vest" && typeof e.load.kg === "number" ? `vest ${e.load.kg} kg` : null;
  return [dose, weight ? `${weight} kg` : null, vest].filter(Boolean).join(" · ");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const w = await prisma.workoutLog.findUnique({ where: { id } });
    if (!w) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const m = (w.metricsData ?? {}) as RunMetrics;
    const type = activityTypeOf(w);
    const exercises = Array.isArray(w.exercises) ? (w.exercises as RawExercise[]) : [];
    const stepSeconds = Array.isArray(m.stepSeconds) ? m.stepSeconds : null;

    // Time-vs-last comparison: the previous run of the SAME routine with
    // per-step timing. Positional — both runs walked the same step list.
    let prevStepSeconds: number[] | null = null;
    if (m.sequenceId && stepSeconds) {
      const prev = await prisma.workoutLog.findFirst({
        where: {
          id: { not: w.id },
          startedAt: { lt: w.startedAt },
          metricsData: { path: ["sequenceId"], equals: m.sequenceId },
        },
        orderBy: { startedAt: "desc" },
        select: { metricsData: true },
      });
      const pm = (prev?.metricsData ?? {}) as RunMetrics;
      if (Array.isArray(pm.stepSeconds)) prevStepSeconds = pm.stepSeconds;
    }

    // Per-movement context (2026-08-29, the strength round): "best 32 ·
    // last time 24" per row. Speed round: the 400-row per-view fetch became
    // a shared 60 s memo (lib/strength-history-db).
    const histories =
      type !== "out" && exercises.length > 0 ? await getMovementHistoriesCached() : null;
    const startedIso = w.startedAt.toISOString();

    const segments = exercises.map((e, i) => {
      const seconds = stepSeconds?.[i] ?? null;
      const prevSec = prevStepSeconds?.[i] ?? null;
      const ctx =
        histories && typeof e.name === "string"
          ? movementContext(histories, e.name, startedIso)
          : null;
      return {
        name: typeof e.name === "string" ? e.name : "—",
        sub: segSub(e),
        seconds,
        deltaSeconds:
          seconds != null && prevSec != null && prevSec > 0 ? seconds - prevSec : null,
        bestWeightKg: ctx?.bestWeightKg ?? null,
        lastTimeKg: ctx?.lastTime?.topWeightKg ?? null,
        timesTrained: ctx?.timesTrained ?? null,
      };
    });

    const prCount = await prisma.personalRecord.count({ where: { workoutLogId: w.id } });

    // Jump rope (2026-10-05): the interval arithmetic, this session's own
    // records, and every earlier session on the same protocol — "all my
    // 30/30s" is the only comparison that means anything.
    const intervals = type === "rope" ? readIntervals(m) : null;
    const timeStream = Array.isArray(m.timeStream) ? m.timeStream : null;
    const lastT = timeStream && timeStream.length ? Number(timeStream[timeStream.length - 1]) : 0;
    const rope = intervals
      ? analyzeIntervals({
          intervals,
          hrStream: m.hrStream,
          timeStream: m.timeStream,
          // The stream's own clock when there is one (pauses excluded, like
          // the marks); the rounded minutes only as a fallback.
          durationSeconds: lastT > 0 ? lastT : w.durationMinutes * 60,
          caloriesBurned: w.caloriesBurned,
        })
      : null;
    const [ropeRecords, ropeHistory] = rope
      ? await Promise.all([
          prisma.personalRecord.findMany({
            where: { workoutLogId: w.id, kind: { in: ["rounds", "duration", "jumps", "jumps_round"] } },
            select: { kind: true, value: true, previousValue: true, exerciseName: true },
          }),
          prisma.workoutLog
            .findMany({
              where: { workoutType: JUMP_ROPE_TYPE },
              orderBy: { startedAt: "desc" },
              take: 60,
              select: {
                id: true,
                startedAt: true,
                durationMinutes: true,
                caloriesBurned: true,
                metricsData: true,
              },
            })
            .then(
              (rows) =>
                groupByProtocol(rows).find((g) => g.protocol === rope.protocol) ?? null
            ),
        ])
      : [[], null];

    // The wrist's per-entry log (voice + taps), with the gap since the
    // previous entry stamped on each — the review card reads this.
    const setLog = isSetLog(m.setLog) ? withGaps(m.setLog) : null;
    const rawLog = isSetLog(m.setLog) ? m.setLog : null;

    // Display-side half of the freestyle-integrity guard: rows written by
    // pre-2026-08-28 watch builds can still carry a leaked trail — a
    // stationary type never renders one, whatever is in the column.
    const routeData = routeDataAllowed(w.workoutType)
      ? ((w.routeData ?? {}) as { summaryPolyline?: string })
      : {};

    // Named-trail context (2026-08-28; comparison added 2026-08-29): the
    // trail card carries the PREVIOUS run of the same ground so "2 runs
    // logged" actually compares them, plus the full run list for hopping.
    const trail = w.trailId
      ? await (async () => {
          const [t, runs] = await Promise.all([
            prisma.trail.findUnique({
              where: { id: w.trailId! },
              select: { id: true, name: true, elevationGainM: true },
            }),
            prisma.workoutLog.findMany({
              where: { trailId: w.trailId! },
              orderBy: { startedAt: "desc" },
              take: 12,
              select: {
                id: true,
                startedAt: true,
                durationMinutes: true,
                distanceMeters: true,
                elevationGainM: true,
                avgHeartRateBpm: true,
                metricsData: true,
              },
            }),
          ]);
          if (!t) return null;
          const runCount = runs.length;
          const summarize = (r: (typeof runs)[number]) => {
            const ra = ((r.metricsData ?? {}) as RunMetrics).routeAnalytics;
            const movingSeconds = ra?.movingSeconds ?? null;
            const gain = r.elevationGainM ?? ra?.totalElevGainM ?? null;
            return {
              id: r.id,
              startedAt: r.startedAt.toISOString(),
              durationMinutes: r.durationMinutes,
              distanceMeters: r.distanceMeters,
              elevationGainM: gain,
              avgHeartRateBpm: r.avgHeartRateBpm,
              movingSeconds,
              paceSecPerKm: ra?.avgMovingPaceSecPerKm ?? null,
              vamMPerHour:
                gain != null && gain >= 50 && movingSeconds && movingSeconds > 0
                  ? Math.round(gain / (movingSeconds / 3600))
                  : null,
            };
          };
          // Direction-aware (2026-08-29): a descent linked to a climb trail
          // must not become the comparison baseline — the audit's +13.5 m
          // "last run" on a +390 m trail.
          const sameDirection = (r: (typeof runs)[number]) =>
            runProfileMatchesTrail(t.elevationGainM, r.elevationGainM);
          const prevRow = runs.find(
            (r) => r.id !== w.id && r.startedAt < w.startedAt && sameDirection(r)
          );
          return {
            id: t.id,
            name: t.name,
            runCount,
            prevRun: prevRow ? summarize(prevRow) : null,
            runs: runs.map(summarize),
          };
        })()
      : null;

    const ra = (m.routeAnalytics ?? null) as RouteAnalytics | null;

    // Absolute altitude (2026-08-29): the wrist's altitudeStream is
    // CMAltimeter RELATIVE metres — labeling it as elevation printed
    // "1 – 376 m" on a 1,480 m summit. routeData.points[].alt is GPS MSL;
    // prefer it, and say which one the client is getting.
    const fullRoute = routeDataAllowed(w.workoutType)
      ? ((w.routeData ?? {}) as { points?: Array<{ alt?: number | null }> })
      : {};
    const absoluteAlts = Array.isArray(fullRoute.points)
      ? fullRoute.points
          .map((p) => p?.alt)
          .filter((a): a is number => Number.isFinite(a ?? NaN))
      : [];
    const downsampleAlts = (values: number[], cap = 120): number[] => {
      if (values.length <= cap) return values;
      const step = values.length / cap;
      return Array.from({ length: cap }, (_, i) => values[Math.floor(i * step)]);
    };
    const altitudeAbsolute = absoluteAlts.length >= 2;
    const altitudeSeries = altitudeAbsolute
      ? downsampleAlts(absoluteAlts)
      : Array.isArray(m.altitudeStream)
        ? m.altitudeStream
        : null;

    // VAM + descent (2026-08-29): the mountaineering rate the report asked
    // for. Barometric column gain is the trusted numerator; ≥50 m keeps
    // flat-walk noise out.
    const movingSeconds = ra?.movingSeconds ?? null;
    const gainForVam = w.elevationGainM ?? ra?.totalElevGainM ?? null;
    const vamMPerHour =
      gainForVam != null && gainForVam >= 50 && movingSeconds && movingSeconds > 0
        ? Math.round(gainForVam / (movingSeconds / 3600))
        : null;
    const descentM = ra != null && ra.totalElevLossM >= 10 ? ra.totalElevLossM : null;

    // §07 HRR from the wrist — band vocabulary matches the watch verdict.
    const hrr =
      typeof m.hrrDelta === "number" && m.hrrDelta > 0
        ? {
            delta: m.hrrDelta,
            seconds: typeof m.hrrSeconds === "number" ? m.hrrSeconds : 60,
            band: m.hrrDelta >= 25 ? "quick" : m.hrrDelta >= 15 ? "typical" : "slow",
          }
        : null;

    // Body weight nearest the session (±36 h) — the report's "every power
    // number leans on a weight from a different conversation". Nearest by
    // actual gap: one weigh-in before, one after, closer wins.
    const windowMs = 36 * 3600 * 1000;
    const [weighBefore, weighAfter] = await Promise.all([
      prisma.bodyMeasurement.findFirst({
        where: {
          weightKg: { not: null },
          measuredAt: { gte: new Date(w.startedAt.getTime() - windowMs), lte: w.startedAt },
        },
        orderBy: { measuredAt: "desc" },
        select: { weightKg: true, measuredAt: true },
      }),
      prisma.bodyMeasurement.findFirst({
        where: {
          weightKg: { not: null },
          measuredAt: { gt: w.startedAt, lte: new Date(w.startedAt.getTime() + windowMs) },
        },
        orderBy: { measuredAt: "asc" },
        select: { weightKg: true, measuredAt: true },
      }),
    ]);
    const nearestWeigh =
      weighBefore && weighAfter
        ? Math.abs(weighBefore.measuredAt.getTime() - w.startedAt.getTime()) <=
          Math.abs(weighAfter.measuredAt.getTime() - w.startedAt.getTime())
          ? weighBefore
          : weighAfter
        : (weighBefore ?? weighAfter);

    return NextResponse.json({
      id: w.id,
      type,
      name:
        type === "rope"
          ? JUMP_ROPE_NAME
          : (m.sequenceName ?? w.description ?? w.workoutType).split(/\s[·•]\s/)[0],
      workoutType: w.workoutType,
      startedAt: w.startedAt.toISOString(),
      durationMinutes: w.durationMinutes,
      caloriesBurned: w.caloriesBurned,
      distanceMeters: w.distanceMeters,
      elevationGainM: w.elevationGainM,
      stepCount: w.stepCount,
      avgHeartRateBpm: w.avgHeartRateBpm,
      maxHeartRateBpm: w.maxHeartRateBpm,
      externalSource: w.externalSource,
      source: w.source,
      volumeKg: type === "out" ? 0 : sessionVolumeKg(w.exercises),
      prCount,
      sequenceName: m.sequenceName ?? null,
      roundsCompleted: m.roundsCompleted ?? m.emom?.roundsCompleted ?? null,
      totalRounds: m.emom?.totalRounds ?? null,
      workSeconds: stepSeconds ? stepSeconds.reduce((s, x) => s + (x || 0), 0) : null,
      stepSeconds,
      segments,
      // Raw movement list for the on-page editor (2026-08-29) — the same
      // shape PATCH /api/health/workouts/entry ATTACH accepts back.
      exercises: (exercises as LoadedExercise[]).map((e) => ({
        name: typeof e.name === "string" ? e.name : "",
        // Present when the name resolved — a row without it is a movement
        // the vocabulary does not know yet (the review card offers to add it).
        exercise: typeof e.exercise === "string" ? e.exercise : null,
        sets: Number(e.sets) || null,
        reps: Number(e.reps) || null,
        seconds: Number(e.seconds) || null,
        weightKg: Number(e.weightKg ?? e.weight) || null,
        load:
          e.load?.type === "vest" && typeof e.load.kg === "number"
            ? { type: "vest" as const, kg: e.load.kg, ...(e.load.assumed ? { assumed: true } : {}) }
            : null,
        perSide: e.perSide === true,
      })),
      rope,
      ropeRecords,
      ropeHistory,
      setLog,
      // Entries still waiting on audio, or dropped — shown, never counted.
      setLogPending: rawLog
        ? rawLog.filter((e) => e.status === "queued" || e.status === "failed")
        : [],
      setLogReviewedAt: typeof m.setLogReviewedAt === "string" ? m.setLogReviewedAt : null,
      lateEntryIds: Array.isArray(m.lateEntryIds) ? m.lateEntryIds : [],
      exercisesEditedAt: m.exercisesEditedAt ?? null,
      hrStream: Array.isArray(m.hrStream) ? m.hrStream : null,
      // The time axis the HR trace was always missing (it plotted by sample
      // index) — the interval chart needs it to put a round where it was.
      timeStream,
      zonePct: m.timeInZones?.pct ?? null,
      zoneSeconds: m.timeInZones?.seconds ?? null,
      zoneTops: await getZoneTops(),
      altitudeStream: Array.isArray(m.altitudeStream) ? m.altitudeStream : null,
      altitudeSeries,
      altitudeAbsolute,
      vamMPerHour,
      descentM,
      hrr,
      // Strength round (2026-08-29): stored-but-never-rendered effort
      // numbers + the honest time-under-load for seconds-based steps.
      loadScore: typeof m.loadScore === "number" ? m.loadScore : null,
      relativeEffort: typeof m.relativeEffort === "number" ? m.relativeEffort : null,
      // Strava parity (2026-08-29): wrist cadence, plus legacy Strava
      // moving/elapsed keys as fallbacks for rows without routeAnalytics.
      avgCadenceSpm:
        typeof m.avgCadenceSpm === "number"
          ? m.avgCadenceSpm
          : typeof m.avgCadence === "number"
            ? Math.round(m.avgCadence * 2) // Strava stores one-leg cadence
            : null,
      movingTimeFallbackSeconds:
        typeof m.movingTime === "number" ? m.movingTime : null,
      timeUnderLoadSeconds:
        type !== "out" ? timeUnderLoadSeconds(w.exercises) || null : null,
      packKg: w.packKg,
      bodyWeight: nearestWeigh
        ? {
            kg: nearestWeigh.weightKg,
            measuredAt: nearestWeigh.measuredAt.toISOString(),
          }
        : null,
      polyline: routeData.summaryPolyline ?? null,
      routeAnalytics: m.routeAnalytics ?? null,
      trail,
    });
  } catch (error) {
    console.error("Activity detail error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
