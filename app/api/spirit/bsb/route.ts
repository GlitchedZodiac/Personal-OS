import { NextRequest, NextResponse } from "next/server";
import { BOOK_USFM } from "@/lib/bible-refs";
import { parseReadingRef } from "@/lib/spirit-refs";

// BSB (public domain, CC0) verses for a reference — the second column of the
// compare worksheet (09c). Same keyless service Track 2 reads; if it is down
// the worksheet says so and nothing else breaks.

const BSB_BASE = "https://bible.helloao.org/api/BSB";

interface BsbContentItem {
  type?: string;
  number?: number;
  content?: (string | { text?: string; poem?: number; noteId?: number })[];
}

function flatten(item: BsbContentItem): string {
  const parts: string[] = [];
  for (const c of item.content ?? []) {
    if (typeof c === "string") parts.push(c);
    else if (c && typeof c.text === "string") parts.push(c.text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const segs = parseReadingRef(q);
    if (!segs.length) return NextResponse.json({ error: "Unparseable reference" }, { status: 400 });
    const seg = segs[0];
    const verses: { verse: number; text: string }[] = [];
    for (const chapter of seg.chapters.slice(0, 3)) {
      const res = await fetch(`${BSB_BASE}/${BOOK_USFM[seg.book - 1]}/${chapter}.json`, { next: { revalidate: 60 * 60 * 24 * 30 } });
      if (!res.ok) return NextResponse.json({ error: `BSB unavailable (${res.status})` }, { status: 502 });
      const data = (await res.json()) as { chapter: { content: BsbContentItem[] } };
      const from = chapter === seg.startChapter ? seg.startVerse ?? 1 : 1;
      const to = chapter === seg.endChapter ? seg.endVerse ?? 999 : 999;
      for (const item of data.chapter.content) {
        if (item.type === "verse" && typeof item.number === "number" && item.number >= from && item.number <= to) {
          verses.push({ verse: item.number, text: flatten(item) });
        }
      }
    }
    return NextResponse.json({ label: seg.label, verses });
  } catch (error) {
    console.error("Spirit BSB error:", error);
    return NextResponse.json({ error: "BSB unavailable" }, { status: 502 });
  }
}
