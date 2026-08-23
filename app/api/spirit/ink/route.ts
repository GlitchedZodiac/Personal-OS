import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSystemNotebooks, json, refsFromLabel } from "@/lib/spirit-notebooks";

// Ink pages — list (light) and create. Full pages live at /api/spirit/ink/[id].
// An overlay is a page of kind "overlay" keyed by chapter + layer.

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const where: Record<string, unknown> = {};
    // the trash is hidden unless asked for (?trash=1)
    where.deletedAt = new URL(request.url).searchParams.get("trash") === "1" ? { not: null } : null;
    const notebookId = sp.get("notebookId");
    const kind = sp.get("kind");
    const dayId = sp.get("dayId");
    const seriesId = sp.get("seriesId");
    const weekIndex = sp.get("weekIndex");
    const chapterKey = sp.get("chapterKey");
    const layerKey = sp.get("layerKey");
    if (notebookId) where.notebookId = notebookId;
    if (kind) where.kind = kind;
    if (dayId) where.dayId = dayId;
    if (seriesId) where.seriesId = seriesId;
    if (weekIndex) where.weekIndex = Number(weekIndex);
    if (chapterKey) where.chapterKey = Number(chapterKey);
    if (layerKey) where.layerKey = layerKey;
    const full = sp.get("full") === "1";
    const pages = await prisma.inkPage.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: Number(sp.get("take") ?? 60),
      ...(full
        ? {}
        : {
            select: {
              id: true, notebookId: true, kind: true, title: true, subtitle: true, dayId: true, seriesId: true, weekIndex: true,
              refStart: true, refEnd: true, chapterKey: true, layerKey: true, thumbnail: true, recordingId: true,
              transcribedAt: true, status: true, strokeCount: true, createdAt: true, updatedAt: true, submittedAt: true,
            },
          }),
    });
    return NextResponse.json({ pages });
  } catch (error) {
    console.error("Spirit ink list error:", error);
    return NextResponse.json({ error: "Failed to load pages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const kind = String(body.kind ?? "free");
    let notebookId = typeof body.notebookId === "string" ? body.notebookId : null;
    if (!notebookId && kind !== "overlay") {
      const nbs = await ensureSystemNotebooks();
      notebookId = (kind === "sermon" ? nbs.sermons : kind === "worksheet" ? nbs.worksheets : kind === "study" ? nbs.term ?? nbs.free : nbs.free)?.id ?? null;
    }
    const label = typeof body.refLabel === "string" ? body.refLabel : null;
    const refs = refsFromLabel(label);
    const page = await prisma.inkPage.create({
      data: {
        notebookId,
        kind,
        title: String(body.title ?? ""),
        subtitle: typeof body.subtitle === "string" ? body.subtitle : null,
        dayId: typeof body.dayId === "string" ? body.dayId : null,
        seriesId: typeof body.seriesId === "string" ? body.seriesId : null,
        weekIndex: typeof body.weekIndex === "number" ? body.weekIndex : null,
        refStart: typeof body.refStart === "number" ? body.refStart : refs.refStart,
        refEnd: typeof body.refEnd === "number" ? body.refEnd : refs.refEnd,
        chapterKey: typeof body.chapterKey === "number" ? body.chapterKey : null,
        layerKey: typeof body.layerKey === "string" ? body.layerKey : null,
        background: typeof body.background === "string" ? body.background : kind === "overlay" ? "paper" : "dots",
        objects: json(Array.isArray(body.objects) ? body.objects : []),
        strokes: json([]),
        layout: body.layout ? json(body.layout) : undefined,
      },
    });
    return NextResponse.json({ page });
  } catch (error) {
    console.error("Spirit ink create error:", error);
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
  }
}
