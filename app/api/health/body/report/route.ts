import { NextRequest, NextResponse } from "next/server";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";
import { saveScaleReport } from "@/lib/body-ingest";
import { MEASURED_FIELDS } from "@/lib/body-measurements";
import { CHAT_MODEL, openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import {
  type ExtractedReport,
  REPORT_PROMPT,
  REPORT_SCHEMA,
  normalizeReport,
  planReportWrite,
  readingCount,
  reportDayCandidates,
  resolveReportDay,
  reviewGroups,
} from "@/lib/scale-report";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDateStringInTimeZone } from "@/lib/timezone";
import { NEAR_KG, NEAR_MS } from "@/lib/vesync";

// A RENPHO report, uploaded from the Body screen.
//
//   POST (multipart: one PDF, or up to four images of the report)
//        → reads it and returns a PROPOSAL. Nothing is saved.
//   PUT  ({ extracted })  → saves what he confirmed.
//
// The app's rule holds here as everywhere: the model proposes, he confirms,
// then it persists. PUT does not trust the client's numbers either — it runs
// the same bounds and consistency checks again before writing.

export const maxDuration = 60;

/** Vercel caps a request body at 4.5 MB; leave room for the multipart wrapper. */
const MAX_BYTES = 4_000_000;
const MAX_IMAGES = 4;

/** His height, from the newest reading that carries both weight and BMI. */
async function heightMetres(): Promise<number | null> {
  const row = await prisma.bodyMeasurement.findFirst({
    where: { weightKg: { not: null }, bmi: { not: null } },
    orderBy: { measuredAt: "desc" },
    select: { weightKg: true, bmi: true },
  });
  return row?.weightKg && row.bmi ? Math.sqrt(row.weightKg / row.bmi) : null;
}

async function describe(extracted: ExtractedReport, timeZone: string) {
  const now = new Date();
  const today = getDateStringInTimeZone(now, timeZone);

  // "4/10/2026" is 4 October or 10 April. Ask the weigh-ins which.
  const candidates = reportDayCandidates(extracted.measuredOnPrinted);
  const draft = normalizeReport(extracted, { timeZone, day: null, now });
  const witnesses = new Set<string>();
  if (candidates.length > 1 && draft.weightKg !== null) {
    for (const day of candidates) {
      const noon = new Date(`${day}T12:00:00Z`).getTime();
      const sameDay = await prisma.bodyMeasurement.findMany({
        where: {
          measuredAt: { gte: new Date(noon - 36 * 3600_000), lte: new Date(noon + 36 * 3600_000) },
          weightKg: { gte: draft.weightKg - NEAR_KG, lte: draft.weightKg + NEAR_KG },
        },
        select: { measuredAt: true },
      });
      if (sameDay.some((r) => getDateStringInTimeZone(r.measuredAt, timeZone) === day)) witnesses.add(day);
    }
  }
  const resolved = resolveReportDay(candidates, (day) => witnesses.has(day), today);

  const reading = normalizeReport(extracted, { timeZone, heightM: await heightMetres(), day: resolved.day, now });
  if (resolved.ambiguous && resolved.day) {
    reading.warnings.push(
      `The date "${extracted.measuredOnPrinted}" could be read two ways; taken as ${resolved.day}. Check it before saving.`
    );
  }
  const at = reading.measuredAt ?? now;
  const nearby = await prisma.bodyMeasurement.findMany({
    where: {
      measuredAt: { gte: new Date(at.getTime() - 36 * 3600_000), lte: new Date(at.getTime() + 36 * 3600_000) },
      weightKg: { not: null },
    },
  });
  const plan = planReportWrite(
    reading,
    nearby.map((row) => ({
      id: row.id,
      measuredAt: row.measuredAt,
      day: getDateStringInTimeZone(row.measuredAt, timeZone),
      weightKg: row.weightKg,
      values: Object.fromEntries(
        MEASURED_FIELDS.map((f) => [f, (row as unknown as Record<string, number | null>)[f]])
      ),
    })),
    NEAR_MS,
    NEAR_KG
  );
  const joins = plan.action === "join" ? nearby.find((r) => r.id === plan.rowId) : null;
  return {
    reading,
    proposal: {
      day: reading.day,
      time: reading.time,
      measuredAt: (joins?.measuredAt ?? at).toISOString(),
      count: readingCount(reading),
      groups: reviewGroups(reading),
      warnings: reading.warnings,
      match:
        plan.action === "join" && joins
          ? { kind: "join" as const, weightKg: joins.weightKg, source: joins.source, adds: plan.adds, corrects: plan.corrects }
          : { kind: "new" as const },
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: "Choose the report PDF or a screenshot of it." }, { status: 400 });
    }
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (pdfs.length + images.length !== files.length) {
      return NextResponse.json({ error: "Only a PDF or images of the report can be read." }, { status: 400 });
    }
    if (pdfs.length > 1 || (pdfs.length === 1 && images.length > 0) || images.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Send one PDF, or up to ${MAX_IMAGES} screenshots of the same report.` },
        { status: 400 }
      );
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) {
      return NextResponse.json(
        { error: "That is too large to send (4 MB). Screenshots of the report work too." },
        { status: 413 }
      );
    }

    const parts: ChatCompletionContentPart[] = [
      { type: "text", text: "Transcribe this body-composition report." },
    ];
    for (const file of files) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      if (pdfs.includes(file)) {
        parts.push({
          type: "file",
          file: { filename: file.name || "report.pdf", file_data: `data:application/pdf;base64,${base64}` },
        });
      } else {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${file.type};base64,${base64}`, detail: "high" },
        });
      }
    }

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: REPORT_PROMPT },
        { role: "user", content: parts },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "scale_report", schema: REPORT_SCHEMA, strict: true },
      },
    });
    recordAIUsage({
      surface: "photo",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: "Couldn't read the report." }, { status: 502 });
    const extracted = JSON.parse(raw) as ExtractedReport;

    const timeZone = await getUserTimeZone(new URL(request.url).searchParams.get("tz"));
    const { reading, proposal } = await describe(extracted, timeZone);
    if (!extracted.legible || readingCount(reading) < 3) {
      return NextResponse.json(
        { error: "That doesn't read as a body-composition report. Try the PDF itself, or a sharper screenshot." },
        { status: 422 }
      );
    }
    // A PDF carries its text and reads exactly; a picture is read by eye.
    return NextResponse.json({ extracted, proposal: { ...proposal, fromImage: pdfs.length === 0 } });
  } catch (error) {
    console.error("Scale report read error:", error);
    const { kind, userMessage } = classifyOpenAIError(error);
    return NextResponse.json(
      { error: kind === "unknown" ? "Couldn't read that report. Try again, or send screenshots." : userMessage, kind },
      { status: kind === "unknown" ? 500 : 502 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const extracted = body?.extracted as ExtractedReport | undefined;
    if (!extracted || typeof extracted !== "object" || !extracted.segments || !extracted.impedance) {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }
    const timeZone = await getUserTimeZone(new URL(request.url).searchParams.get("tz"));
    const { reading } = await describe(extracted, timeZone);
    if (reading.weightKg === null || readingCount(reading) < 3) {
      return NextResponse.json({ error: "The report's weight could not be read, so it cannot be saved." }, { status: 422 });
    }
    const saved = await saveScaleReport(reading, { timeZone });
    return NextResponse.json({ saved: { ...saved, measuredAt: saved.measuredAt.toISOString() } });
  } catch (error) {
    console.error("Scale report save error:", error);
    return NextResponse.json({ error: "Failed to save the report" }, { status: 500 });
  }
}
