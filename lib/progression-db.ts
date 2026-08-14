import { prisma } from "@/lib/prisma";
import {
  analyzeProgression,
  type ProgressionRun,
  type ProgressionSequence,
  type ProgressionStep,
} from "@/lib/progression";

// DB-facing wrapper for the pure progression math — one query pass,
// shared by the progression API and the Sunday report.
export async function buildProgressionSuggestions() {
  const [sequences, runs] = await Promise.all([
    prisma.sequence.findMany({ where: { isArchived: false } }),
    prisma.workoutLog.findMany({
      where: { metricsData: { path: ["sequenceId"], not: "null" } },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: { startedAt: true, durationMinutes: true, metricsData: true },
    }),
  ]);

  const runsBySeq = new Map<string, ProgressionRun[]>();
  for (const w of runs) {
    const m = (w.metricsData ?? {}) as {
      sequenceId?: string;
      roundsCompleted?: number;
      emom?: { roundsCompleted?: number; totalRounds?: number };
    };
    if (!m.sequenceId) continue;
    const list = runsBySeq.get(m.sequenceId) ?? [];
    list.push({
      startedAt: w.startedAt.toISOString(),
      roundsCompleted: m.roundsCompleted ?? m.emom?.roundsCompleted ?? null,
      totalRounds: m.emom?.totalRounds ?? null,
      durationMinutes: w.durationMinutes,
    });
    runsBySeq.set(m.sequenceId, list);
  }

  const suggestions = [];
  for (const seq of sequences) {
    const s: ProgressionSequence = {
      id: seq.id,
      name: seq.name,
      kind: seq.kind,
      rounds: seq.rounds,
      durationMinutes: seq.durationMinutes,
      steps: (Array.isArray(seq.steps) ? seq.steps : []) as unknown as ProgressionStep[],
      progression: (seq.progression ?? null) as { lastRaiseAt?: string } | null,
    };
    const suggestion = analyzeProgression(s, runsBySeq.get(seq.id) ?? []);
    if (suggestion) suggestions.push(suggestion);
  }
  return suggestions;
}

