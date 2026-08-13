import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOOKS, formatRef, refParts } from "@/lib/bible-refs";

// GET — his whole layer, grouped by passage (book + chapter), newest
// activity first. Notes, highlights, links and Ask threads all anchor
// to canonical refs, so the notebook is a view, never a second store.

function chapterKey(ref: number) {
  const p = refParts(ref);
  return p.book * 1_000 + p.chapter;
}

function chapterLabel(key: number) {
  const book = BOOKS[Math.floor(key / 1_000) - 1] ?? "?";
  return `${book} ${key % 1_000}`.toUpperCase();
}

export async function GET() {
  try {
    const [notes, highlights, threads] = await Promise.all([
      prisma.spiritNote.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.highlight.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.studyThread.findMany({ orderBy: { updatedAt: "desc" } }),
    ]);

    type Item = {
      id: string;
      type: "note" | "highlight" | "ask";
      kind: string;
      category?: string;
      refLabel: string;
      body: string;
      open?: boolean;
      createdAt: string;
    };

    const groups = new Map<number, { items: Item[]; latest: number }>();
    const push = (ref: number, item: Item, at: Date) => {
      const key = chapterKey(ref);
      const g = groups.get(key) ?? { items: [], latest: 0 };
      g.items.push(item);
      g.latest = Math.max(g.latest, at.getTime());
      groups.set(key, g);
    };

    for (const n of notes) {
      push(
        n.refStart,
        {
          id: n.id,
          type: "note",
          kind: n.kind,
          refLabel: formatRef(n.refStart, n.refEnd),
          body: n.body,
          open: n.kind === "question" && !n.resolvedAt,
          createdAt: n.createdAt.toISOString(),
        },
        n.createdAt,
      );
    }
    for (const h of highlights) {
      push(
        h.refStart,
        {
          id: h.id,
          type: "highlight",
          kind: h.origin === "accepted" ? "accepted" : "highlight",
          category: h.category,
          refLabel: formatRef(h.refStart, h.refEnd),
          body: h.category,
          createdAt: h.createdAt.toISOString(),
        },
        h.createdAt,
      );
    }
    for (const t of threads) {
      const msgs = Array.isArray(t.messages) ? (t.messages as { role?: string; content?: string }[]) : [];
      const firstQ = msgs.find((m) => m.role === "user")?.content ?? "";
      if (!firstQ) continue;
      push(
        t.refStart,
        {
          id: t.id,
          type: "ask",
          kind: "ask",
          refLabel: formatRef(t.refStart, t.refEnd),
          body: firstQ,
          createdAt: t.updatedAt.toISOString(),
        },
        t.updatedAt,
      );
    }

    const openQuestions = notes
      .filter((n) => n.kind === "question" && !n.resolvedAt)
      .map((n) => ({
        id: n.id,
        q: n.body,
        refLabel: formatRef(n.refStart, n.refEnd),
        createdAt: n.createdAt.toISOString(),
      }));

    return NextResponse.json({
      total: notes.length + highlights.length + threads.length,
      noteCount: notes.length,
      groups: [...groups.entries()]
        .sort((a, b) => b[1].latest - a[1].latest)
        .map(([key, g]) => ({
          passage: chapterLabel(key),
          items: g.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        })),
      openQuestions,
    });
  } catch (error) {
    console.error("Spirit notebook error:", error);
    return NextResponse.json({ error: "Failed to load notebook" }, { status: 500 });
  }
}
