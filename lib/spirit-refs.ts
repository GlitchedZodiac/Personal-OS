import { BOOKS, CHAPTERS, refInt } from "@/lib/bible-refs";

// Reading-reference parsing for the term's assignments.
//
// WHY THIS EXISTS (2026-08-20): the study screen used
// `readingRef.split(/[-–,]/)[0]` to decide what the Reader should open.
// On "1 Corinthians 7:1-7" that yields "1 Corinthians 7:1" — a single
// verse — so the assignment opened on verse 1 alone, the reading log
// recorded one verse as a whole assignment, and the boundary of the
// assignment was never shown. He read past it into chapters 8 and 9
// hunting for where it ended.
//
// The curriculum's refs are richer than one range: "Psalm 23; Proverbs
// 22:6", "Matthew 2:13-18; Hosea 11:1-4", "Judges 4-5", and
// continuation forms that inherit the book ("1 Corinthians 7:1; 1:10-17").
// Every one of those shapes is parsed here, once, and both the Reader
// and the reading log read the result.

export interface RefSegment {
  /** 1-based canonical book number. */
  book: number;
  bookName: string;
  startChapter: number;
  /** null = the whole chapter is assigned. */
  startVerse: number | null;
  endChapter: number;
  /** null = through the end of endChapter. */
  endVerse: number | null;
  /** Chapters this segment touches, in order. */
  chapters: number[];
  /** What the Reader loads for the first chapter — full chapter, always. */
  chapterQuery: string;
  /** "1 Corinthians 7:1–7" — unambiguous, en-dashed. */
  label: string;
  /** Canonical int of the first assigned verse. */
  refStart: number;
  /** Canonical int of the last assigned verse; chapter-end uses the 999 sentinel. */
  refEnd: number;
  /** Verses assigned, when both ends are verse-precise. */
  verseCount: number | null;
}

/** Upper-bound sentinel for "through the end of the chapter". */
export const CHAPTER_END = 999;

const ALIASES: Record<string, string> = {
  psalms: "Psalm",
  psalm: "Psalm",
  "song of songs": "Song of Solomon",
  canticles: "Song of Solomon",
  "song of sol": "Song of Solomon",
  revelations: "Revelation",
  "acts of the apostles": "Acts",
};

function normalizeBookText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^i{1,3}(?=\s)/, (m) => String(m.length))
    .replace(/^(1st|2nd|3rd)\b/, (m) => m[0])
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a book name or prefix to its 1-based canonical number, or 0. */
export function bookNumberFromName(raw: string): number {
  const name = normalizeBookText(raw);
  if (!name) return 0;
  const aliased = ALIASES[name] ?? null;
  if (aliased) return BOOKS.indexOf(aliased as (typeof BOOKS)[number]) + 1;

  const lower = BOOKS.map((b) => b.toLowerCase());
  const exact = lower.indexOf(name);
  if (exact >= 0) return exact + 1;

  // Prefix match — "1 Cor", "Rev", "Prov". A leading digit must agree so
  // "1 John" never matches "2 John".
  const digit = /^(\d)\s/.exec(name)?.[1] ?? null;
  const candidates = lower
    .map((b, i) => ({ b, n: i + 1 }))
    .filter(({ b }) => (digit ? b.startsWith(`${digit} `) : !/^\d/.test(b)))
    .filter(({ b }) => b.startsWith(name) || name.startsWith(b.slice(0, 4)));
  if (candidates.length === 1) return candidates[0].n;
  const starts = candidates.filter(({ b }) => b.startsWith(name));
  return starts.length === 1 ? starts[0].n : 0;
}

function clampChapter(book: number, chapter: number): number {
  const max = CHAPTERS[book - 1] ?? 1;
  return Math.min(Math.max(1, chapter), max);
}

function buildSegment(
  book: number,
  startChapter: number,
  startVerse: number | null,
  endChapter: number,
  endVerse: number | null,
): RefSegment {
  const bookName = BOOKS[book - 1] ?? `Book ${book}`;
  const sc = clampChapter(book, startChapter);
  const ec = clampChapter(book, Math.max(endChapter, sc));
  const chapters: number[] = [];
  for (let c = sc; c <= ec; c++) chapters.push(c);

  const wholeStart = startVerse === null;
  const wholeEnd = endVerse === null;
  const sv = startVerse ?? 1;

  let label: string;
  if (wholeStart && wholeEnd) {
    label = sc === ec ? `${bookName} ${sc}` : `${bookName} ${sc}–${ec}`;
  } else if (sc === ec) {
    label =
      sv === endVerse || endVerse === null
        ? `${bookName} ${sc}:${sv}${endVerse === null ? "–end" : ""}`
        : `${bookName} ${sc}:${sv}–${endVerse}`;
  } else {
    label = `${bookName} ${sc}:${sv}–${ec}:${wholeEnd ? "end" : endVerse}`;
  }

  const verseCount =
    !wholeStart && !wholeEnd && sc === ec ? Math.max(1, (endVerse as number) - sv + 1) : null;

  return {
    book,
    bookName,
    startChapter: sc,
    startVerse,
    endChapter: ec,
    endVerse,
    chapters,
    chapterQuery: `${bookName} ${sc}`,
    label,
    refStart: refInt(book, sc, sv),
    refEnd: refInt(book, ec, endVerse ?? CHAPTER_END),
    verseCount,
  };
}

