import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The recordings library (06c). Audio itself is segments under [id]/segments.

export async function GET() {
  try {
    const recs = await prisma.recording.findMany({ orderBy: { startedAt: "desc" }, take: 100 });
    const pageIds = recs.map((r) => r.pageId).filter((x): x is string => Boolean(x));
    const pages = pageIds.length
      ? await prisma.inkPage.findMany({ where: { id: { in: pageIds } }, select: { id: true, title: true, kind: true, notebookId: true } })
      : [];
    return NextResponse.json({
      recordings: recs.map((r) => ({ ...r, transcript: undefined, lineCount: Array.isArray(r.transcript) ? r.transcript.length : 0, page: pages.find((p) => p.id === r.pageId) ?? null })),
    });
  } catch (error) {
    console.error("Spirit recordings error:", error);
    return NextResponse.json({ error: "Failed to load recordings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rec = await prisma.recording.create({
      data: {
        pageId: typeof body.pageId === "string" ? body.pageId : null,
        seriesId: typeof body.seriesId === "string" ? body.seriesId : null,
        weekIndex: typeof body.weekIndex === "number" ? body.weekIndex : null,
        title: String(body.title ?? "Recording"),
        label: typeof body.label === "string" ? body.label : "sermon",
        preacher: typeof body.preacher === "string" ? body.preacher : null,
        passageRef: typeof body.passageRef === "string" ? body.passageRef : null,
        lang: typeof body.lang === "string" ? body.lang : "es",
        mimeType: typeof body.mimeType === "string" ? body.mimeType : "audio/mp4",
        retention: typeof body.retention === "string" ? body.retention : "forever",
        startedAt: typeof body.startedAt === "string" ? new Date(body.startedAt) : new Date(),
      },
    });
    if (rec.pageId) {
      await prisma.inkPage.update({ where: { id: rec.pageId }, data: { recordingId: rec.id } }).catch(() => null);
    }
    return NextResponse.json({ recording: rec });
  } catch (error) {
    console.error("Spirit recording create error:", error);
    return NextResponse.json({ error: "Failed to start recording" }, { status: 500 });
  }
}
