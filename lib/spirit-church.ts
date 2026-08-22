// The Sunday track's week mechanics, shared by the Church route and the
// sermon page's closing pass: mark a week preached, prepare the next one.

import { prisma } from "@/lib/prisma";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

export const WEEK_SCHEMA = {
  type: "object",
  properties: {
    passageRef: { type: "string" },
    title: { type: "string", description: "e.g. 'Galatians 3 — faith and the law'" },
    context: { type: "string", description: "2-3 sentences of historical/literary context for the passage" },
    questions: { type: "array", items: { type: "string" }, description: "exactly 3 questions to bring back on Sunday" },
  },
  required: ["passageRef", "title", "context", "questions"],
  additionalProperties: false,
} as const;

type SeriesRow = NonNullable<Awaited<ReturnType<typeof prisma.churchSeries.findFirst>>>;

export async function prepareNextWeek(series: SeriesRow) {
  const nextWeek = series.currentWeek + 1;
  const passages = (Array.isArray(series.passages) ? series.passages : []) as { ref: string; label: string }[];
  const preachedCount = nextWeek - 1;
  const upNext =
    passages.filter((p) => p.label !== "preached")[preachedCount - passages.filter((p) => p.label === "preached").length] ??
    passages[passages.length - 1] ??
    null;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You prepare a one-card sermon follow-along for a Reformed layman: the passage's context in 2-3 plain sentences, and exactly three questions he should carry into Sunday's sermon. No flattery, no filler.",
      },
      {
        role: "user",
        content: `Series: "${series.title}"${series.themes ? ` · themes: ${series.themes}` : ""}. Week ${nextWeek}${series.expectedWeeks ? ` of ≈${series.expectedWeeks}` : ""}.${
          upNext ? ` This week's passage: ${upNext.ref}.` : " The announcement named no further passages — continue where the series' book naturally goes next and say which passage you chose."
        }`,
      },
    ],
    max_completion_tokens: 500,
    response_format: {
      type: "json_schema",
      json_schema: { name: "week_prep", strict: true, schema: WEEK_SCHEMA as unknown as Record<string, unknown> },
    },
  });
  recordAIUsage({
    surface: "spirit-church",
    model: CHAT_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  let week: Record<string, unknown> | null = null;
  try {
    week = JSON.parse(completion.choices[0]?.message?.content?.trim() || "null");
  } catch {
    week = null;
  }
  if (!week) return null;
  const weeks = (Array.isArray(series.weeks) ? series.weeks : []) as Record<string, unknown>[];
  return prisma.churchSeries.update({
    where: { id: series.id },
    data: {
      currentWeek: nextWeek,
      weeks: JSON.parse(JSON.stringify([...weeks, { index: nextWeek, ...week, status: "next" }])),
      ...(series.expectedWeeks && nextWeek > series.expectedWeeks ? { status: "done" } : {}),
    },
  });
}

/** Sunday happened: the current week is preached (page + recording attached), the next one is prepared. */
export async function closeSermonWeek(opts: { seriesId: string; weekIndex: number; pageId: string; recordingId?: string | null; carried?: number }) {
  const series = await prisma.churchSeries.findUnique({ where: { id: opts.seriesId } });
  if (!series) return null;
  const weeks = (Array.isArray(series.weeks) ? series.weeks : []) as Record<string, unknown>[];
  const marked = weeks.map((w) =>
    Number(w.index) === opts.weekIndex
      ? { ...w, status: "preached", pageId: opts.pageId, recordingId: opts.recordingId ?? null, carried: opts.carried ?? 0, preachedAt: new Date().toISOString() }
      : w,
  );
  const passages = (Array.isArray(series.passages) ? series.passages : []) as { ref: string; label: string }[];
  let flipped = false;
  const nextPassages = passages.map((p) => {
    if (!flipped && p.label === "next") {
      flipped = true;
      return { ...p, label: "preached" };
    }
    return p;
  });
  const saved = await prisma.churchSeries.update({
    where: { id: series.id },
    data: { weeks: JSON.parse(JSON.stringify(marked)), passages: JSON.parse(JSON.stringify(nextPassages)) },
  });
  if (saved.currentWeek !== opts.weekIndex) return saved; // closing an older page: never advance twice
  const advanced = await prepareNextWeek(saved).catch(() => null);
  return advanced ?? saved;
}
