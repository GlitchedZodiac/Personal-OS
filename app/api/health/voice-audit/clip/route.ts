import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clipIdOf } from "@/lib/voice-audit";

// GET ?entryId= | ?id= — the recording behind one voice entry, so what he
// said can be played back next to what was logged. `entryId` is the id the
// entry carries in the workout's set log ("<uuid>" or "<uuid>#2").
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const id = params.get("id");
    const entryId = params.get("entryId");
    if (!id && !entryId) {
      return NextResponse.json({ error: "id or entryId required" }, { status: 400 });
    }
    const clip = await prisma.voiceClip.findFirst({
      where: id ? { id } : { entryId: clipIdOf(entryId as string) },
      orderBy: { createdAt: "desc" },
      select: { audio: { select: { mimeType: true, bytes: true } } },
    });
    if (!clip?.audio) {
      return NextResponse.json({ error: "No recording kept for this entry" }, { status: 404 });
    }
    const bytes = Buffer.from(clip.audio.bytes);
    return new NextResponse(bytes, {
      headers: {
        // The watch records AAC in an MPEG-4 container; "audio/m4a" is not a
        // type Safari will play.
        "Content-Type": /m4a|mp4|aac/i.test(clip.audio.mimeType) ? "audio/mp4" : clip.audio.mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "none",
      },
    });
  } catch (error) {
    console.error("Voice clip error:", error);
    return NextResponse.json({ error: "Failed to load the recording" }, { status: 500 });
  }
}