/**
 * Parse a curriculum readingRef into its segments.
 *
 * Handles: "Judges 4", "Judges 4-5", "Romans 9:1-5", "1 Cor 7:1–7",
 * "Psalm 23; Proverbs 22:6", "Matthew 2:13-18; Hosea 11:1-4",
 * "1 Corinthians 7:1; 1:10-17" (book inherited), and whole books
 * ("Philemon"). Unparseable fragments are skipped rather than guessed.
 */
export function parseReadingRef(raw: string): RefSegment[] {
  if (!raw || typeof raw !== "string") return [];
  const cleaned = raw
    .replace(/[‒-―]/g, "-")
    .replace(/ /g, " ")
    .trim();
  const out: RefSegment[] = [];
  let lastBook = 0;

  for (const part of cleaned.split(/\s*[;,]\s*/)) {
    const piece = part.trim();
    if (!piece) continue;

    // Split leading book name from the numeric tail.
    const m = /^((?:[1-3]|i{1,3}|1st|2nd|3rd)?\s*[A-Za-z][A-Za-z\s.']*?)\s*(\d.*)?$/.exec(piece);
    let book = lastBook;
    let tail = piece;
    if (m && m[1] && m[1].trim()) {
      const resolved = bookNumberFromName(m[1]);
      if (resolved) {
        book = resolved;
        tail = (m[2] ?? "").trim();
      }
    }
    if (!book) continue;
    lastBook = book;

    // Whole book — "Philemon", "Jude".
    if (!tail) {
      out.push(buildSegment(book, 1, null, CHAPTERS[book - 1] ?? 1, null));
      continue;
    }

    const range = /^(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+):)?(\d+))?$/.exec(tail.replace(/\s+/g, ""));
    if (!range) continue;
    const startChapter = Number(range[1]);
    const startVerse = range[2] ? Number(range[2]) : null;
    const hasRange = range[4] !== undefined;
    const rangeChapter = range[3] ? Number(range[3]) : null;
    const rangeTail = hasRange ? Number(range[4]) : null;

    let endChapter = startChapter;
    let endVerse: number | null = startVerse;

    if (hasRange) {
      if (rangeChapter !== null) {
        // "7:1-8:4" — explicit cross-chapter range.
        endChapter = rangeChapter;
        endVerse = rangeTail;
      } else if (startVerse !== null) {
        // "7:1-7" — verses inside the chapter.
        endVerse = rangeTail;
      } else {
        // "4-5" — whole chapters.
        endChapter = rangeTail as number;
        endVerse = null;
      }
    }

    out.push(buildSegment(book, startChapter, startVerse, endChapter, endVerse));
  }

  return out;
}

/** The whole assignment as one canonical span (for logging one reading). */
export function readingSpan(segments: RefSegment[]): { refStart: number; refEnd: number } | null {
  if (!segments.length) return null;
  return {
    refStart: Math.min(...segments.map((s) => s.refStart)),
    refEnd: Math.max(...segments.map((s) => s.refEnd)),
  };
}

/**
 * What is assigned inside one chapter of a segment — the bracket the
 * Reader draws. `to === null` means "through the end of the chapter".
 */
export function assignedInChapter(
  seg: RefSegment,
  chapter: number,
): { from: number; to: number | null } | null {
  if (chapter < seg.startChapter || chapter > seg.endChapter) return null;
  const from = chapter === seg.startChapter ? seg.startVerse ?? 1 : 1;
  const to = chapter === seg.endChapter ? seg.endVerse : null;
  return { from, to };
}

/** "7 verses" / "2 chapters" — the scope line under the assignment. */
export function scopeLabel(segments: RefSegment[]): string {
  if (!segments.length) return "";
  const verses = segments.reduce<number | null>((sum, s) => {
    if (sum === null || s.verseCount === null) return null;
    return sum + s.verseCount;
  }, 0);
  if (verses !== null && verses > 0) {
    return `${verses} verse${verses === 1 ? "" : "s"}`;
  }
  const chapters = segments.reduce((sum, s) => sum + s.chapters.length, 0);
  return `${chapters} chapter${chapters === 1 ? "" : "s"}`;
}

/** The full assignment, en-dashed and unambiguous: "1 Corinthians 7:1–7". */
export function assignmentLabel(segments: RefSegment[]): string {
  return segments.map((s) => s.label).join(" · ");
}
