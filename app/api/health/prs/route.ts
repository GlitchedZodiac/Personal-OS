import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - personal records: current bests per exercise + recent achievements.
// Consumed by the web app and (read-only) by the watch app for PR haptics.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exercise = searchParams.get("exercise");

    const where = exercise ? { exercise } : {};
    const records = await prisma.personalRecord.findMany({
      where,
      orderBy: [{ exercise: "asc" }, { kind: "asc" }],
    });

    const recent = await prisma.personalRecord.findMany({
      where,
      orderBy: { achievedAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ records, recent });
  } catch (error) {
    console.error("PRs fetch error:", error);
    return NextResponse.json({ error: "Failed to load PRs" }, { status: 500 });
  }
}
