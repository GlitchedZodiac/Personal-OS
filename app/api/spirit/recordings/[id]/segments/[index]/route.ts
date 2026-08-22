import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The audio bytes for one segment — the replay player seeks segment by segment.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await params;
    const seg = await prisma.recordingSegment.findUnique({ where: { recordingId_index: { recordingId: id, index: Number(index) } } });
    if (!seg) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const src = seg.bytes as unknown as Uint8Array;
    const ab = new ArrayBuffer(src.byteLength);
    new Uint8Array(ab).set(src);
    const body = ab;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": seg.mimeType || "audio/mp4",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=86400",
        "Accept-Ranges": "none",
      },
    });
  } catch (error) {
    console.error("Spirit segment fetch error:", error);
    return NextResponse.json({ error: "Failed to load audio" }, { status: 500 });
  }
}
