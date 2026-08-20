import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, COACH_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { getPassage } from "@/lib/esv";
import { BOOKS, syllabusTarget, unitDays } from "@/lib/bible-refs";
import { STYLE_SPECIMEN } from "@/lib/spirit-style-specimen";

// The term batch — when a term is announced its studies are written
// ONCE, as a visible batch he watches, never a nightly shimmer. One
// call per unit writes that unit's studies. Scripture quotations are
// fetched from the ESV API afterward (never model-recalled);
// commentary/confession quotes are forbidden unless the source is
// stored in his library.
//
// v3 adds the HOMEWORK engine (curriculum lane's spec): exactly one
// homework item per study drawn from the unit's kinds, never two of a
// kind back-to-back, ≤20 minutes, and the REQUIRED callback — every
// study opens by naming the previous study's homework before teaching.

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
          aim: { type: "string", description: "THE AIM — one sentence, second person, naming what this study is FOR: what he should be able to see or do by the end. Concrete, never 'reflect deeply'. e.g. 'Spot the question Paul is answering before you decide what the answer means to you.'" },
          body: { type: "string", description: "the teaching, 110-170 words, warm lecturer. MUST open with one line naming the previous study's homework before teaching anything." },
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
          homework: {
            type: "object",
            description: "exactly ONE homework item for this study",
            properties: {
              kind: { type: "string", description: "one of the unit's allowed homework kinds ONLY" },
              text: { type: "string", description: "the assignment, concrete and floored — never open-ended, never requiring a purchase or leaving the house; 'write' never exceeds one paragraph" },
              minutes: { type: "number", description: "honest estimate, hard cap 20" },
            },
            required: ["kind", "text", "minutes"],
            additionalProperties: false,
          },
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
          "dayIndex", "title", "aim", "body", "pullRef", "contextBlock", "doctrine",
          "practice", "question", "oneMoreTitle", "oneMoreBody", "readingRef",
          "readingLabel", "estMinutes", "homework", "citations", "suggested",
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

interface HomeworkKindDef {
  label?: string;
  minutes?: string;
  description?: string;
  targetShare?: number;
  gatedFrom?: number;
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
      homework?: string[];
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

    const [sources, config, allTerms, prevInTerm, prevTerm] = await Promise.all([
      prisma.sourceDoc.findMany({ select: { key: true, title: true, body: true } }),
      prisma.spiritCurriculumConfig.findUnique({ where: { id: "main" } }),
      prisma.term.findMany({
        orderBy: { orderIndex: "asc" },
        select: { orderIndex: true, title: true, kick: true },
      }),
      week > 1
        ? prisma.devotionalDay.findFirst({
            where: { termId: term.id, weekIndex: week - 1 },
            orderBy: { dayIndex: "desc" },
            select: { title: true, homework: true },
          })
        : Promise.resolve(null),
      week === 1 && term.orderIndex > 1
        ? prisma.term.findFirst({ where: { orderIndex: term.orderIndex - 1 } })
        : Promise.resolve(null),
    ]);
    if (!config) {
      return NextResponse.json(
        { error: "Curriculum config missing — run the importer first" },
        { status: 500 },
      );
    }
    const homeworkKinds = (config.homeworkKinds ?? {}) as Record<string, HomeworkKindDef>;
    const generatorRules = (Array.isArray(config.generatorRules) ? config.generatorRules : []) as string[];

    // The previous study — the REQUIRED callback target. Unit 1 of a
    // term reaches back to the previous term's final study.
    let prevStudy: { title: string; homework: unknown } | null = prevInTerm;
    if (!prevStudy && prevTerm) {
      prevStudy = await prisma.devotionalDay.findFirst({
        where: { termId: prevTerm.id },
        orderBy: [{ weekIndex: "desc" }, { dayIndex: "desc" }],
        select: { title: true, homework: true },
      });
    }
    const prevHw = prevStudy?.homework as { kind?: string; text?: string } | null | undefined;

    // Allowed kinds for this unit — the ask gate strips "ask" before
    // the configured orderIndex (default 13); an emptied list falls
    // back to "sit" per the spec.
    const askGate = homeworkKinds.ask?.gatedFrom ?? 13;
    let allowedKinds = (row.homework ?? ["sit"]).filter(
      (k) => !(k === "ask" && term.orderIndex < askGate),
    );
    if (allowedKinds.length === 0) allowedKinds = ["sit"];

    const kindsBlock = allowedKinds
      .map((k) => {
        const def = homeworkKinds[k] ?? {};
        return `- "${k}" (${def.label ?? k} · ${def.minutes ?? "?"} min): ${def.description ?? ""}`;
      })
      .join("\n");

    const spiralBlock = allTerms
      .map((t) => `T${t.orderIndex} ${t.title}`)
      .join(" · ");

