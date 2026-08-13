import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, COACH_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { getPassage } from "@/lib/esv";
import { BOOKS, syllabusTarget, unitDays } from "@/lib/bible-refs";

// The term batch — when a term is announced its studies are written
// ONCE, as a visible batch he watches, never a nightly shimmer. One
// call per week writes that week's six studies; the client loops the
// weeks with a progress bar. Scripture quotations are fetched from the
// ESV API afterward (never model-recalled); commentary/confession
// quotes are forbidden unless the source is stored in his library.

export const maxDuration = 120;

const CATEGORIES = new Set([
  "God",
  "Promise & Covenant",
  "Command",
  "Sin & Consequence",
  "Christ",
  "Context",
]);

const WEEK_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayIndex: { type: "number" },
          title: { type: "string", description: "lecture title, sentence case, no colon-itis" },
          body: { type: "string", description: "the teaching, 110-170 words, warm lecturer" },
          pullRef: { type: "string", description: "ONE hinge verse ref inside the day's reading, e.g. 'Judges 4:14'" },
          contextBlock: { type: "string", description: "THE WORLD BEHIND THE TEXT — history/geography/culture, 60-110 words, concrete" },
          doctrine: { type: "string", description: "THE DOCTRINE — 50-90 words, confessional Reformed" },
          practice: { type: "string", description: "THE PRACTICE — 30-60 words, one concrete act" },
          question: { type: "string", description: "closing question in first person, one sentence" },
          oneMoreTitle: { type: "string", description: "church-history vignette title, e.g. 'Worms, 1521'" },
          oneMoreBody: { type: "string", description: "the vignette, 50-90 words, factual, dated, NO invented quotes" },
          readingRef: { type: "string", description: "ESV query for the day's reading, e.g. 'Judges 4:1-16'" },
          readingLabel: { type: "string", description: "human label, e.g. 'Judges 4:1–16 · the muster at Tabor'" },
          estMinutes: { type: "number" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                sourceKey: { type: "string", description: "MUST be one of the provided library keys" },
              },
              required: ["label", "sourceKey"],
              additionalProperties: false,
            },
          },
          suggested: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "string", description: "single verse inside the day's reading, e.g. 'Judges 4:9'" },
                category: { type: "string", description: "one of: God · Promise & Covenant · Command · Sin & Consequence · Christ · Context" },
              },
              required: ["ref", "category"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "dayIndex", "title", "body", "pullRef", "contextBlock", "doctrine",
          "practice", "question", "oneMoreTitle", "oneMoreBody", "readingRef",
          "readingLabel", "estMinutes", "citations", "suggested",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["days"],
  additionalProperties: false,
} as const;

function parseVerseRef(raw: string): number | null {
  const m = raw.trim().match(/^(.+?)\s+(\d+):(\d+)/);
  if (!m) return null;
  const idx = BOOKS.findIndex((b) => b.toLowerCase() === m[1].trim().toLowerCase());
  if (idx < 0) return null;
  return (idx + 1) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
}

