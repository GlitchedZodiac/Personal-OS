import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSystemNotebooks, worksheetTemplate, studyTemplate, json, refsFromLabel, canonicalPage } from "@/lib/spirit-notebooks";
import { parseReadingRef, assignmentLabel } from "@/lib/spirit-refs";

// Worksheets (09) and the per-study notebook page (03/04). Submit is a
// real state machine: open → submitted → reopened → submitted again; the
// homework ticks only on Submit (his Q19), never on leaving the page.

async function dayBundle(dayId: string) {
  const day = await prisma.devotionalDay.findUnique({ where: { id: dayId } });
  if (!day) return null;
  const term = await prisma.term.findUnique({ where: { id: day.termId } });
  const ordered = await prisma.devotionalDay.findMany({ where: { termId: day.termId }, orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }], select: { id: true } });
  const studyNumber = ordered.findIndex((d) => d.id === dayId) + 1 || null;
  const segs = parseReadingRef(day.readingRef);
  return { day, term, studyNumber, readingLabel: segs.length ? assignmentLabel(segs) : day.readingRef, segs };
}

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const dayId = sp.get("dayId");
    const kind = sp.get("kind") ?? "worksheet";
    if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
    const page = await prisma.inkPage.findFirst({ where: { kind, dayId } });
    return NextResponse.json({ page });
  } catch (error) {
    console.error("Spirit worksheet error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "open");

    if (action === "open" || action === "study") {
      const dayId = String(body.dayId ?? "");
      const bundle = await dayBundle(dayId);
      if (!bundle || !bundle.term) return NextResponse.json({ error: "No such study" }, { status: 404 });
      const kind = action === "study" ? "study" : "worksheet";
      let page = await prisma.inkPage.findFirst({ where: { kind, dayId } });
      if (!page) {
        const nbs = await ensureSystemNotebooks();
        const refs = refsFromLabel(bundle.readingLabel);
        const homework = (bundle.day.homework ?? null) as { kind?: string; label?: string; minutes?: number; text?: string } | null;
        if (kind === "worksheet") {
          const t = worksheetTemplate({
            kind: homework?.kind ?? "write",
            homework,
            writtenPrompt: bundle.day.writtenPrompt,
            termIndex: bundle.term.orderIndex,
            studyNumber: bundle.studyNumber,
            readingLabel: bundle.readingLabel,
            title: bundle.day.title,
          });
          page = await prisma.inkPage.create({
            data: {
              notebookId: nbs.worksheets.id,
              kind,
              dayId,
              title: `${(homework?.label ?? homework?.kind ?? "Worksheet")} — ${bundle.day.title}`,
              subtitle: `Term ${bundle.term.orderIndex} · study ${bundle.studyNumber ?? "?"}`,
              refStart: refs.refStart,
              refEnd: refs.refEnd,
              background: t.background,
              objects: json(t.objects),
              strokes: json([]),
            },
          });
        } else {
          page = await prisma.inkPage.create({
            data: {
              notebookId: nbs.term?.id ?? nbs.free.id,
              kind,
              dayId,
              title: bundle.day.title,
              subtitle: `Term ${bundle.term.orderIndex} · study ${bundle.studyNumber ?? "?"} · wk ${bundle.day.weekIndex}`,
              refStart: refs.refStart,
              refEnd: refs.refEnd,
              background: "dots",
              objects: json(
                studyTemplate({
                  termIndex: bundle.term.orderIndex,
                  termTitle: bundle.term.title,
                  studyNumber: bundle.studyNumber,
                  weekIndex: bundle.day.weekIndex,
                  title: bundle.day.title,
                  readingLabels: bundle.segs.map((s) => s.label),
                  aim: bundle.day.aim,
                }),
              ),
              strokes: json([]),
            },
          });
        }
      }
      page = await canonicalPage({ kind, dayId }, page);
      return NextResponse.json({
        page,
        day: { id: bundle.day.id, title: bundle.day.title, homework: bundle.day.homework, writtenPrompt: bundle.day.writtenPrompt, question: bundle.day.question, readingLabel: bundle.readingLabel },
        term: bundle.term ? { orderIndex: bundle.term.orderIndex, title: bundle.term.title } : null,
        studyNumber: bundle.studyNumber,
      });
    }

    if (action === "submit" || action === "reopen") {
      const pageId = String(body.pageId ?? "");
      const page = await prisma.inkPage.findUnique({ where: { id: pageId } });
      if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (action === "submit") {
        const saved = await prisma.inkPage.update({
          where: { id: pageId },
          data: { status: "submitted", submittedAt: new Date(), editedAfterSubmit: page.status === "reopened" ? true : page.editedAfterSubmit },
        });
        if (page.dayId) {
          await prisma.homeworkCheck.upsert({ where: { dayId: page.dayId }, create: { dayId: page.dayId }, update: { doneAt: new Date() } });
        }
        return NextResponse.json({ page: { ...saved, strokes: undefined } });
      }
      const saved = await prisma.inkPage.update({ where: { id: pageId }, data: { status: "reopened", reopenedAt: new Date() } });
      return NextResponse.json({ page: { ...saved, strokes: undefined } });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Spirit worksheet action error:", error);
    return NextResponse.json({ error: "Worksheet action failed" }, { status: 500 });
  }
}
