import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

// GET - personal records for the watch (bearer device-session auth).
// Same payload shape as /api/health/prs so ios/Shared/PRBaselines.swift can
// consume either; requested in deferred-items [watch] 2026-08-09.
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const exercise = searchParams.get("exercise");
    const where = exercise ? { exercise } : {};

    const [records, recent] = await Promise.all([
      prisma.personalRecord.findMany({
        where,
        orderBy: [{ exercise: "asc" }, { kind: "asc" }],
      }),
      prisma.personalRecord.findMany({
        where,
        orderBy: { achievedAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({ records, recent });
  } catch (error) {
    console.error("Mobile PRs fetch error:", error);
    return NextResponse.json({ error: "Failed to load PRs" }, { status: 500 });
  }
}
