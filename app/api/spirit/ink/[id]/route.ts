import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/spirit-notebooks";
import type { Stroke, PageObject } from "@/lib/ink";

// One page. PATCH accepts either a full `strokes` array or deltas
// (`appendStrokes` + `removeStrokeIds`) so autosave during a sermon sends
// only what changed; the server merges and recounts.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const page = await prisma.inkPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [recording, notebook] = await Promise.all([
      page.recordingId ? prisma.recording.findUnique({ where: { id: page.recordingId }, select: { id: true, durationSec: true, status: true, title: true, transcript: true, startedAt: true } }) : null,
      page.notebookId ? prisma.spiritNotebook.findUnique({ where: { id: page.notebookId } }) : null,
    ]);
    return NextResponse.json({ page, recording, notebook });
  } catch (error) {
    console.error("Spirit ink page error:", error);
    return NextResponse.json({ error: "Failed to load page" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const page = await prisma.inkPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let strokes = (Array.isArray(page.strokes) ? page.strokes : []) as unknown as Stroke[];
    let touchedInk = false;
    if (Array.isArray(body.strokes)) {
      strokes = body.strokes as Stroke[];
      touchedInk = true;
    } else {
      if (Array.isArray(body.removeStrokeIds) && body.removeStrokeIds.length) {
        const rm = new Set(body.removeStrokeIds as string[]);
        strokes = strokes.filter((s) => !rm.has(s.id));
        touchedInk = true;
      }
      if (Array.isArray(body.appendStrokes) && body.appendStrokes.length) {
        const have = new Set(strokes.map((s) => s.id));
        for (const s of body.appendStrokes as Stroke[]) if (!have.has(s.id)) strokes.push(s);
        touchedInk = true;
      }
      if (Array.isArray(body.replaceStrokes) && body.replaceStrokes.length) {
        const byId = new Map((body.replaceStrokes as Stroke[]).map((s) => [s.id, s]));
        strokes = strokes.map((s) => byId.get(s.id) ?? s);
        touchedInk = true;
      }
    }
    const data: Record<string, unknown> = {};
    if (touchedInk) {
      data.strokes = json(strokes);
      data.strokeCount = strokes.length;
    }
    if (Array.isArray(body.objects)) {
      data.objects = json(body.objects as PageObject[]);
      // the page's refs follow its reference cards (plus whatever recognition kept)
      if (!Array.isArray(body.refs)) {
        const cardRefs = (body.objects as PageObject[])
          .filter((o) => o && o.type === "refcard" && typeof (o.data as { refStart?: unknown })?.refStart === "number")
          .map((o) => (o.data as { refStart: number }).refStart);
        const keep = (Array.isArray(page.refs) ? (page.refs as unknown[]) : []).filter((r): r is number => typeof r === "number");
        data.refs = json(Array.from(new Set([...keep, ...cardRefs])).sort((a, b) => a - b));
      }
    }
    for (const k of ["title", "subtitle", "thumbnail", "textLayer", "background", "layerKey", "notebookId", "recordingId"] as const) {
      if (k in body && (typeof body[k] === "string" || body[k] === null)) data[k] = body[k];
    }
    if ("layout" in body) data.layout = body.layout ? json(body.layout) : null;
    if (Array.isArray(body.refs)) data.refs = json(body.refs);
    if (typeof body.refStart === "number") data.refStart = body.refStart;
    if (typeof body.refEnd === "number") data.refEnd = body.refEnd;
    if (body.transcribedNow === true) data.transcribedAt = new Date();
    // Writing after a submit: the record says "submitted, then edited".
    if ((touchedInk || Array.isArray(body.objects)) && page.status === "submitted") {
      data.status = "reopened";
      data.reopenedAt = new Date();
      data.editedAfterSubmit = true;
    }
    const saved = await prisma.inkPage.update({ where: { id }, data });
    return NextResponse.json({ page: { ...saved, strokes: undefined }, strokeCount: saved.strokeCount, updatedAt: saved.updatedAt });
  } catch (error) {
    console.error("Spirit ink update error:", error);
    return NextResponse.json({ error: "Failed to save page" }, { status: 500 });
  }
}

/** put a page back (the Undo on the delete toast, and the trash list) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "restore") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const page = await prisma.inkPage.update({ where: { id }, data: { deletedAt: null } });
    return NextResponse.json({ page });
  } catch (error) {
    console.error("Spirit ink restore error:", error);
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const purge = new URL(_req.url).searchParams.get("purge") === "1";
    if (purge) {
      await prisma.inkPage.delete({ where: { id } });
      return NextResponse.json({ deleted: true, purged: true });
    }
    // soft: the page rests in the trash so a mis-tap is never the end of a page of ink
    await prisma.inkPage.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ deleted: true, restorable: true });
  } catch (error) {
    console.error("Spirit ink delete error:", error);
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 });
  }
}