export async function GET() {
  try {
    const term = await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) return NextResponse.json({ term: null });
    const rows = (Array.isArray(term.syllabus) ? term.syllabus : []) as {
      week: number;
      days?: number;
    }[];
    const [days, completions] = await Promise.all([
      prisma.devotionalDay.findMany({
        where: { termId: term.id },
        select: { id: true, weekIndex: true },
      }),
      prisma.studyCompletion.findMany({ select: { dayId: true } }),
    ]);
    const doneIds = new Set(completions.map((c) => c.dayId));
    const byWeek = new Map<number, { have: number; done: number }>();
    for (const d of days) {
      const w = byWeek.get(d.weekIndex) ?? { have: 0, done: 0 };
      w.have += 1;
      if (doneIds.has(d.id)) w.done += 1;
      byWeek.set(d.weekIndex, w);
    }
    return NextResponse.json({
      term: { id: term.id, title: term.title, weeks: term.weeks, generatedAt: term.generatedAt },
      weeks: Array.from({ length: term.weeks }, (_, i) => ({
        week: i + 1,
        have: byWeek.get(i + 1)?.have ?? 0,
        done: byWeek.get(i + 1)?.done ?? 0,
        target: unitDays(rows.find((r) => r.week === i + 1)),
      })),
      total: days.length,
      target: syllabusTarget(term.syllabus, term.weeks),
      completed: days.filter((d) => doneIds.has(d.id)).length,
    });
  } catch (error) {
    console.error("Spirit generate status error:", error);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { week } = (await request.json()) as { week: number };
    const term = await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) return NextResponse.json({ error: "No active term" }, { status: 400 });
    if (!Number.isInteger(week) || week < 1 || week > term.weeks) {
      return NextResponse.json({ error: "Bad week" }, { status: 400 });
    }

    const syllabus = (Array.isArray(term.syllabus) ? term.syllabus : []) as {
      week: number;
      label: string;
      ref: string;
      days?: number;
      hard?: boolean;
    }[];
    const row = syllabus.find((r) => r.week === week);
    if (!row) return NextResponse.json({ error: "Week not in syllabus" }, { status: 400 });

    const existing = await prisma.devotionalDay.findMany({
      where: { termId: term.id, weekIndex: week },
      select: { dayIndex: true },
    });
    const nDays = unitDays(row);
    const have = new Set(existing.map((d) => d.dayIndex));
    if (have.size >= nDays) {
      return NextResponse.json({ created: 0, skipped: nDays, week });
    }

    const [sources, specimen] = await Promise.all([
      prisma.sourceDoc.findMany({ select: { key: true, title: true, body: true } }),
      prisma.devotionalDay.findFirst({
        where: { termId: term.id, weekIndex: 5, dayIndex: 4 },
      }),
    ]);

    const sourceList = sources
      .map((s) => `- key "${s.key}": ${s.title}\n  ${s.body.slice(0, 500)}`)
      .join("\n");

    const specimenBlock = specimen
      ? `STYLE SPECIMEN (a finished study from this term — match its voice, density and length exactly):
title: ${specimen.title}
body: ${specimen.body}
contextBlock: ${specimen.contextBlock}
doctrine: ${specimen.doctrine}
practice: ${specimen.practice}
question: ${specimen.question}
oneMore: ${specimen.oneMoreTitle} — ${specimen.oneMoreBody}`
      : "";

    const completion = await openai.chat.completions.create({
      model: COACH_MODEL,
      messages: [
        {
          role: "system",
          content: `You write the daily studies for a one-man theological university — Reformed and confessional (Westminster posture), historically serious, warmly taught. The student is a working adult reading the ESV.

HARD RULES:
- Never quote any commentary, confession, or author unless that text appears in THE LIBRARY below; cite it via citations[] with its exact key. If the library has nothing relevant, write in your own words and leave citations empty. NEVER invent or paraphrase-as-quote.
- Scripture: reference freely by ref, but do NOT reproduce verse text — the app fetches the ESV text itself from the pullRef you give.
- oneMoreBody is a dated, factual church-history vignette. No invented quotations, no legends stated as fact.
- The unit's days must walk its assigned text/theme in order and cover it completely; the final day may synthesize. Topical or history units still anchor EVERY day to a Scripture reading (readingRef) — church history is taught with the Bible open.
- suggested[]: 2-4 per day, each a single verse INSIDE that day's reading, category exactly one of: God · Promise & Covenant · Command · Sin & Consequence · Christ · Context.
- estMinutes: honest total (reading + study), typically 10-15.
- Hard texts are read whole and faced squarely — never sanitized, never skipped.

THE LIBRARY (the only quotable sources):
${sourceList}

${specimenBlock}`,
        },
        {
          role: "user",
          content: `Term ${term.orderIndex}: "${term.title}" — ${term.rationale}

Write unit ${week} of ${term.weeks}: "${row.label}" · assigned text/theme: ${row.ref}${row.hard ? " · THIS IS THE HARD-TEXT UNIT — the commitment is to read it whole, in context, with the confessions at hand." : ""}

Produce exactly ${nDays} days (dayIndex 1-${nDays}).`,
        },
      ],
      max_completion_tokens: 9000,
      response_format: {
        type: "json_schema",
        json_schema: { name: "week_studies", strict: true, schema: WEEK_SCHEMA as unknown as Record<string, unknown> },
      },
    });
    recordAIUsage({
      surface: "spirit-generate",
      model: COACH_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = JSON.parse(raw) as {
      days: {
        dayIndex: number;
        title: string;
        body: string;
        pullRef: string;
        contextBlock: string;
        doctrine: string;
        practice: string;
        question: string;
        oneMoreTitle: string;
        oneMoreBody: string;
        readingRef: string;
        readingLabel: string;
        estMinutes: number;
        citations: { label: string; sourceKey: string }[];
        suggested: { ref: string; category: string }[];
      }[];
    };

    const validKeys = new Set(sources.map((s) => s.key));
    let created = 0;

    for (const d of parsed.days) {
      const dayIndex = Math.round(d.dayIndex);
      if (dayIndex < 1 || dayIndex > nDays || have.has(dayIndex)) continue;

      // The pull verse's TEXT comes from the ESV API — retrieval, never
      // model recall. If the fetch fails the card simply doesn't render.
      let pullText: string | null = null;
      let pullRef: string | null = d.pullRef ?? null;
      if (pullRef) {
        try {
          const p = await getPassage(pullRef, { pin: true });
          const t = p.verses
            .map((v) => (v.lines ? v.lines.join(" ") : v.text))
            .join(" ")
            .trim();
          pullText = t || null;
          if (!pullText) pullRef = null;
        } catch {
          pullRef = null;
        }
      }

      const suggested = (d.suggested ?? [])
        .map((s) => ({ refInt: parseVerseRef(s.ref), category: s.category }))
        .filter(
          (s): s is { refInt: number; category: string } =>
            s.refInt !== null && CATEGORIES.has(s.category),
        )
        .slice(0, 4);

      const citations = (d.citations ?? []).filter((c) => validKeys.has(c.sourceKey));

      await prisma.devotionalDay.create({
        data: {
          termId: term.id,
          weekIndex: week,
          dayIndex,
          title: d.title,
          body: d.body,
          pullRef,
          pullText,
          contextBlock: d.contextBlock,
          doctrine: d.doctrine,
          practice: d.practice,
          question: d.question,
          oneMoreTitle: d.oneMoreTitle,
          oneMoreBody: d.oneMoreBody,
          readingRef: d.readingRef,
          readingLabel: d.readingLabel,
          estMinutes: Math.min(30, Math.max(8, Math.round(d.estMinutes))),
          citations,
          suggested,
        },
      });
      created += 1;
    }

    // Stamp the term when every week is full.
    const total = await prisma.devotionalDay.count({ where: { termId: term.id } });
    if (total >= syllabusTarget(term.syllabus, term.weeks) && !term.generatedAt) {
      await prisma.term.update({
        where: { id: term.id },
        data: { generatedAt: new Date() },
      });
    }

    return NextResponse.json({
      week,
      created,
      total,
      tokens: {
        in: completion.usage?.prompt_tokens ?? 0,
        out: completion.usage?.completion_tokens ?? 0,
      },
    });
  } catch (error) {
    console.error("Spirit generate error:", error);
    return NextResponse.json({ error: "Generation failed — tap to retry the week" }, { status: 500 });
  }
}
