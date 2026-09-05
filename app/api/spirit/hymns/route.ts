import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstLine } from "@/lib/hymns";

// The hymn library's list and door. GET returns LIGHT rows — no body, no photo —
// so the shelf is cheap to fetch, cache and search offline; ?q= adds a lyric
// search (title + body, case-insensitive), because the real hymn-lookup problem
// is remembering a line, not a name. ?trash=1 shows the soft-deleted. POST
// creates; the ~2.5MB photo guard matches the journal's, the only size guard in
// the app (Vercel's request ceiling is ~4.5MB).
//
// The SCREENS for all of this wait on his V3 design (his call: hymns are a port,
// not an interpretation) — but the door works today, and save_hymn over MCP lets
// him collect hymns by conversation before a single screen exists.

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const q = sp.get("q")?.trim();
    const where: Record<string, unknown> = {
      deletedAt: sp.get("trash") === "1" ? { not: null } : null,
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] }
        : {}),
    };
    const rows = await prisma.hymn.findMany({
      where,
      orderBy: { title: "asc" },
      take: Number(sp.get("take") ?? 200),
      select: { id: true, title: true, body: true, photoData: true, updatedAt: true },
    });
    const hymns = rows.map((h) => ({
      id: h.id,
      title: h.title,
      firstLine: firstLine(h.body),
      hasPhoto: Boolean(h.photoData),
      updatedAt: h.updatedAt,
    }));
    return NextResponse.json({ hymns });
  } catch (error) {
    console.error("Spirit hymns list error:", error);
    return NextResponse.json({ error: "Failed to load the hymns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { title?: string; body?: string; photoData?: string | null };
    const title = String(body.title ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "the words are required" }, { status: 400 });
    const photoData = typeof body.photoData === "string" ? body.photoData : null;
    if (photoData && photoData.length > 2_500_000) {
      return NextResponse.json({ error: "Photo too large" }, { status: 413 });
    }
    const hymn = await prisma.hymn.create({ data: { title, body: text, photoData } });
    return NextResponse.json({ hymn: { id: hymn.id, title: hymn.title } });
  } catch (error) {
    console.error("Spirit hymn create error:", error);
    return NextResponse.json({ error: "Failed to save the hymn" }, { status: 500 });
  }
}
