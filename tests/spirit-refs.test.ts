import { describe, it, expect } from "vitest";
import {
  parseReadingRef,
  assignedInChapter,
  readingSpan,
  scopeLabel,
  assignmentLabel,
  bookNumberFromName,
  CHAPTER_END,
} from "@/lib/spirit-refs";

// The refs below are the real ones in the live curriculum (Term 1,
// "Reading the Room") plus the shapes the Judges seed used.

describe("parseReadingRef", () => {
  it("parses a verse range inside a chapter — the ref that broke the Reader", () => {
    const [seg] = parseReadingRef("1 Corinthians 7:1-7");
    expect(seg.bookName).toBe("1 Corinthians");
    expect(seg.startChapter).toBe(7);
    expect(seg.startVerse).toBe(1);
    expect(seg.endVerse).toBe(7);
    expect(seg.chapterQuery).toBe("1 Corinthians 7");
    expect(seg.label).toBe("1 Corinthians 7:1–7");
    expect(seg.verseCount).toBe(7);
    expect(seg.refStart).toBe(46007001);
    expect(seg.refEnd).toBe(46007007);
  });

  it("keeps the whole chapter as the Reader's query, not the verse", () => {
    // The old split produced "1 Corinthians 1:10" and loaded one verse.
    const [seg] = parseReadingRef("1 Corinthians 1:10-17");
    expect(seg.chapterQuery).toBe("1 Corinthians 1");
    expect(seg.refStart).toBe(46001010);
    expect(seg.refEnd).toBe(46001017);
  });

  it("parses two-book assignments", () => {
    const segs = parseReadingRef("Psalm 23; Proverbs 22:6");
    expect(segs).toHaveLength(2);
    expect(segs[0].bookName).toBe("Psalm");
    expect(segs[0].startVerse).toBeNull();
    expect(segs[0].label).toBe("Psalm 23");
    expect(segs[1].label).toBe("Proverbs 22:6");
    expect(segs[1].verseCount).toBe(1);
  });

  it("parses the Matthew/Hosea pairing", () => {
    const segs = parseReadingRef("Matthew 2:13-18; Hosea 11:1-4");
    expect(segs.map((s) => s.label)).toEqual(["Matthew 2:13–18", "Hosea 11:1–4"]);
    expect(segs.map((s) => s.chapterQuery)).toEqual(["Matthew 2", "Hosea 11"]);
    expect(scopeLabel(segs)).toBe("10 verses");
  });

  it("inherits the book across a semicolon continuation", () => {
    const segs = parseReadingRef("1 Corinthians 7:1; 1:10-17");
    expect(segs).toHaveLength(2);
    expect(segs[1].bookName).toBe("1 Corinthians");
    expect(segs[1].startChapter).toBe(1);
    expect(segs[1].endVerse).toBe(17);
  });

  it("parses whole-chapter ranges", () => {
    const [seg] = parseReadingRef("Judges 4-5");
    expect(seg.chapters).toEqual([4, 5]);
    expect(seg.startVerse).toBeNull();
    expect(seg.endVerse).toBeNull();
    expect(seg.label).toBe("Judges 4–5");
    expect(seg.refEnd).toBe(7005000 + CHAPTER_END);
    expect(scopeLabel([seg])).toBe("2 chapters");
  });

  it("accepts en-dashes and abbreviations", () => {
    const [seg] = parseReadingRef("1 Cor 7:1–7");
    expect(seg.bookName).toBe("1 Corinthians");
    expect(seg.endVerse).toBe(7);
  });

  it("parses cross-chapter verse ranges", () => {
    const [seg] = parseReadingRef("Romans 9:30-10:4");
    expect(seg.startChapter).toBe(9);
    expect(seg.startVerse).toBe(30);
    expect(seg.endChapter).toBe(10);
    expect(seg.endVerse).toBe(4);
    expect(seg.chapters).toEqual([9, 10]);
    expect(seg.verseCount).toBeNull();
  });

  it("parses a whole book", () => {
    const [seg] = parseReadingRef("Philemon");
    expect(seg.startChapter).toBe(1);
    expect(seg.endChapter).toBe(1);
    expect(seg.startVerse).toBeNull();
  });

  it("skips junk without guessing", () => {
    expect(parseReadingRef("")).toEqual([]);
    expect(parseReadingRef("the sermon on the mount")).toEqual([]);
  });

  it("never confuses the numbered books", () => {
    expect(bookNumberFromName("1 John")).toBe(62);
    expect(bookNumberFromName("2 John")).toBe(63);
    expect(bookNumberFromName("3 John")).toBe(64);
    expect(bookNumberFromName("John")).toBe(43);
    expect(bookNumberFromName("Psalms")).toBe(19);
    expect(bookNumberFromName("II Timothy")).toBe(55);
  });
});

describe("assignedInChapter", () => {
  it("brackets the assigned verses inside the loaded chapter", () => {
    const [seg] = parseReadingRef("1 Corinthians 7:1-7");
    expect(assignedInChapter(seg, 7)).toEqual({ from: 1, to: 7 });
    expect(assignedInChapter(seg, 8)).toBeNull();
  });

  it("runs to the end of the chapter when the range crosses out of it", () => {
    const [seg] = parseReadingRef("Romans 9:30-10:4");
    expect(assignedInChapter(seg, 9)).toEqual({ from: 30, to: null });
    expect(assignedInChapter(seg, 10)).toEqual({ from: 1, to: 4 });
  });

  it("treats whole chapters as fully assigned", () => {
    const [seg] = parseReadingRef("Judges 4-5");
    expect(assignedInChapter(seg, 4)).toEqual({ from: 1, to: null });
    expect(assignedInChapter(seg, 5)).toEqual({ from: 1, to: null });
  });
});

describe("readingSpan", () => {
  it("spans every segment — an honest reading log", () => {
    const segs = parseReadingRef("Matthew 2:13-18; Hosea 11:1-4");
    expect(readingSpan(segs)).toEqual({ refStart: 28011001, refEnd: 40002018 });
  });

  it("logs the real range for the assignment that logged one verse", () => {
    const segs = parseReadingRef("1 Corinthians 7:1-7");
    expect(readingSpan(segs)).toEqual({ refStart: 46007001, refEnd: 46007007 });
  });

  it("is null when nothing parsed", () => {
    expect(readingSpan([])).toBeNull();
  });
});

describe("assignmentLabel", () => {
  it("joins multi-part assignments unambiguously", () => {
    expect(assignmentLabel(parseReadingRef("Psalm 23; Proverbs 22:6"))).toBe(
      "Psalm 23 · Proverbs 22:6",
    );
  });
});
