import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, COACH_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { unitDays } from "@/lib/bible-refs";

// The term's objectives — "what you walk away with".
//
// Written once per term, from the term's own canonical text (its
// rationale, its units, its running assignment). Nothing here is
// invented about the curriculum: the model is summarising decisions
// already made in docs/spirit-curriculum.json, not adding new ones.
//
// The same call also backfills THE AIM on any study that predates the
// field (Term 1 was written before it existed). Both halves are
// idempotent: already-written text is left alone unless ?rewrite=1.

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    objectives: {
      type: "array",
      description: "3-4 outcomes, each one sentence",
      items: { type: "string" },
    },
  },
  required: ["objectives"],
  additionalProperties: false,
} as const;

const AIMS_SCHEMA = {
  type: "object",
  properties: {
    aims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayId: { type: "string" },
          aim: { type: "string" },
        },
        required: ["dayId", "aim"],
        additionalProperties: false,
      },
    },
  },
  required: ["aims"],
  additionalProperties: false,
} as const;

/**
 * Studies written before THE AIM existed get one now — derived from the
 * study's own text, never invented alongside it. Returns how many were
 * filled; zero is the normal steady state.
 */
async function backfillAims(termId: string): Promise<number> {
  const days = await prisma.devotionalDay.findMany({
    where: { termId, aim: null },
    orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }],
  });
  if (days.length === 0) return 0;

  const block = days
    .map((d) => {
      const hw = d.homework as { text?: string } | null;
      return `dayId: ${d.id}
title: ${d.title}
reading: ${d.readingLabel}
teaching (opening): ${d.body.slice(0, 320)}
doctrine: ${d.doctrine.slice(0, 200)}
closing question: ${d.question}
homework: ${hw?.text ?? "—"}`;
    })
    .join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: COACH_MODEL,
    messages: [
      {
        role: "system",
        content: `For each study below, write THE AIM: one sentence, second person, naming what the study is FOR — what he should be able to see or do by the end of it.

RULES:
- One sentence, under 22 words, concrete and checkable. "Spot the question Paul is answering before deciding what the answer means to you." Not "reflect deeply on Paul's words".
- It must follow from THAT study's own text, given below. Never promise anything the study doesn't teach.
- Never an emotional or spiritual state. A skill, a sight, a distinction.
- Return every dayId you were given, unchanged.`,
      },
      { role: "user", content: block },
    ],
    max_completion_tokens: 2500,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "study_aims",
        strict: true,
        schema: AIMS_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  recordAIUsage({
    surface: "spirit-aims",
    model: COACH_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content?.trim() || "{}") as {
    aims?: { dayId: string; aim: string }[];
  };
  const valid = new Set(days.map((d) => d.id));
  let filled = 0;
  for (const row of parsed.aims ?? []) {
    const aim = String(row.aim ?? "").trim();
    if (!valid.has(row.dayId) || !aim) continue;
    await prisma.devotionalDay.update({ where: { id: row.dayId }, data: { aim } });
    filled += 1;
  }
  return filled;
}

export async function POST(request: Request) {
  try {
    const rewrite = new URL(request.url).searchParams.get("rewrite") === "1";
    const term = await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) return NextResponse.json({ error: "No active term" }, { status: 404 });

    const existing = Array.isArray(term.objectives) ? (term.objectives as string[]) : null;
    if (existing?.length && !rewrite) {
      const aims = await backfillAims(term.id);
      return NextResponse.json({ objectives: existing, written: false, aims });
    }

    const units = (Array.isArray(term.syllabus) ? term.syllabus : []) as {
      week: number;
      label: string;
      ref: string;
      days?: number;
    }[];
    const unitLines = units
      .map((u) => `- ${u.label} · ${u.ref} · ${unitDays(u)} studies`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: COACH_MODEL,
      messages: [
        {
          role: "system",
          content: `You write the orientation for one term of a one-man theological university — Reformed and confessional, historically serious, warmly taught. The student is a working adult in Cali, Colombia.

Write 3-4 OBJECTIVES: what he will be able to see, do, or recognise by the end of this term that he could not reliably do before.

RULES:
- Second person, one sentence each, concrete and checkable. "Tell the difference between what a psalm claims and what a proverb claims" — not "grow in wisdom".
- They must follow from THIS term's actual texts and units, named below. Never promise anything the syllabus doesn't cover.
- Skills and sight, not feelings. Never promise an emotional or spiritual state, never promise God will do something.
- No jargon he wouldn't use himself. No numbering, no bullets in the strings.`,
        },
        {
          role: "user",
          content: `TERM ${term.orderIndex}: "${term.title}" (${term.kick})

WHY THIS TERM (canonical): ${term.rationale}
${term.homeworkArc ? `\nTHE RUNNING ASSIGNMENT: ${term.homeworkArc}` : ""}${
            term.hardNote ? `\nHARD NOTE: ${term.hardNote}` : ""
          }

THE UNITS:
${unitLines}`,
        },
      ],
      max_completion_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "term_objectives",
          strict: true,
          schema: SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    recordAIUsage({
      surface: "spirit-orientation",
      model: COACH_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw) as { objectives?: string[] };
    const objectives = (parsed.objectives ?? [])
      .map((o) => String(o).trim())
      .filter(Boolean)
      .slice(0, 4);
    if (objectives.length === 0) {
      return NextResponse.json({ error: "No objectives produced" }, { status: 502 });
    }

    await prisma.term.update({ where: { id: term.id }, data: { objectives } });
    const aims = await backfillAims(term.id);
    return NextResponse.json({ objectives, written: true, aims });
  } catch (error) {
    console.error("Spirit orientation error:", error);
    return NextResponse.json({ error: "Failed to write objectives" }, { status: 500 });
  }
}
