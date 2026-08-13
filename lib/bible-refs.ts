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
