// Handwriting → the hidden text layer, through the app's own vision model.
// Works on the web path and the native pane alike (both hand over a PNG).
// It reads context — "Ro 8 28" is Romans 8:28; names are names — and
// proposes, never saves (the confirm card decides).

import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { findReferences, type FoundRef } from "@/lib/ink-refs";
import { parseReadingRef } from "@/lib/spirit-refs";

const SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          bbox: {
            type: ["array", "null"],
            items: { type: "number" },
            description: "[x, y, w, h] as fractions 0..1 of the image, or null",
          },
        },
        required: ["text", "bbox"],
        additionalProperties: false,
      },
    },
    references: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string", description: "exactly as written, e.g. 'Ro 4:3'" },
          normalized: { type: "string", description: "full book name + chapter:verse(-verse), e.g. 'Romans 4:3'" },
          context: { type: "string", description: "the phrase it was written beside, ≤ 12 words" },
          suggestedAction: { type: "string", enum: ["connection", "question", "none"] },
          reason: { type: "string", description: "≤ 10 words: why that action" },
        },
        required: ["raw", "normalized", "context", "suggestedAction", "reason"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "object",
      properties: {
        bigIdea: { type: ["string", "null"] },
        points: { type: "array", items: { type: "string" } },
        quotes: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" }, description: "questions he wrote to bring back or left open" },
      },
      required: ["bigIdea", "points", "quotes", "questions"],
      additionalProperties: false,
    },
  },
  required: ["lines", "references", "summary"],
  additionalProperties: false,
} as const;

export interface RecognizedRef extends FoundRef {
  context: string;
  suggestedAction: "connection" | "question" | "none";
  reason: string;
  bbox?: number[] | null;
}

export interface RecognitionResult {
  text: string;
  lines: { text: string; bbox: number[] | null }[];
  refs: RecognizedRef[];
  summary: { bigIdea: string | null; points: string[]; quotes: string[]; questions: string[] };
}

export async function recognizeInk(opts: {
  imageDataUrl: string;
  inkLang?: string;
  kind?: string;
  context?: string;
}): Promise<RecognitionResult> {
  const lang = opts.inkLang || "en";
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          `You transcribe a Reformed Christian's handwritten study notes (a notebook page image). Notes are mostly in ${lang === "es" ? "Spanish" : "English"}; Bible references may be abbreviated ("Ro 8 28" = Romans 8:28, "1 Co 7 1-7" = 1 Corinthians 7:1-7, "Heb 11:32", "Gal 3:1-5"). Transcribe every line faithfully, keep his wording, never add commentary. For each Bible reference, give the normalized full-name form, the phrase it sits beside, and whether it reads as a CONNECTION (he is linking this passage to another) or a QUESTION (he is asking something about it) or none. The summary is short and factual. Names like Kat, Jonathan, Benjamin, Pr. Marcos are people.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Page kind: ${opts.kind ?? "notes"}.${opts.context ? ` Context: ${opts.context}.` : ""} Read the handwriting and return the JSON.`,
          },
          { type: "image_url", image_url: { url: opts.imageDataUrl, detail: "high" } },
        ],
      },
    ],
    max_completion_tokens: 1800,
    response_format: {
      type: "json_schema",
      json_schema: { name: "ink_recognition", strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
    },
  });
  recordAIUsage({
    surface: "spirit-ink",
    model: CHAT_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  let parsed: {
    lines?: { text: string; bbox: number[] | null }[];
    references?: { raw: string; normalized: string; context: string; suggestedAction: "connection" | "question" | "none"; reason: string }[];
    summary?: { bigIdea: string | null; points: string[]; quotes: string[]; questions: string[] };
  } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const lines = (parsed.lines ?? []).filter((l) => l && typeof l.text === "string" && l.text.trim());
  const text = lines.map((l) => l.text.trim()).join("\n");

  // Resolve the model's references through the curriculum's parser; union
  // with a regex pass over the text so a reference the model missed still
  // goes live.
  const refs: RecognizedRef[] = [];
  const seen = new Set<string>();
  for (const r of parsed.references ?? []) {
    const segs = parseReadingRef(r.normalized || r.raw);
    if (!segs.length) continue;
    const seg = segs[0];
    const key = `${seg.refStart}-${seg.refEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = lines.find((l) => l.text.includes(r.raw));
    refs.push({
      raw: r.raw,
      label: seg.label,
      refStart: seg.refStart,
      refEnd: seg.refEnd,
      segment: seg,
      context: r.context,
      suggestedAction: r.suggestedAction ?? "none",
      reason: r.reason ?? "",
      bbox: line?.bbox ?? null,
    });
  }
  for (const f of findReferences(text)) {
    const key = `${f.refStart}-${f.refEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = lines.find((l) => l.text.includes(f.raw));
    refs.push({ ...f, context: line?.text ?? "", suggestedAction: "none", reason: "found in the text layer", bbox: line?.bbox ?? null });
  }
  return {
    text,
    lines,
    refs,
    summary: parsed.summary ?? { bigIdea: null, points: [], quotes: [], questions: [] },
  };
}
