import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOOKS, BOOK_ABBREV, refParts } from "@/lib/bible-refs";

// GET — the lifetime coverage map, computed purely from ReadingLog
// (nothing fabricated: an unread Bible shows 66 honest "not yet" cells)
// plus completed terms.

export async function GET() {
  try {
    const [logs, terms, activeTerm] = await Promise.all([
      prisma.readingLog.findMany({ select: { refStart: true, refEnd: true } }),
      prisma.term.findMany({
        where: { status: "completed" },
        orderBy: { orderIndex: "desc" },
        select: { title: true, kick: true, startedAt: true },
      }),
      prisma.term.findFirst({ where: { status: "active" }, select: { syllabus: true } }),
    ]);

    // Distinct read chapters per book → a book "read count" approximated
    // as full traversals is dishonest; v0 truth: chaptersRead per book.
    const chaptersByBook = new Map<number, Set<number>>();
    for (const log of logs) {
      const a = refParts(log.refStart);
      const b = refParts(log.refEnd);
      for (let book = a.book; book <= b.book; book++) {
        const startCh = book === a.book ? a.chapter : 1;
        const endCh = book === b.book ? b.chapter : 150;
        const set = chaptersByBook.get(book) ?? new Set<number>();
        for (let c = startCh; c <= endCh; c++) set.add(c);
        chaptersByBook.set(book, set);
      }
    }

    // Books the active term touches (its syllabus refs) — "this term".
    const termBooks = new Set<number>();
    const syllabus = Array.isArray(activeTerm?.syllabus) ? activeTerm.syllabus : [];
    for (const row of syllabus as { ref?: string }[]) {
      const name = row.ref?.replace(/\s+[\d:–-]+$/, "").trim().toLowerCase();
      if (!name) continue;
      const idx = BOOKS.findIndex((b) => b.toLowerCase() === name);
      if (idx >= 0) termBooks.add(idx + 1);
    }

    return NextResponse.json({
      books: BOOK_ABBREV.map((ab, i) => ({
        book: i + 1,
        abbrev: ab,
        chaptersRead: chaptersByBook.get(i + 1)?.size ?? 0,
        thisTerm: termBooks.has(i + 1),
      })),
      booksTouched: chaptersByBook.size,
      termsCompleted: terms,
    });
  } catch (error) {
    console.error("Spirit transcript error:", error);
    return NextResponse.json({ error: "Failed to load transcript" }, { status: 500 });
  }
}
