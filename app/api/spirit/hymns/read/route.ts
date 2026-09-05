import { NextRequest, NextResponse } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

export const maxDuration = 60;

// The camera, PROPOSING. Photos of printed hymn sheets in, structured proposals
// out — and nothing is saved here: he edits and confirms, and only then does
// POST /api/spirit/hymns write (the confirmation-dock rule, kept). One AI call,
// only when he asks, metered like every other vision call.
//
// The schema and the prompt encode what his actual photos proved necessary:
// a sheet can hold the TAIL of one hymn and the START of the next; lyric lines
// are lines, never re-wrapped; the page may be rotated (photographed on a knee);
// the chorus is labelled, and a hymn cut off by the page edge is flagged.

const SCHEMA = {
  name: "hymn_sheet",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      hymns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "As printed, usually uppercase; empty string if the sheet shows none" },
            stanzas: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: ["string", "null"], description: "\"Coro\"/\"Chorus\"/\"Estribillo\" when the block is the refrain; else null" },
                  lines: { type: "array", items: { type: "string" } },
                },
                required: ["label", "lines"],
              },
            },
            partial: { type: "boolean", description: "true when the hymn runs off the edge of the sheet — its beginning or end is not on this photo" },
          },
          required: ["title", "stanzas", "partial"],
        },
      },
      confident: { type: "boolean" },
    },
    required: ["hymns", "confident"],
  },
} as const;

export async function POST(request: NextRequest) {
  try {
    const { images } = (await request.json()) as { images?: string[] };
    if (!images?.length) return NextResponse.json({ error: "Nothing to read" }, { status: 400 });
    const clean = images.filter((i) => typeof i === "string" && i.length > 50).slice(0, 4);
    if (!clean.length) return NextResponse.json({ error: "Nothing to read" }, { status: 400 });

    const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } })[] = [
      {
        type: "text",
        text: "Read the hymn sheet photograph(s). Rules that matter: (1) A single sheet often holds MORE THAN ONE hymn — return every one you find, in order, and a sheet may carry only the tail end of a hymn whose beginning is on another page. (2) Preserve line breaks EXACTLY as printed — lyric lines are lines, never re-wrap them into prose. (3) The photo may be rotated or skewed (taken on a knee); read it anyway. (4) A refrain labelled Coro/Chorus/Estribillo gets that label on its stanza rather than being folded into a verse. (5) Set partial=true on any hymn cut off by the edge of the sheet. Titles are usually bold uppercase lines.",
      },
      ...clean.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`, detail: "high" as const },
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You transcribe printed hymn sheets (Spanish and English) into exact, line-faithful text." },
        { role: "user", content },
      ],
      max_completion_tokens: 2400,
      response_format: { type: "json_schema", json_schema: SCHEMA },
    });
    recordAIUsage({
      surface: "spirit-hymn",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      hymns?: { title: string; stanzas: { label: string | null; lines: string[] }[]; partial: boolean }[];
      confident?: boolean;
    };
    const hymns = (parsed.hymns ?? [])
      .filter((h) => h.stanzas?.some((s) => s.lines?.length))
      .map((h) => ({
        title: (h.title ?? "").trim(),
        partial: Boolean(h.partial),
        // the editable text he confirms — the same plain-text convention lib/hymns.ts parses
        body: h.stanzas
          .map((s) => (s.label ? `${s.label}:\n` : "") + s.lines.join("\n"))
          .join("\n\n"),
      }));
    return NextResponse.json({ proposal: { hymns, confident: parsed.confident !== false } });
  } catch (error) {
    console.error("Spirit hymn read error:", error);
    return NextResponse.json({ error: "Couldn't read the sheet" }, { status: 500 });
  }
}
