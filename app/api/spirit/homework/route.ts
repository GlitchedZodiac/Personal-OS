import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { carriedHomework } from "@/lib/spirit-homework";

// The homework outlives its study. GET returns whatever is currently
// being carried (the most recent completed study's homework, until it
// is ticked); POST/DELETE tick and untick it.
//
// Not a chore list: an uncarried item is never overdue and never
// nags twice. The evening reminder names it once.

export async function GET() {
  try {
    return NextResponse.json({ carrying: await carriedHomework() });
  } catch (error) {
    console.error("Spirit homework error:", error);
    return NextResponse.json({ error: "Failed to load homework" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dayId } = (await request.json()) as { dayId?: string };
    if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
    const row = await prisma.homeworkCheck.upsert({
      where: { dayId },
      create: { dayId },
      update: { doneAt: new Date() },
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error("Spirit homework check error:", error);
    return NextResponse.json({ error: "Failed to record homework" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const dayId = new URL(request.url).searchParams.get("dayId");
  if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
  await prisma.homeworkCheck.deleteMany({ where: { dayId } });
  return NextResponse.json({ deleted: true });
}
