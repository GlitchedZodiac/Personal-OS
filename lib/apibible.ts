// scripture.api.bible (American Bible Society) — the licensed lane, built for RVR60.
//
// Dormant until two env vars exist: API_BIBLE_KEY (his Starter-plan key) and
// API_BIBLE_RVR60_ID (the bibleId shown on his account after selecting RVR60 as one
// of the plan's licensed Bibles). The Starter tier is strictly non-commercial,
// 5,000 calls/MONTH — which is why every response is cached server-side — and its
// terms require caches cleared within 14 days (enforced in passage-service) plus a
// FUMS view call per render (the token rides the model to the client).
//
// Text is requested as plain text with bracketed verse numbers rather than their
// JSON block format: one stable format to parse, no guessing at block variants.

import { BOOKS, BOOK_USFM, refInt } from "@/lib/bible-refs";
import { CHAPTER_END } from "@/lib/spirit-refs";
import { resolveHelloaoRef } from "@/lib/helloao";
import type { PassageModel, VerseSegment } from "@/lib/esv-transform";

const BASE = "https://api.scripture.api.bible/v1";

export interface ApiBibleEnvelope {
  /** the raw content string as fetched — cached and re-parsed per read */
  content: string;
  fumsToken: string | null;
  canonical: string;
}

export async function fetchApiBiblePassage(
  bibleId: string,
  q: string,
): Promise<{ envelope: ApiBibleEnvelope; ref: { book: number; chapter: number; fromVerse: number | null; toVerse: number | null } }> {
  const key = process.env.API_BIBLE_KEY;
  if (!key) throw new Error("API_BIBLE_KEY is not configured");
  const ref = resolveHelloaoRef(q);
  if (!ref) throw new Error(`Couldn't read the reference "${q}"`);
  const usfm = BOOK_USFM[ref.book - 1];
  const passageId =
    ref.fromVerse === null
      ? `${usfm}.${ref.chapter}`
      : `${usfm}.${ref.chapter}.${ref.fromVerse}` +
        (ref.toVerse && ref.toVerse !== ref.fromVerse && ref.toVerse !== CHAPTER_END ? `-${usfm}.${ref.chapter}.${ref.toVerse}` : "");
  const url = `${BASE}/bibles/${bibleId}/passages/${passageId}?content-type=text&include-verse-numbers=true&include-titles=true&include-notes=false`;
  const res = await fetch(url, { headers: { "api-key": key }, cache: "no-store" });
  if (!res.ok) throw new Error(`api.bible fetch failed (${res.status})`);
  const body = (await res.json()) as { data?: { content?: string; reference?: string }; meta?: { fumsToken?: string } };
  const content = body.data?.content ?? "";
  if (!content.trim()) throw new Error("api.bible returned an empty passage");
  return {
    envelope: { content, fumsToken: body.meta?.fumsToken ?? null, canonical: body.data?.reference ?? q },
    ref,
  };
}

/** "[1] En el principio... [2] Y la tierra..." → VerseSegments with honest refInts. */
export function transformApiBibleText(queryKey: string, envelope: ApiBibleEnvelope, ref: { book: number; chapter: number }): PassageModel {
  const verses: VerseSegment[] = [];
  const re = /\[(\d+)\]\s*([^[]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(envelope.content))) {
    const n = Number(m[1]);
    const text = m[2].replace(/\s+/g, " ").trim();
    if (!n || !text) continue;
    verses.push({ refInt: refInt(ref.book, ref.chapter, n), verseNum: n, text, crossrefs: [], footnotes: [] });
  }
  const canonical = envelope.canonical || `${BOOKS[ref.book - 1]} ${ref.chapter}`;
  return { queryKey, canonical, audioUrl: null, verses };
}
