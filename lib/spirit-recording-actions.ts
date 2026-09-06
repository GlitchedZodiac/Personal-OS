// The recording's actions — summary, attach-to-page, worksheet — as ONE lib,
// shared by the API routes (the app's buttons) and the MCP tools (his "set
// these up over MCP so we save tokens when not interfacing with the app").
// Each is a single metered AI call at most; nothing runs automatically.

import { prisma } from "@/lib/prisma";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { ensureSystemNotebooks, headerObject, promptObject, json } from "@/lib/spirit-notebooks";
import type { PageObject, Stroke } from "@/lib/ink";

interface TranscriptLine { start: number; end: number; text: string; gloss?: string | null }

function lines(rec: { transcript: unknown }): TranscriptLine[] {
  return Array.isArray(rec.transcript) ? (rec.transcript as TranscriptLine[]) : [];
}

/** the transcript flattened for a prompt — glosses included when present */
export function transcriptText(rec: { transcript: unknown }, maxChars = 60_000): string {
  const ls = lines(rec);
  let out = "";
  for (const l of ls) {
    out += `[${Math.floor(l.start / 60)}:${String(Math.floor(l.start % 60)).padStart(2, "0")}] ${l.text}\n`;
    if (l.gloss) out += `    (EN: ${l.gloss})\n`;
    if (out.length > maxChars) break;
  }
  return out.slice(0, maxChars);
}

async function getRecordingOr(id: string | undefined) {
  if (id) return prisma.recording.findUnique({ where: { id } });
  // "the latest" — what MCP callers usually mean
  return prisma.recording.findFirst({ orderBy: { startedAt: "desc" } });
}

// ————————————————————————————————————————————————— summary

const SUMMARY_SCHEMA = {
  name: "sermon_summary",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      bigIdea: { type: "string", description: "one sentence — the sermon's thesis in the preacher's own direction" },
      points: { type: "array", items: { type: "string" }, description: "3-6 main points, each one plain sentence" },
      scriptures: { type: "array", items: { type: "string" }, description: "passages actually cited, e.g. 'Romans 8:28'" },
      application: { type: "string", description: "the one thing the sermon asked the hearer to do or believe; empty string if none was given" },
    },
    required: ["bigIdea", "points", "scriptures", "application"],
  },
} as const;

/**
 * Generate (or regenerate) the recording's summary from its transcript and store
 * it. English output regardless of the sermon's language — his notes are EN.
 */
export async function summarizeRecording(id?: string, opts: { force?: boolean } = {}) {
  const rec = await getRecordingOr(id);
  if (!rec) return { error: "no recording found" as const };
  if (rec.summary && !opts.force) {
    return { recording: { id: rec.id, title: rec.title }, summary: rec.summary, existed: true };
  }
  const text = transcriptText(rec);
  if (text.length < 200) return { error: "no transcript yet — transcribe the recording first" as const };

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You summarize sermon transcripts (often Spanish, sometimes with English glosses) for a Reformed listener's own notes. Faithful to what was PREACHED — never add doctrine the preacher didn't state. Output in English.",
      },
      { role: "user", content: `Sermon: ${rec.title}${rec.preacher ? ` — ${rec.preacher}` : ""}${rec.passageRef ? ` — ${rec.passageRef}` : ""}\n\nTranscript:\n${text}` },
    ],
    max_completion_tokens: 1200,
    response_format: { type: "json_schema", json_schema: SUMMARY_SCHEMA },
  });
  recordAIUsage({
    surface: "spirit-recording",
    model: CHAT_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    bigIdea?: string; points?: string[]; scriptures?: string[]; application?: string;
  };
  if (!parsed.bigIdea) return { error: "the model returned nothing usable" as const };
  const summary = [
    parsed.bigIdea.trim(),
    "",
    ...(parsed.points ?? []).map((p) => `· ${p.trim()}`),
    ...(parsed.scriptures?.length ? ["", `Scriptures: ${parsed.scriptures.join(" · ")}`] : []),
    ...(parsed.application?.trim() ? ["", `Application: ${parsed.application.trim()}`] : []),
  ].join("\n");
  await prisma.recording.update({ where: { id: rec.id }, data: { summary, summaryAt: new Date() } });
  return { recording: { id: rec.id, title: rec.title }, summary, existed: false };
}

// ————————————————————————————————————————————————— attach to a page

/**
 * Put the summary ON a page as a typed block — the linked sermon page by
 * default, any page by id. Placed under everything already there; running it
 * again replaces the block it made (label-matched), never stacks duplicates.
 */
