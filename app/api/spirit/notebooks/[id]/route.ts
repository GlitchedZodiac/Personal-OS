import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One notebook: its page list (thumbnails, dates, passage, recording dot) and its settings.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const notebook = await prisma.spiritNotebook.findUnique({ where: { id } });
    if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const pages = await prisma.inkPage.findMany({
      where: { deletedAt: null, notebookId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, kind: true, title: true, subtitle: true, dayId: true, seriesId: true, weekIndex: true,
        refStart: true, refEnd: true, thumbnail: true, recordingId: true, transcribedAt: true, status: true,
        strokeCount: true, createdAt: true, updatedAt: true,
      },
    });
    const recIds = pages.map((p) => p.recordingId).filter((x): x is string => Boolean(x));
    const recs = recIds.length
      ? await prisma.recording.findMany({ where: { id: { in: recIds } }, select: { id: true, durationSec: true, status: true } })
      : [];
    return NextResponse.json({
      notebook,
      pages: pages.map((p) => ({ ...p, recording: recs.find((r) => r.id === p.recordingId) ?? null })),
    });
  } catch (error) {
    console.error("Spirit notebook error:", error);
    return NextResponse.json({ error: "Failed to load notebook" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { title?: string; inkLang?: string; audioLang?: string; accent?: string; archived?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.inkLang === "string") data.inkLang = body.inkLang;
    if (typeof body.audioLang === "string") data.audioLang = body.audioLang;
    if (typeof body.accent === "string") data.accent = body.accent;
    if (typeof body.archived === "boolean") data.archivedAt = body.archived ? new Date() : null;
    const nb = await prisma.spiritNotebook.update({ where: { id }, data });
    return NextResponse.json({ notebook: nb });
  } catch (error) {
    console.error("Spirit notebook update error:", error);
    return NextResponse.json({ error: "Failed to update notebook" }, { status: 500 });
  }
}
