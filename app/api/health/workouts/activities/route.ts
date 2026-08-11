import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";
import { activityTypeOf, type RunMetrics } from "@/lib/activities";

// GET ?before=<ISO>&take=N — light activity cards for Train → Activities
// (design: activities list, 2026-08-11 rev). Full detail lives at
// /api/health/workouts/activity?id=. Cards only — no streams — so the list
// stays cheap however long the history gets ("older weeks load as you
// scroll" = cursor pagination on startedAt).

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take")) || 30));
    const beforeDate = before ? new Date(before) : null;
    // Optional from/to (ISO dates or datetimes) — the range-picker filter.
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : null;
    const startedAt: { lt?: Date; gte?: Date; lte?: Date } = {};
    if (beforeDate && Number.isFinite(beforeDate.getTime())) startedAt.lt = beforeDate;
    if (fromDate && Number.isFinite(fromDate.getTime())) startedAt.gte = fromDate;
    if (toDate && Number.isFinite(toDate.getTime())) startedAt.lte = toDate;

    const [rows, total] = await Promise.all([
      prisma.workoutLog.findMany({
        where: Object.keys(startedAt).length > 0 ? { startedAt } : undefined,
        orderBy: { startedAt: "desc" },
        take,
        select: {
          id: true,
          startedAt: true,
          workoutType: true,
          description: true,
          durationMinutes: true,
          distanceMeters: true,
          elevationGainM: true,
          stepCount: true,
          exercises: true,
          metricsData: true,
          externalSource: true,
          source: true,
        },
      }),
      prisma.workoutLog.count(),
    ]);

    const items = rows.map((w) => {
      const m = (w.metricsData ?? {}) as RunMetrics;
      const type = activityTypeOf(w);
      const volumeKg = type === "out" ? 0 : sessionVolumeKg(w.exercises);
      // Strava imports pack the whole stat line into description
      // ("Afternoon Run · 1.87 km · avg HR…") — the card wants the title.
      const title = (m.sequenceName ?? w.description ?? w.workoutType).split(/\s[·•]\s/)[0];
      return {
        id: w.id,
        type,
        name: title,
        workoutType: w.workoutType,
        startedAt: w.startedAt.toISOString(),
        durationMinutes: w.durationMinutes,
        distanceMeters: w.distanceMeters,
        elevationGainM: w.elevationGainM,
        stepCount: w.stepCount,
        volumeKg,
        roundsCompleted: m.roundsCompleted ?? m.emom?.roundsCompleted ?? null,
        workSeconds: Array.isArray(m.stepSeconds)
          ? m.stepSeconds.reduce((s, x) => s + (x || 0), 0)
          : null,
        externalSource: w.externalSource,
        source: w.source,
      };
    });

    return NextResponse.json({
      items,
      total,
      nextBefore: rows.length === take ? rows[rows.length - 1].startedAt.toISOString() : null,
    });
  } catch (error) {
    console.error("Activities list error:", error);
    return NextResponse.json({ error: "Failed to load activities" }, { status: 500 });
  }
}
