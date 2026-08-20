import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOOK_ABBREV, CHAPTERS, refParts } from "@/lib/bible-refs";
import { parseReadingRef } from "@/lib/spirit-refs";

// GET — the lifetime coverage map, computed purely from ReadingLog
// (nothing fabricated: an unread Bible shows 66 honest "not yet" cells)
// plus completed terms. A book counts as read-through once only when
// every chapter has been covered at least once — the design ramp is
// not yet / once / twice / 3+.

export async function GET() {
  try {
    const [logs, terms, activeTerm] = await Promise.all([
      prisma.readingLog.findMany({ select: { refStart: true, refEnd: true } }),
      prisma.term.findMany({
        where: { status: "completed" },
        orderBy: { orderIndex: "desc" },
        select: { title: true, kick: true, startedAt: true, summary: true },
      }),
      prisma.term.findFirst({ where: { status: "active" }, select: { syllabus: true } }),
    ]);

    // Times each chapter was covered per book; read-throughs = the
    // minimum across the whole book, chaptersRead = distinct coverage.
    const coverByBook = new Map<number, Map<number, number>>();
    for (const log of logs) {
      const a = refParts(log.refStart);
      const b = refParts(log.refEnd);
      for (let book = a.book; book <= b.book; book++) {
        const startCh = book === a.book ? a.chapter : 1;
        const endCh = book === b.book ? b.chapter : CHAPTERS[book - 1] ?? 150;
        const map = coverByBook.get(book) ?? new Map<number, number>();
        for (let c = startCh; c <= endCh; c++) map.set(c, (map.get(c) ?? 0) + 1);
        coverByBook.set(book, map);
      }
    }
    const readThroughs = (book: number) => {
      const cover = coverByBook.get(book);
      const total = CHAPTERS[book - 1];
      if (!cover || cover.size < total) return 0;
      let min = Infinity;
      for (let c = 1; c <= total; c++) min = Math.min(min, cover.get(c) ?? 0);
      return Number.isFinite(min) ? min : 0;
    };

    // Books the active term touches (its syllabus refs) — "this term".
    const termBooks = new Set<number>();
    const syllabus = Array.isArray(activeTerm?.syllabus) ? activeTerm.syllabus : [];
    for (const row of syllabus as { ref?: string }[]) {
      // Units carry real refs — "Psalm 23; Proverbs 22:6" names two
      // books, and the old suffix-strip matched neither.
      for (const seg of parseReadingRef(row.ref ?? "")) termBooks.add(seg.book);
    }

    const books = BOOK_ABBREV.map((ab, i) => ({
      book: i + 1,
      abbrev: ab,
      chaptersRead: coverByBook.get(i + 1)?.size ?? 0,
      readThroughs: readThroughs(i + 1),
      thisTerm: termBooks.has(i + 1),
    }));

    return NextResponse.json({
      books,
      booksTouched: coverByBook.size,
      booksRead: books.filter((b) => b.readThroughs > 0).length,
      termsCompleted: terms,
    });
  } catch (error) {
    console.error("Spirit transcript error:", error);
    return NextResponse.json({ error: "Failed to load transcript" }, { status: 500 });
  }
}
