// References inside recognized handwriting — "Ro 8 28", "Gal 3:1–5",
// "Heb 11:32" — resolved to canonical ints through the curriculum's own
// parser so a live link on the page and a ref in the closing card agree.

import { parseReadingRef, type RefSegment } from "@/lib/spirit-refs";
import { formatRef } from "@/lib/bible-refs";

export interface FoundRef {
  raw: string;
  label: string;
  refStart: number;
  refEnd: number;
  segment: RefSegment;
}

const BOOK_TOKEN =
  "(?:[1-3]\\s?)?(?:[A-Za-z]{2,}\\.?)(?:\\s+(?:of\\s+)?[A-Za-z]+)?";
// "Ro 8 28", "Rom 8:28", "Gal 3:1-5", "1 Co 7 1-7", "Heb 11:32", "Ps 23"
const REF_RE = new RegExp(
  `\\b(${BOOK_TOKEN})\\s+(\\d{1,3})(?:\\s*[:.]\\s*|\\s+)(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?\\b`,
  "g",
);
const CHAPTER_RE = new RegExp(`\\b(${BOOK_TOKEN})\\s+(\\d{1,3})\\b(?![:.\\d])`, "g");

const STOP = new Set(["of", "the", "and", "in", "to", "a", "on", "at", "by", "for", "so", "is", "it", "he", "we", "me", "or", "no", "as", "an", "be", "if", "up", "us", "do", "am", "p", "pp", "v", "vv", "wk", "ch"]);

export function findReferences(text: string): FoundRef[] {
  const out: FoundRef[] = [];
  const seen = new Set<string>();
  const tryAdd = (raw: string, normalized: string) => {
    const segs = parseReadingRef(normalized);
    if (!segs.length) return;
    const seg = segs[0];
    if (seg.startVerse !== null && seg.startVerse > 176) return;
    const key = `${seg.refStart}-${seg.refEnd}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ raw, label: seg.label, refStart: seg.refStart, refEnd: seg.refEnd, segment: seg });
  };
  for (const m of text.matchAll(REF_RE)) {
    const book = m[1].replace(/\./g, "").trim();
    if (STOP.has(book.toLowerCase())) continue;
    const normalized = `${book} ${m[2]}:${m[3]}${m[4] ? `-${m[4]}` : ""}`;
    tryAdd(m[0], normalized);
  }
  for (const m of text.matchAll(CHAPTER_RE)) {
    const book = m[1].replace(/\./g, "").trim();
    if (STOP.has(book.toLowerCase()) || book.length < 3) continue;
    tryAdd(m[0], `${book} ${m[2]}`);
  }
  return out;
}

export function refLabel(start: number, end = start): string {
  return formatRef(start, end);
}
