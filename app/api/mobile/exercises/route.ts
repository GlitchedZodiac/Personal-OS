import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

// GET - user-minted movements for the watch (bearer auth). The watch merges
// these into its bundled catalog so its picker and normalizer stay in sync
// with movements the AI mints mid-chat (docs/watch-contract.md § exercises).
// `updatedAt` (max across rows, null when none) lets the watch skip unchanged
// payloads cheaply.
export async function GET(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.userExercise.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        slug: true,
        name: true,
        category: true,
        aliases: true,
        updatedAt: true,
      },
    });

    const latest = rows.reduce<Date | null>(
      (max, r) => (max && max > r.updatedAt ? max : r.updatedAt),
      null
    );

    return NextResponse.json({
      exercises: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        category: r.category,
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
        updatedAt: r.updatedAt.toISOString(),
      })),
      updatedAt: latest ? latest.toISOString() : null,
    });
  } catch (error) {
    console.error("Mobile exercises error:", error);
    return NextResponse.json({ error: "Failed to load exercises" }, { status: 500 });
  }
}
