import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  BOOKS,
  BOOK_USFM,
  TOTAL_CHAPTERS,
  chapterAt,
  refInt,
} from "@/lib/bible-refs";

// Track 2 — the whole Bible, quietly, in the Berean Standard Bible
// (public domain, CC0 — no cache cap, no license ceiling). It runs
// beside the term and never counts against him; marking a chapter
// logs honest coverage on the Transcript like any other reading.
// Text served by bible.helloao.org (free, keyless). If that service
// ever disappears, this page says so honestly and nothing else breaks.

const BSB_BASE = "https://bible.helloao.org/api/BSB";

interface BsbContentItem {
  type?: string;
  number?: number;
  content?: (string | { text?: string; poem?: number; noteId?: number })[];
}

function flattenVerse(item: BsbContentItem): { text: string; poem: boolean } {
  const parts: string[] = [];
  let poem = false;
  for (const c of item.content ?? []) {
    if (typeof c === "string") parts.push(c);
    else if (c && typeof c.text === "string") {
      parts.push(c.text);
      if (c.poem) poem = true;
    }
  }
  return { text: parts.join(" ").replace(/\s+/g, " ").trim(), poem };
}

async function fetchBsbChapter(book: number, chapter: number) {
  const res = await fetch(`${BSB_BASE}/${BOOK_USFM[book - 1]}/${chapter}.json`, {
    // Scripture text is immutable — let the platform cache it hard.
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) throw new Error(`BSB fetch failed (${res.status})`);
  const data = (await res.json()) as {
    chapter: { content: BsbContentItem[] };
  };
  const blocks: (
    | { kind: "heading"; text: string }
    | { kind: "subtitle"; text: string }
    | { kind: "verse"; number: number; text: string; poem: boolean }
  )[] = [];
  for (const item of data.chapter.content) {
    if (item.type === "heading") {
      blocks.push({ kind: "heading", text: flattenVerse(item).text });
    } else if (item.type === "hebrew_subtitle") {
      blocks.push({ kind: "subtitle", text: flattenVerse(item).text });
    } else if (item.type === "verse" && typeof item.number === "number") {
      const { text, poem } = flattenVerse(item);
      if (text) blocks.push({ kind: "verse", number: item.number, text, poem });
    }
  }
  return blocks;
}

export async function GET(request: NextRequest) {
  try {
    const prefs = await prisma.spiritPref.findUnique({ where: { id: "main" } });
    const position = Math.min(prefs?.track2Position ?? 0, TOTAL_CHAPTERS);
    const done = position >= TOTAL_CHAPTERS;
    const next = done ? null : chapterAt(position);
    const label = next ? `${BOOKS[next.book - 1]} ${next.chapter}` : null;

    const payload: Record<string, unknown> = {
      position,
      total: TOTAL_CHAPTERS,
      done,
      next: next ? { ...next, label } : null,
    };

    if (request.nextUrl.searchParams.get("text") === "1" && next) {
      try {
        payload.blocks = await fetchBsbChapter(next.book, next.chapter);
        payload.attribution = "Berean Standard Bible · public domain (CC0) · berean.bible";
      } catch (e) {
        payload.textError =
          "The free Bible service didn't answer — the track keeps your place; try again in a moment.";
        console.error("BSB fetch error:", e);
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Track 2 error:", error);
    return NextResponse.json({ error: "Failed to load Track 2" }, { status: 500 });
  }
}

// POST — the open chapter is read. Logs honest coverage and advances.
export async function POST() {
  try {
    const prefs = await prisma.spiritPref.upsert({
      where: { id: "main" },
      create: { id: "main" },
      update: {},
    });
    const position = Math.min(prefs.track2Position ?? 0, TOTAL_CHAPTERS);
    if (position >= TOTAL_CHAPTERS) {
      return NextResponse.json({ position, total: TOTAL_CHAPTERS, done: true, next: null });
    }
    const cur = chapterAt(position)!;
    await prisma.$transaction([
      prisma.readingLog.create({
        data: {
          refStart: refInt(cur.book, cur.chapter, 1),
          refEnd: refInt(cur.book, cur.chapter, 1),
          label: `${BOOKS[cur.book - 1]} ${cur.chapter} · Track 2`,
          medium: "app",
          track: "track2",
        },
      }),
      prisma.spiritPref.update({
        where: { id: "main" },
        data: { track2Position: position + 1 },
      }),
    ]);
    const nextPos = position + 1;
    const next = nextPos >= TOTAL_CHAPTERS ? null : chapterAt(nextPos);
    return NextResponse.json({
      position: nextPos,
      total: TOTAL_CHAPTERS,
      done: nextPos >= TOTAL_CHAPTERS,
      next: next ? { ...next, label: `${BOOKS[next.book - 1]} ${next.chapter}` } : null,
    });
  } catch (error) {
    console.error("Track 2 advance error:", error);
    return NextResponse.json({ error: "Failed to mark the chapter" }, { status: 500 });
  }
}
