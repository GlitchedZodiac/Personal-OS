import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AUDIO_TYPE = /^audio\/[a-z0-9.+-]+(\s*;.*)?$/i;
const MAX_SEGMENT_BYTES = 10_000_000; // ~2 min at 64 kbps is ~1 MB; Vercel caps at ~4.5 MB

// One ~2-minute audio segment, raw body. Headers carry its place in the
// recording. Idempotent on (recording, index) so a retried upload never
// doubles the audio.

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Bounds (audit 2026-10, SEC-030): the recorder sends its MediaRecorder
    // audio type and ~2 minutes of audio. The type is stored and served back
    // as Content-Type, so only audio types are accepted — an uploaded
    // text/html "segment" was served same-origin.
    const index = Number(request.headers.get("x-seg-index") ?? "0");
    const startSec = Number(request.headers.get("x-seg-start") ?? "0");
    const durationSec = Number(request.headers.get("x-seg-duration") ?? "0");
    if (!Number.isInteger(index) || index < 0 || index > 10_000 || !Number.isFinite(startSec) || !Number.isFinite(durationSec) || startSec < 0 || durationSec < 0) {
      return NextResponse.json({ error: "bad segment position" }, { status: 400 });
    }
    const mimeType = (request.headers.get("content-type") || "audio/mp4").trim();
    if (!AUDIO_TYPE.test(mimeType) || mimeType.length > 100) {
      return NextResponse.json({ error: "segments must be audio" }, { status: 415 });
    }
    const declared = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_SEGMENT_BYTES) {
      return NextResponse.json({ error: "segment too large" }, { status: 413 });
    }
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.length < 200) return NextResponse.json({ error: "empty segment" }, { status: 400 });
    if (buf.length > MAX_SEGMENT_BYTES) return NextResponse.json({ error: "segment too large" }, { status: 413 });
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.recordingSegment.upsert({
      where: { recordingId_index: { recordingId: id, index } },
      create: { recordingId: id, index, startSec, durationSec, mimeType, bytes: buf },
      update: { startSec, durationSec, mimeType, bytes: buf },
    });
    const agg = await prisma.recordingSegment.findMany({ where: { recordingId: id }, select: { startSec: true, durationSec: true } });
    const end = agg.reduce((m, s) => Math.max(m, s.startSec + s.durationSec), 0);
    const saved = await prisma.recording.update({
      where: { id },
      data: { durationSec: end, sizeBytes: { increment: buf.length }, mimeType, status: rec.status === "recording" ? "recording" : rec.status },
    });
    return NextResponse.json({ ok: true, index, durationSec: saved.durationSec });
  } catch (error) {
    console.error("Spirit segment upload error:", error);
    return NextResponse.json({ error: "Failed to store segment" }, { status: 500 });
  }
}
