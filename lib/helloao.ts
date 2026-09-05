// bible.helloao.org → the Reader's PassageModel.
//
// The app has talked to this service since Track 2 (BSB) — keyless, limitless, open
// corpus — but that route emits its own block shape, not the Reader's model, and it
// never minted refInts. This module closes that gap so KJV / WEB / RVR-1909 / BSB
// can stand wherever the ESV stands: same verse anchors, so his highlights, notes
// and overlay ink carry across translations untouched (that is what refInt is FOR —
// lib/bible-refs.ts). Versification differences (Psalm superscriptions, a few late
// NT verses) can misalign single verses between traditions; the ints stay honest to
// whatever the source text numbers them.
//
// prisma-free on purpose, like esv-transform.ts, so the transform is unit-testable.

import { BOOKS, BOOK_ABBREV, BOOK_USFM, refInt } from "@/lib/bible-refs";
import { parseReadingRef, CHAPTER_END } from "@/lib/spirit-refs";
import type { PassageModel, VerseSegment } from "@/lib/esv-transform";

const BASE = "https://bible.helloao.org/api";

interface HelloaoContentPart {
  text?: string;
  poem?: number;
  noteId?: number;
}
interface HelloaoItem {
  type?: string;
  number?: number;
  content?: (string | HelloaoContentPart)[];
}
export interface HelloaoChapter {
  chapter: { content: HelloaoItem[] };
}

/**
 * A verse's content is a run of plain strings and {text, poem} parts. Poetry arrives
 * as one part per LINE (poem = indent level); the Reader's poetry branch wants those
 * as `lines[]`, hanging-indented — the same treatment the ESV's <br> lines get.
 */
function verseParts(item: HelloaoItem): { text: string; lines: string[] | null } {
  const lines: string[] = [];
  let current: string[] = [];
  let sawPoem = false;
  const push = () => {
    // the KJV source carries pilcrows (¶) as paragraph furniture — print artifacts, not text —
    // and they arrive both as bare strings and inside {text} parts, so strip at assembly
    const t = current.join(" ").replace(/¶/g, " ").replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
    current = [];
  };
  for (const c of item.content ?? []) {
    if (typeof c === "string") {
      current.push(c);
    } else if (c && typeof c.text === "string") {
      if (typeof c.poem === "number") {
        // each poem part is its own line
        push();
        sawPoem = true;
        current.push(c.text);
        push();
      } else {
        current.push(c.text);
      }
    }
  }
  push();
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return { text, lines: sawPoem && lines.length > 1 ? lines : null };
}

/** Pure transform: one fetched chapter JSON → the Reader's model, optionally windowed to a verse range. */
export function transformHelloaoChapter(
  queryKey: string,
  data: HelloaoChapter,
  ref: { book: number; chapter: number; fromVerse: number | null; toVerse: number | null },
): PassageModel {
  const verses: VerseSegment[] = [];
  let pendingHeading: string | undefined;
  let pendingPsalmTitle: string | undefined;

  for (const item of data.chapter.content) {
    if (item.type === "heading") {
      pendingHeading = verseParts(item).text || undefined;
    } else if (item.type === "hebrew_subtitle") {
      pendingPsalmTitle = verseParts(item).text || undefined;
    } else if (item.type === "verse" && typeof item.number === "number") {
      const n = item.number;
      if (ref.fromVerse !== null && n < ref.fromVerse) {
        // a heading right before the window still belongs to its verse
        pendingHeading = undefined;
        pendingPsalmTitle = undefined;
        continue;
      }
      if (ref.toVerse !== null && ref.toVerse !== CHAPTER_END && n > ref.toVerse) break;
      const { text, lines } = verseParts(item);
      if (!text) continue;
      verses.push({
        refInt: refInt(ref.book, ref.chapter, n),
        verseNum: n,
        text,
        ...(lines ? { lines } : {}),
        ...(pendingHeading ? { heading: pendingHeading } : {}),
        ...(pendingPsalmTitle ? { psalmTitle: pendingPsalmTitle } : {}),
        crossrefs: [],
        footnotes: [],
      });
      pendingHeading = undefined;
      pendingPsalmTitle = undefined;
    }
  }

  const whole = ref.fromVerse === null;
  const canonical = whole
    ? `${BOOKS[ref.book - 1]} ${ref.chapter}`
    : `${BOOKS[ref.book - 1]} ${ref.chapter}:${ref.fromVerse}${
        ref.toVerse && ref.toVerse !== ref.fromVerse && ref.toVerse !== CHAPTER_END ? `–${ref.toVerse}` : ""
      }`;
  return { queryKey, canonical, audioUrl: null, verses };
}

/** Resolve a human query ("John 3", "eph 2:6", "ps 119:9-16") to the chapter to fetch + the verse window. */
export function resolveHelloaoRef(q: string): { book: number; chapter: number; fromVerse: number | null; toVerse: number | null } | null {
  const segs = parseReadingRef(q);
  const s = segs[0];
  if (!s) return null;
  return {
    book: s.book,
    chapter: s.startChapter,
    fromVerse: s.startVerse,
    toVerse: s.startVerse === null ? null : s.endChapter === s.startChapter ? s.endVerse : CHAPTER_END,
  };
}

export async function fetchHelloaoChapterRaw(helloaoId: string, book: number, chapter: number): Promise<HelloaoChapter> {
  const res = await fetch(`${BASE}/${helloaoId}/${BOOK_USFM[book - 1]}/${chapter}.json`, {
    // scripture text is immutable — let the platform cache it hard
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) throw new Error(`helloao fetch failed (${res.status}) for ${helloaoId} ${BOOK_ABBREV[book - 1]} ${chapter}`);
  return (await res.json()) as HelloaoChapter;
}
