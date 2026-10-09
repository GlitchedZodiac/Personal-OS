import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VOICE_CLIP_FIELDS } from "@/lib/voice-audit";

// GET — the wrist voice-logging audit trail (lib/voice-audit.ts): for each
// clip, what was heard, what each parser said, what the wrist was shown and
// what became of it. `?workoutId=` narrows to one session; otherwise the most
// recent clips (`?days=`, default 14). Never returns audio — that is
// /api/health/voice-audit/clip.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workoutId = params.get("workoutId");
    const days = Math.min(Math.max(Number(params.get("days")) || 14, 1), 365);
    const clips = await prisma.voiceClip.findMany({
      where: workoutId
        ? { workoutLogId: workoutId }
        : { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { ...VOICE_CLIP_FIELDS, audio: { select: { clipId: true } } },
    });
    return NextResponse.json({
      clips: clips.map(({ audio, ...clip }) => ({ ...clip, hasAudio: audio != null })),
    });
  } catch (error) {
    console.error("Voice audit error:", error);
    return NextResponse.json({ error: "Failed to load the voice log" }, { status: 500 });
  }
}
