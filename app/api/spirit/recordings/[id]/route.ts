import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const segments = await prisma.recordingSegment.findMany({
      where: { recordingId: id },
      orderBy: { index: "asc" },
      select: { index: true, startSec: true, durationSec: true, mimeType: true, transcribedAt: true },
    });
    const page = rec.pageId ? await prisma.inkPage.findUnique({ where: { id: rec.pageId }, select: { id: true, title: true, subtitle: true, kind: true, thumbnail: true, strokes: true, objects: true, refStart: true, refEnd: true } }) : null;
    return NextResponse.json({ recording: rec, segments, page });
  } catch (error) {
    console.error("Spirit recording error:", error);
    return NextResponse.json({ error: "Failed to load recording" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const k of ["title", "label", "preacher", "passageRef", "status", "retention"] as const) {
      if (typeof body[k] === "string") data[k] = body[k];
    }
    if (typeof body.durationSec === "number") data.durationSec = body.durationSec;
    if (body.deleteAudio === true) {
      await prisma.recordingSegment.deleteMany({ where: { recordingId: id } });
      data.status = "audio_deleted";
      data.sizeBytes = 0;
    }
    const rec = await prisma.recording.update({ where: { id }, data });
    return NextResponse.json({ recording: rec });
  } catch (error) {
    console.error("Spirit recording update error:", error);
    return NextResponse.json({ error: "Failed to update recording" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ deleted: true });
    // Only sever a link that actually points AT THIS recording. Matching on rec.pageId alone
    // severed the page from whatever recording it currently held — which, after a re-record,
    // is a different and perfectly good one.
    if (rec.pageId) await prisma.inkPage.updateMany({ where: { id: rec.pageId, recordingId: id }, data: { recordingId: null } });
    await prisma.recording.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Spirit recording delete error:", error);
    return NextResponse.json({ error: "Failed to delete recording" }, { status: 500 });
  }
}
