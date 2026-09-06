import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { entriesOk } from "@/lib/spirit-comments";

// V3 §1 — comment threads on scripture. GET returns every live thread in a
// refInt range (one chapter is `from=BBCCC001&to=BBCCC999`); POST creates a
// thread with its first entry. Entries are the thread's whole content and are
// replaced atomically by PATCH on [id] — single user, small threads, no merge
// problem worth building for.

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const from = Number(sp.get("from"));
    const to = Number(sp.get("to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      return NextResponse.json({ error: "from/to refInts required" }, { status: 400 });
    }
    const comments = await prisma.spiritComment.findMany({
      where: { deletedAt: null, refStart: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Spirit comments list error:", error);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      refStart?: number; refEnd?: number | null;
      wordStart?: number | null; wordEnd?: number | null; anchorText?: string | null;
      markKind?: string | null; markStrokeIds?: string[] | null;
      entries?: unknown;
    };
    if (typeof body.refStart !== "number" || body.refStart < 1_001_001) {
      return NextResponse.json({ error: "refStart required" }, { status: 400 });
    }
    if (!entriesOk(body.entries)) return NextResponse.json({ error: "entries invalid" }, { status: 400 });
    const comment = await prisma.spiritComment.create({
      data: {
        refStart: body.refStart,
        refEnd: typeof body.refEnd === "number" ? body.refEnd : null,
        wordStart: typeof body.wordStart === "number" ? body.wordStart : null,
        wordEnd: typeof body.wordEnd === "number" ? body.wordEnd : null,
        anchorText: typeof body.anchorText === "string" ? body.anchorText.slice(0, 400) : null,
        markKind: body.markKind === "circle" || body.markKind === "underline" ? body.markKind : null,
        markStrokeIds: Array.isArray(body.markStrokeIds) ? body.markStrokeIds.filter((x) => typeof x === "string") : undefined,
        entries: body.entries as object[],
      },
    });
    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Spirit comment create error:", error);
    return NextResponse.json({ error: "Failed to save the comment" }, { status: 500 });
  }
}
