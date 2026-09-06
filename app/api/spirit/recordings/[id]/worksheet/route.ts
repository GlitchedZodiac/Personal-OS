import { NextRequest, NextResponse } from "next/server";
import { createRecordingWorksheet } from "@/lib/spirit-recording-actions";

// AI writes 4-6 reinforcement questions from the sermon and a worksheet page
// lands in the Worksheets notebook — prompts he answers in ink.

export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await createRecordingWorksheet(id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Spirit recording worksheet error:", error);
    return NextResponse.json({ error: "Couldn't create the worksheet" }, { status: 500 });
  }
}
