import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionVolumeKg, type RawExercise } from "@/lib/prs";
import { activityTypeOf, type RunMetrics } from "@/lib/activities";

// GET ?id= — everything the activity detail screen shows (design 2026-08-11
// rev): stats, per-movement segments with time-vs-last-run comparison,
// segment-timeline blocks, HR stream + zones, elevation, route. One call.

function segSub(e: RawExercise): string {
  const sets = Number(e.sets) || null;
  const reps = Number(e.reps) || null;
  const weight = Number(e.weightKg ?? e.weight) || null;
  const parts = [
    sets && reps ? `${sets} × ${reps}` : reps ? `${reps} reps` : null,
    weight ? `${weight} kg` : null,
  ].filter(Boolean);
  return parts.join(" · ");
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

    const segments = exercises.map((e, i) => {
      const seconds = stepSeconds?.[i] ?? null;
      const prevSec = prevStepSeconds?.[i] ?? null;
      return {
        name: typeof e.name === "string" ? e.name : "—",
        sub: segSub(e),
        seconds,
        deltaSeconds:
          seconds != null && prevSec != null && prevSec > 0 ? seconds - prevSec : null,
      };
    });

    const prCount = await prisma.personalRecord.count({ where: { workoutLogId: w.id } });

    const routeData = (w.routeData ?? {}) as { summaryPolyline?: string };

    return NextResponse.json({
      id: w.id,
      type,
      name: (m.sequenceName ?? w.description ?? w.workoutType).split(/\s[·•]\s/)[0],
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
      hrStream: Array.isArray(m.hrStream) ? m.hrStream : null,
      zonePct: m.timeInZones?.pct ?? null,
      altitudeStream: Array.isArray(m.altitudeStream) ? m.altitudeStream : null,
      polyline: routeData.summaryPolyline ?? null,
    });
  } catch (error) {
    console.error("Activity detail error:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
