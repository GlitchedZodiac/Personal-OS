import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

// GET - active routines for the watch (bearer auth, read-only v1 per
// docs/watch-contract.md § Sequences). The watch runs them and logs the
// resulting workout through the normal sync, referencing sequenceId in
// metricsData.
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sequences = await prisma.sequence.findMany({
      where: { isArchived: false },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        kind: true,
        restSecondsDefault: true,
        durationMinutes: true,
        rounds: true,
        steps: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ sequences });
  } catch (error) {
    console.error("Mobile sequences error:", error);
    return NextResponse.json({ error: "Failed to load routines" }, { status: 500 });
  }
}
