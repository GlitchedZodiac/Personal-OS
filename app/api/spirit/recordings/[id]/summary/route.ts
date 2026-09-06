import { NextRequest, NextResponse } from "next/server";
import { summarizeRecording } from "@/lib/spirit-recording-actions";

// One metered call, on a button (or over MCP): the transcript becomes the
// stored summary. ?force=1 regenerates; otherwise an existing summary returns.

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const force = new URL(request.url).searchParams.get("force") === "1";
    const result = await summarizeRecording(id, { force });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Spirit recording summary error:", error);
    return NextResponse.json({ error: "Couldn't summarize the recording" }, { status: 500 });
  }
}