export async function attachSummaryToPage(id?: string, pageId?: string) {
  const rec = await getRecordingOr(id);
  if (!rec) return { error: "no recording found" as const };
  if (!rec.summary) return { error: "no summary yet — create the summary first" as const };
  const targetId = pageId ?? rec.pageId;
  if (!targetId) return { error: "the recording has no linked page — give a pageId" as const };
  const page = await prisma.inkPage.findUnique({ where: { id: targetId } });
  if (!page || page.deletedAt) return { error: "that page doesn't exist" as const };

  const objects = (Array.isArray(page.objects) ? (page.objects as unknown as PageObject[]) : []).slice();
  const strokes = Array.isArray(page.strokes) ? (page.strokes as unknown as Stroke[]) : [];
  const label = `SUMMARY · ${rec.title.toUpperCase()}`;
  const kept = objects.filter((o) => !(o.type === "text" && (o.data as { label?: string })?.label === label));
  let maxY = 140;
  for (const o of kept) maxY = Math.max(maxY, o.y + (o.h ?? 60));
  for (const st of strokes) for (const pt of st.pts) if (pt.y > maxY) maxY = pt.y;
  const textH = Math.max(90, Math.ceil(rec.summary.length / 68) * 19 + 46);
  const block: PageObject = {
    id: `sum-${Math.random().toString(36).slice(2, 9)}`,
    type: "text",
    x: 40,
    y: Math.ceil(maxY + 36),
    w: 720,
    h: textH,
    t0: Date.now(),
    data: { text: rec.summary, label },
  };
  kept.push(block);
  await prisma.inkPage.update({ where: { id: page.id }, data: { objects: json(kept) } });
  return { attached: { pageId: page.id, pageTitle: page.title ?? "page", replaced: kept.length !== objects.length + 1 } };
}

// ————————————————————————————————————————————————— worksheet

const WORKSHEET_SCHEMA = {
  name: "sermon_worksheet",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "a short worksheet title in the sermon's own words" },
      aim: { type: "string", description: "one line: what working through this reinforces" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string", description: "the question, UPPERCASE-friendly, <= 90 chars" },
            kind: { type: "string", enum: ["lines", "field", "sketch"], description: "lines = written answer, field = one-line fact, sketch = draw it" },
            lines: { type: "number", description: "for kind=lines: 2-6 ruled lines" },
          },
          required: ["label", "kind", "lines"],
        },
      },
    },
    required: ["title", "aim", "questions"],
  },
} as const;

export interface WorksheetQuestion { label: string; kind: "lines" | "field" | "sketch"; lines: number }

/** PURE: questions → the page's objects (unit-tested; the AI never lays out a page) */
export function worksheetObjects(meta: { kicker: string; title: string; aim: string; chips?: string[] }, questions: WorksheetQuestion[]): PageObject[] {
  const objs: PageObject[] = [
    headerObject({ kicker: meta.kicker, title: meta.title, chips: meta.chips ?? [], aim: meta.aim }),
  ];
  let y = 150;
  for (const q of questions.slice(0, 7)) {
    const o = promptObject(y, q.kind === "sketch"
      ? { label: q.label, sketch: true }
      : q.kind === "field"
        ? { label: q.label, field: true }
        : { label: q.label, lined: true, lines: Math.min(6, Math.max(2, Math.round(q.lines || 3))) });
    objs.push(o);
    y += (o.h ?? 40) + 22;
  }
  return objs;
}

/**
 * AI writes 4–6 reinforcement questions from the transcript (or the summary when
 * the transcript is gone) and a worksheet page lands in the Worksheets notebook —
 * prompts to answer in ink, like the study worksheets he already knows.
 */
export async function createRecordingWorksheet(id?: string) {
  const rec = await getRecordingOr(id);
  if (!rec) return { error: "no recording found" as const };
  const source = transcriptText(rec) || rec.summary || "";
  if (source.length < 200) return { error: "no transcript or summary to work from — transcribe first" as const };

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You write short worksheets that help a listener retain a sermon: recall first, then understanding, then one application he must write in his own words. Questions come FROM the sermon — never invent content it didn't carry. 4 to 6 questions. English.",
      },
      { role: "user", content: `Sermon: ${rec.title}${rec.passageRef ? ` — ${rec.passageRef}` : ""}\n\n${source}` },
    ],
    max_completion_tokens: 900,
    response_format: { type: "json_schema", json_schema: WORKSHEET_SCHEMA },
  });
  recordAIUsage({
    surface: "spirit-recording",
    model: CHAT_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    title?: string; aim?: string; questions?: WorksheetQuestion[];
  };
  if (!parsed.title || !parsed.questions?.length) return { error: "the model returned nothing usable" as const };

  const nbs = await ensureSystemNotebooks();
  const dateLabel = new Date(rec.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  const objs = worksheetObjects(
    { kicker: `SERMON · ${dateLabel}${rec.preacher ? ` · ${rec.preacher.toUpperCase()}` : ""}`, title: parsed.title, aim: parsed.aim ?? "", chips: rec.passageRef ? [rec.passageRef.toUpperCase()] : [] },
    parsed.questions,
  );
  const page = await prisma.inkPage.create({
    data: {
      kind: "worksheet",
      notebookId: nbs.worksheets?.id ?? null,
      title: parsed.title,
      subtitle: `from the recording · ${rec.title}`,
      objects: json(objs),
      strokes: json([]),
    },
  });
  return { worksheet: { pageId: page.id, title: parsed.title, questions: parsed.questions.length } };
}
