import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

// The Sunday track. He tells the app what his church announced — spoken,
// photographed slides, or a pasted transcript — the AI parses it into a
// proposal, HE confirms, and only then does the series commit. AI runs
// only when he initiates (the confirmation-dock shape, kept).

export const maxDuration = 60;

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Series title, e.g. 'Sons, Not Slaves — Galatians'" },
    expectedWeeks: { type: ["number", "null"], description: "Expected number of Sundays, null if unknown" },
    lengthNote: { type: ["string", "null"], description: "How length was described, e.g. \"pastor said 'through the fall'\"" },
    passages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "e.g. 'Galatians 1–2'" },
          label: { type: "string", description: "short status label: 'preached', 'next', or 'coming'" },
        },
        required: ["ref", "label"],
        additionalProperties: false,
      },
    },
    themes: { type: ["string", "null"], description: "themes separated by ' · '" },
  },
  required: ["title", "expectedWeeks", "lengthNote", "passages", "themes"],
  additionalProperties: false,
} as const;

const WEEK_SCHEMA = {
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

export async function GET() {
  try {
    const series = await prisma.churchSeries.findFirst({
      where: { status: "active" },
    });
    return NextResponse.json({ series });
  } catch (error) {
    console.error("Spirit church error:", error);
    return NextResponse.json({ error: "Failed to load series" }, { status: 500 });
  }
}

// POST — parse his input (text and/or slide photos) into a proposal.
// Nothing persists here; the proposal returns for his confirmation.
export async function POST(request: NextRequest) {
  try {
    const { text, images } = (await request.json()) as {
      text?: string;
      images?: string[];
    };
    if (!text?.trim() && !images?.length) {
      return NextResponse.json({ error: "Nothing to parse" }, { status: 400 });
    }

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } }
    > = [];
    content.push({
      type: "text",
      text: `Parse what this church announced about its new sermon series.${
        text?.trim() ? `\n\nWhat Michael heard/said: "${text.trim()}"` : ""
      }${images?.length ? "\n\nSlide photos attached — read title, outline, passages from them." : ""}`,
    });
    for (const img of images ?? []) {
      content.push({
        type: "image_url",
        image_url: {
          url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
          detail: "high",
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract sermon-series facts from a churchgoer's description or slide photos. Extract only what was actually said or shown — leave expectedWeeks null rather than inventing a number. Passage labels: 'preached' for already covered, 'next' for the upcoming Sunday, 'coming' for later.",
        },
        { role: "user", content },
      ],
      max_completion_tokens: 700,
      response_format: {
        type: "json_schema",
        json_schema: { name: "series_parse", strict: true, schema: PARSE_SCHEMA as unknown as Record<string, unknown> },
      },
    });
    recordAIUsage({
      surface: "spirit-church",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const proposal = JSON.parse(raw);
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error("Spirit church parse error:", error);
    return NextResponse.json({ error: "Failed to parse the announcement" }, { status: 500 });
  }
}

// PATCH — a new Sunday happened. Advance the series one week and
// generate the next follow-along card (his tap, one visible step).
export async function PATCH() {
  try {
    const series = await prisma.churchSeries.findFirst({ where: { status: "active" } });
    if (!series) return NextResponse.json({ error: "No active series" }, { status: 400 });

    const nextWeek = series.currentWeek + 1;
    const passages = (Array.isArray(series.passages) ? series.passages : []) as {
      ref: string;
      label: string;
    }[];
    // The next unpreached passage, if the announcement named one.
    const preachedCount = nextWeek - 1;
    const upNext =
      passages.filter((p) => p.label !== "preached")[preachedCount - (passages.filter((p) => p.label === "preached").length)] ??
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
    if (!week) return NextResponse.json({ error: "Couldn't prepare the week" }, { status: 500 });

    const weeks = (Array.isArray(series.weeks) ? series.weeks : []) as Record<string, unknown>[];
    const updated = await prisma.churchSeries.update({
      where: { id: series.id },
      data: {
        currentWeek: nextWeek,
        weeks: JSON.parse(
          JSON.stringify([...weeks, { index: nextWeek, ...week, status: "next" }]),
        ),
        ...(series.expectedWeeks && nextWeek > series.expectedWeeks
          ? { status: "done" }
          : {}),
      },
    });
    return NextResponse.json({ series: updated });
  } catch (error) {
    console.error("Spirit church advance error:", error);
    return NextResponse.json({ error: "Failed to advance the series" }, { status: 500 });
  }
}

// PUT — he confirmed. Create the series and generate the current week's
// follow-along (passage context + three questions), one visible step.
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const passages = Array.isArray(body.passages) ? body.passages : [];
    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const next =
      passages.find((p: { label?: string }) => p.label === "next") ??
      passages[0] ??
      null;

    let week: Record<string, unknown> | null = null;
    if (next?.ref) {
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
            content: `Series: "${title}"${body.themes ? ` · themes: ${body.themes}` : ""}. This week's passage: ${next.ref}.`,
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
      try {
        week = JSON.parse(completion.choices[0]?.message?.content?.trim() || "null");
      } catch {
        week = null;
      }
    }

    // One active series at a time — a new confirm supersedes.
    await prisma.churchSeries.updateMany({
      where: { status: "active" },
      data: { status: "done" },
    });

    const currentWeek = Math.max(
      1,
      passages.filter((p: { label?: string }) => p.label === "preached").length + 1,
    );
    const series = await prisma.churchSeries.create({
      data: {
        title,
        expectedWeeks: body.expectedWeeks ? Number(body.expectedWeeks) : null,
        lengthNote: body.lengthNote ? String(body.lengthNote) : null,
        passages,
        themes: body.themes ? String(body.themes) : null,
        currentWeek,
        weeks: week ? [{ index: currentWeek, ...week, status: "next" }] : [],
      },
    });
    return NextResponse.json({ series });
  } catch (error) {
    console.error("Spirit church confirm error:", error);
    return NextResponse.json({ error: "Failed to start the track" }, { status: 500 });
  }
}
