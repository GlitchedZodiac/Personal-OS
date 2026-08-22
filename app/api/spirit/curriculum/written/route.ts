import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

// Every study carries a written assignment (his 2026-08-22 rule). New terms
// get it from the generator; this backfills the studies already written,
// one visible call per term, his tap.

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, writtenPrompt: { type: "string" } },
        required: ["id", "writtenPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

export async function GET() {
  const term = await prisma.term.findFirst({ where: { status: "active" } });
  if (!term) return NextResponse.json({ term: null, missing: 0 });
  const missing = await prisma.devotionalDay.count({ where: { termId: term.id, writtenPrompt: null } });
  return NextResponse.json({ term: { id: term.id, title: term.title, orderIndex: term.orderIndex }, missing });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { termId?: string };
    const term = body.termId
      ? await prisma.term.findUnique({ where: { id: body.termId } })
      : await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) return NextResponse.json({ error: "No term" }, { status: 400 });
    const days = await prisma.devotionalDay.findMany({
      where: { termId: term.id, writtenPrompt: null },
      orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }],
    });
    if (!days.length) return NextResponse.json({ updated: 0 });
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write the WRITTEN ASSIGNMENT for Bible studies in a Reformed, history-first curriculum — 'a university for the working Christian who dabbles on weekends'. One per study, ≤ 25 words, second person, concrete and floored: a sentence in his own words, a short list, a paraphrase, a line he writes before bed. It must leave something WRITTEN even when the study's homework is to sit, read, research, compare or ask. Never an essay, never a grade, never flattery.",
        },
        {
          role: "user",
          content: JSON.stringify(
            days.map((d) => ({
              id: d.id,
              title: d.title,
              aim: d.aim,
              question: d.question,
              reading: d.readingLabel,
              homework: d.homework,
            })),
          ),
        },
      ],
      max_completion_tokens: 2000,
      response_format: { type: "json_schema", json_schema: { name: "written_prompts", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
    });
    recordAIUsage({ surface: "spirit-generate", model: CHAT_MODEL, inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0 });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { items?: { id: string; writtenPrompt: string }[] };
    let updated = 0;
    for (const it of parsed.items ?? []) {
      if (!days.find((d) => d.id === it.id) || !it.writtenPrompt?.trim()) continue;
      await prisma.devotionalDay.update({ where: { id: it.id }, data: { writtenPrompt: it.writtenPrompt.trim() } });
      updated++;
    }
    return NextResponse.json({ updated, total: days.length });
  } catch (error) {
    console.error("Spirit written backfill error:", error);
    return NextResponse.json({ error: "Failed to write the assignments" }, { status: 500 });
  }
}