    const sourceList = sources
      .map((s) => `- key "${s.key}": ${s.title}\n  ${s.body.slice(0, 500)}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: COACH_MODEL,
      messages: [
        {
          role: "system",
          content: `You write the daily studies for a one-man theological university — Reformed and confessional (Westminster posture), historically serious, warmly taught. The student is a working adult in Cali, Colombia reading the ESV.

HARD RULES:
- Never quote any commentary, confession, or author unless that text appears in THE LIBRARY below; cite it via citations[] with its exact key. If the library has nothing relevant, write in your own words and leave citations empty. NEVER invent or paraphrase-as-quote.
- Scripture: reference freely by ref, but do NOT reproduce verse text — the app fetches the ESV text itself from the pullRef you give.
- oneMoreBody is a dated, factual church-history vignette. No invented quotations, no legends stated as fact.
- The unit's days must walk its assigned text/theme in order and cover it completely; the final day may synthesize. Topical or history units still anchor EVERY day to a Scripture reading (readingRef) — church history is taught with the Bible open.
- suggested[]: 2-4 per day, each a single verse INSIDE that day's reading, category exactly one of: God · Promise & Covenant · Command · Sin & Consequence · Christ · Context.
- estMinutes: honest total (reading + study), typically 10-15.
- Hard texts are read whole and faced squarely — never sanitized, never skipped.
- Rationales and term text given to you are canonical — never contradict them.

THE HOMEWORK ENGINE (curriculum rules, verbatim):
${generatorRules.map((r) => `- ${r}`).join("\n")}

This unit's ALLOWED homework kinds (use ONLY these):
${kindsBlock}

THE CALLBACK (required): every study's body OPENS with one line naming the previous study's homework before teaching anything. ${
            prevHw?.text
              ? `The study immediately before day 1 of this unit was "${prevStudy?.title}" with homework (${prevHw.kind}): "${prevHw.text}" — day 1's body must open from it, and its homework kind must NOT be "${prevHw.kind}".`
              : `This unit's day 1 is the first study of the entire curriculum — open it by setting the term's practice instead of a callback.`
          } Within the unit, each day N opens from day N-1's homework, and never repeats day N-1's homework kind.

THE SPIRAL: the full curriculum, for natural back-references when this unit revisits earlier ground ("you mapped this in Term N"): ${spiralBlock}

THE LIBRARY (the only quotable sources):
${sourceList}

${STYLE_SPECIMEN}`,
        },
        {
          role: "user",
          content: `Term ${term.orderIndex}: "${term.title}" (${term.kick}) — ${term.rationale}${
            term.homeworkArc
              ? `\n\nTHE TERM'S RUNNING ASSIGNMENT (homeworkArc — weave it in; homework items may serve it but the arc is daily and cumulative): ${term.homeworkArc}`
              : ""
          }${term.hardNote ? `\n\nHARD NOTE (canonical): ${term.hardNote}` : ""}

Write unit ${week} of ${term.weeks}: "${row.label}" · assigned text/theme: ${row.ref}${row.hard ? " · THIS IS A HARD-TEXT UNIT — the commitment is to read it whole, in context, with the confessions at hand." : ""}

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
        aim?: string;
        readingRef: string;
        readingLabel: string;
        estMinutes: number;
        homework: { kind: string; text: string; minutes: number };
        citations: { label: string; sourceKey: string }[];
        suggested: { ref: string; category: string }[];
      }[];
    };

    const validKeys = new Set(sources.map((s) => s.key));
    let created = 0;
    let lastKind: string | null = (prevHw?.kind as string) ?? null;

    for (const d of parsed.days.sort((a, b) => a.dayIndex - b.dayIndex)) {
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

      // Homework validation: kind must be allowed AND differ from the
      // previous study's kind; minutes hard-capped at 20.
      let hwKind = d.homework?.kind ?? allowedKinds[0];
      if (!allowedKinds.includes(hwKind) || hwKind === lastKind) {
        hwKind = allowedKinds.find((k) => k !== lastKind) ?? allowedKinds[0];
      }
      const homework = {
        kind: hwKind,
        label: homeworkKinds[hwKind]?.label ?? hwKind,
        minutes: Math.min(20, Math.max(1, Math.round(d.homework?.minutes ?? 10))),
        text: d.homework?.text ?? "",
      };
      lastKind = hwKind;

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
          aim: d.aim ?? null,
          readingRef: d.readingRef,
          readingLabel: d.readingLabel,
          estMinutes: Math.min(30, Math.max(8, Math.round(d.estMinutes))),
          citations,
          suggested,
          homework,
        },
      });
      created += 1;
    }

    // Stamp the term when every unit is full.
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
