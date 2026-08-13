import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOOKS, CHAPTERS, refParts } from "@/lib/bible-refs";

// GET — the free-reading navigator's data: all 66 books with HIS layer
// density (marks = highlights + notes per book, and which chapters
// carry them), so the Bible browser doubles as a review shelf.

export async function GET() {
  try {
    const [highlights, notes] = await Promise.all([
      prisma.highlight.findMany({ select: { refStart: true } }),
      prisma.spiritNote.findMany({ select: { refStart: true } }),
    ]);

    const marksByBook = new Map<number, number>();
    const chaptersByBook = new Map<number, Set<number>>();
    for (const r of [...highlights, ...notes]) {
      const p = refParts(r.refStart);
      marksByBook.set(p.book, (marksByBook.get(p.book) ?? 0) + 1);
      const set = chaptersByBook.get(p.book) ?? new Set<number>();
      set.add(p.chapter);
      chaptersByBook.set(p.book, set);
    }

    return NextResponse.json({
      books: BOOKS.map((name, i) => ({
        book: i + 1,
        name,
        chapters: CHAPTERS[i],
        marks: marksByBook.get(i + 1) ?? 0,
        markedChapters: [...(chaptersByBook.get(i + 1) ?? [])].sort((a, b) => a - b),
      })),
    });
  } catch (error) {
    console.error("Spirit bible error:", error);
    return NextResponse.json({ error: "Failed to load the shelf" }, { status: 500 });
  }
}
