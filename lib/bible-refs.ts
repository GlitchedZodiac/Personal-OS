// Canonical verse references — integers book*1e6 + chapter*1e3 + verse,
// the ESV API's own encoding (Judges 4:14 = 7004014). Pure module; the
// reason it exists is translation independence: highlights and notes
// anchored to these ints survive an ESV↔Spanish switch.

export const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
  "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
  "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

export const BOOK_ABBREV = [
  "Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa",
  "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh", "Est", "Job", "Psa", "Pro",
  "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo",
  "Oba", "Jon", "Mic", "Nah", "Hab", "Zep", "Hag", "Zec", "Mal", "Mat",
  "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal", "Eph", "Php",
  "Col", "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "Heb", "Jas", "1Pe",
  "2Pe", "1Jo", "2Jo", "3Jo", "Jud", "Rev",
] as const;

// Chapters per book, canonical order — the denominator for honest
// read-through counting on the Transcript (a book counts as read once
// only when every chapter has been covered at least once).
export const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42,
  150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14,
  4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13,
  5, 5, 3, 5, 1, 1, 1, 22,
] as const;

// USFM 3-char book ids (the free-Bible APIs' addressing scheme).
export const BOOK_USFM = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT",
  "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP",
  "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
  "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
] as const;

export const TOTAL_CHAPTERS = 1189;

/** Canonical chapter order: position 0..1188 → {book (1-based), chapter}. */
export function chapterAt(position: number): { book: number; chapter: number } | null {
  if (position < 0 || position >= TOTAL_CHAPTERS) return null;
  let p = position;
  for (let b = 0; b < CHAPTERS.length; b++) {
    if (p < CHAPTERS[b]) return { book: b + 1, chapter: p + 1 };
    p -= CHAPTERS[b];
  }
  return null;
}

export function refInt(book: number, chapter: number, verse: number) {
  return book * 1_000_000 + chapter * 1_000 + verse;
}

export function refParts(ref: number) {
  return {
    book: Math.floor(ref / 1_000_000),
    chapter: Math.floor((ref % 1_000_000) / 1_000),
    verse: ref % 1_000,
  };
}

// A term's syllabus rows are UNITS of variable length — a doctrine
// short can be 3 days, a book walk 30. Rows may carry `days`; rows
// without it (the original Judges seed) default to 6. The term's
// study target is the sum.
export interface SyllabusUnit {
  week: number;
  label: string;
  ref: string;
  days?: number;
  hard?: boolean;
}

export function unitDays(row: { days?: number } | undefined | null) {
  const d = row?.days;
  return Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 30 ? (d as number) : 6;
}

export function syllabusTarget(syllabus: unknown, weeks: number) {
  const rows = Array.isArray(syllabus) ? (syllabus as SyllabusUnit[]) : [];
  if (!rows.length) return weeks * 6;
  return rows.reduce((sum, r) => sum + unitDays(r), 0);
}

/** "Judges 4:14" from a canonical int; ranges collapse sensibly. */
export function formatRef(start: number, end = start): string {
  const a = refParts(start);
  const b = refParts(end);
  const book = BOOKS[a.book - 1] ?? `Book ${a.book}`;
  if (start === end) return `${book} ${a.chapter}:${a.verse}`;
  if (a.book === b.book && a.chapter === b.chapter)
    return `${book} ${a.chapter}:${a.verse}–${b.verse}`;
  if (a.book === b.book)
    return `${book} ${a.chapter}:${a.verse}–${b.chapter}:${b.verse}`;
  const book2 = BOOKS[b.book - 1] ?? `Book ${b.book}`;
  return `${book} ${a.chapter}:${a.verse}–${book2} ${b.chapter}:${b.verse}`;
}
