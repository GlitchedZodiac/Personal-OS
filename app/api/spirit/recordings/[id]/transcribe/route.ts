import { NextRequest, NextResponse } from "next/server";
import { transcribeRecording } from "@/lib/transcribe-segments";

// Transcribe a few segments per call; the client polls until "ready".

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { maxSegments?: number };
    const result = await transcribeRecording(id, { maxSegments: body.maxSegments ?? 6 });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      status: result.recording.status,
      done: result.done,
      total: result.total,
      finished: result.finished,
      lineCount: Array.isArray(result.recording.transcript) ? result.recording.transcript.length : 0,
    });
  } catch (error) {
    console.error("Spirit recording transcribe error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
