import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSystemNotebooks } from "@/lib/spirit-notebooks";

// The shelf (00 · 03 · 08a): system notebooks are created on first read;
// counts ride along so the shelf can say "12 pages · 1 recording".

export async function GET() {
  try {
    await ensureSystemNotebooks();
    const notebooks = await prisma.spiritNotebook.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const pages = await prisma.inkPage.findMany({
      where: { notebookId: { in: notebooks.map((n) => n.id) }, deletedAt: null },
      select: { id: true, notebookId: true, recordingId: true, kind: true, updatedAt: true },
    });
    const out = notebooks.map((n) => {
      const mine = pages.filter((p) => p.notebookId === n.id);
      return {
        ...n,
        pageCount: mine.length,
        recordingCount: mine.filter((p) => p.recordingId).length,
        lastPageAt: mine.reduce<Date | null>((a, p) => (!a || p.updatedAt > a ? p.updatedAt : a), null),
      };
    });
    return NextResponse.json({ notebooks: out });
  } catch (error) {
    console.error("Spirit notebooks error:", error);
    return NextResponse.json({ error: "Failed to load notebooks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { title?: string; accent?: string; inkLang?: string; audioLang?: string };
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const count = await prisma.spiritNotebook.count();
    const nb = await prisma.spiritNotebook.create({
      data: {
        title,
        kind: "custom",
        accent: body.accent ?? "#5E7FA6",
        inkLang: body.inkLang ?? "en",
        audioLang: body.audioLang ?? "es",
        sortOrder: 10 + count,
      },
    });
    return NextResponse.json({ notebook: nb });
  } catch (error) {
    console.error("Spirit notebook create error:", error);
    return NextResponse.json({ error: "Failed to create notebook" }, { status: 500 });
  }
}
