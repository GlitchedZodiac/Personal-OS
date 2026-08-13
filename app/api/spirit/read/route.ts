import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — log a reading (app or PAPER; paper counts or the transcript
// lies). DELETE ?dayId= — unmark the day.

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      refStart?: number;
      refEnd?: number;
      label?: string;
      medium?: string;
      track?: string;
      dayId?: string;
    };
    const refStart = Number(body.refStart);
    const refEnd = Number(body.refEnd ?? body.refStart);
    if (!Number.isInteger(refStart)) {
      return NextResponse.json({ error: "refStart required" }, { status: 400 });
    }
    const row = await prisma.readingLog.create({
      data: {
        refStart,
        refEnd: Number.isInteger(refEnd) ? refEnd : refStart,
        label: typeof body.label === "string" ? body.label : "",
        medium: body.medium === "paper" ? "paper" : "app",
        track: body.track === "track2" ? "track2" : body.track === "free" ? "free" : "term",
        dayId: typeof body.dayId === "string" ? body.dayId : null,
      },
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error("Spirit read error:", error);
    return NextResponse.json({ error: "Failed to log reading" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dayId = searchParams.get("dayId");
  if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
  await prisma.readingLog.deleteMany({ where: { dayId } });
  return NextResponse.json({ deleted: true });
}
