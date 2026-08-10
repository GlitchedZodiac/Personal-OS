import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { openai, COACH_MODEL } from "@/lib/openai";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";
import {
  buildReportContext,
  reportSystemPrompt,
  reportUserPrompt,
  type WorkoutForReport,
} from "@/lib/workout-report";

export const maxDuration = 60;

const SELECT = {
  id: true,
  startedAt: true,
  durationMinutes: true,
  workoutType: true,
  description: true,
  caloriesBurned: true,
  avgHeartRateBpm: true,
  maxHeartRateBpm: true,
  exercises: true,
  metricsData: true,
  source: true,
} as const;

type StoredReport = { text: string; generatedAt: string; model: string };

function existingReport(metricsData: Prisma.JsonValue): StoredReport | null {
  if (!metricsData || typeof metricsData !== "object" || Array.isArray(metricsData))
    return null;
  const report = (metricsData as Record<string, unknown>).report;
  if (report && typeof report === "object" && "text" in report) {
    return report as StoredReport;
  }
  return null;
}

// GET ?id= — the stored report, if one has been generated.
export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const workout = await prisma.workoutLog.findUnique({
      where: { id },
      select: { metricsData: true },
    });
    if (!workout) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ report: existingReport(workout.metricsData) });
  } catch (error) {
    console.error("Workout report fetch error:", error);
    return NextResponse.json({ report: null });
  }
}

// POST { workoutId, refresh? } — generate (or return the cached) report.
export async function POST(request: NextRequest) {
  try {
    const { workoutId, refresh } = await request.json();
    if (!workoutId || typeof workoutId !== "string") {
      return NextResponse.json({ error: "workoutId required" }, { status: 400 });
    }

    const workout = (await prisma.workoutLog.findUnique({
      where: { id: workoutId },
      select: SELECT,
    })) as WorkoutForReport | null;

    if (!workout) {
      return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    }

    // A report costs a COACH_MODEL call — never regenerate silently.
    const cached = existingReport(workout.metricsData);
    if (cached && !refresh) {
      return NextResponse.json({ report: cached, cached: true });
    }

    // Recent same-type sessions give the model something to compare against.
    const history = (await prisma.workoutLog.findMany({
      where: {
        workoutType: workout.workoutType,
        startedAt: { lt: workout.startedAt },
      },
      select: SELECT,
      orderBy: { startedAt: "desc" },
      take: 5,
    })) as WorkoutForReport[];

    // PRs already detected at log time — read them rather than re-deriving.
    const prs = await prisma.personalRecord.findMany({
      where: { workoutLogId: workout.id },
      select: { exerciseName: true, kind: true, value: true, unit: true },
    });

    const context = buildReportContext(workout, history, prs);

    const completion = await openai.chat.completions.create({
      model: COACH_MODEL,
      messages: [
        { role: "system", content: reportSystemPrompt() },
        { role: "user", content: reportUserPrompt(context) },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "Empty report" }, { status: 502 });
    }

    recordAIUsage({
      surface: "insights",
      model: COACH_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const report: StoredReport = {
      text,
      generatedAt: new Date().toISOString(),
      model: COACH_MODEL,
    };

    const baseMetrics =
      workout.metricsData &&
      typeof workout.metricsData === "object" &&
      !Array.isArray(workout.metricsData)
        ? (workout.metricsData as Record<string, unknown>)
        : {};

    await prisma.workoutLog.update({
      where: { id: workout.id },
      data: {
        metricsData: { ...baseMetrics, report } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      report,
      signals: {
        present: context.signalsPresent,
        missing: context.signalsMissing,
      },
    });
  } catch (error) {
    console.error("Workout report error:", error);
    const { kind, userMessage } = classifyOpenAIError(error);
    return NextResponse.json(
      {
        error:
          kind === "unknown" ? "Couldn't write the report just now." : userMessage,
        kind,
      },
      { status: kind === "unknown" ? 500 : 502 }
    );
  }
}
