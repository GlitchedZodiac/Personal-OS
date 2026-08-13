import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { transformPassage } from "@/lib/esv-transform";
import { formatRef, refInt } from "@/lib/bible-refs";

// Fixtures are REAL ESV API responses captured 2026-08-13 (same params
// lib/esv.ts requests). If Crossway changes markup, refresh the fixtures
// and these tests tell us exactly what broke.

function load(name: string) {
  const raw = JSON.parse(
    readFileSync(join(__dirname, "fixtures", name), "utf8")
  ) as { canonical: string; passages: string[] };
  return transformPassage(
    raw.canonical.toLowerCase(),
    raw.canonical,
    raw.passages.join("\n")
  );
}

describe("transformPassage", () => {
  it("segments a prose chapter into per-verse blocks with canonical refs", () => {
    const m = load("esv-Judges_4.json");
    expect(m.canonical).toBe("Judges 4");
    expect(m.verses.length).toBe(24);
    const v14 = m.verses.find((v) => v.verseNum === 14);
    expect(v14?.refInt).toBe(refInt(7, 4, 14));
    expect(v14?.text).toContain("Does not the LORD go out before you?");
    // the verse before it carries Barak's condition
    expect(m.verses.find((v) => v.verseNum === 8)?.text).toContain(
      "If you will go with me"
    );
  });

  it("removes crossref/footnote markers from the text it renders", () => {
    const m = load("esv-Judges_4.json");
    const v2 = m.verses.find((v) => v.verseNum === 2)!;
    // Before the fix, stray marker letters glued to words: "zJabin",
    // "ySold". The clean text must carry the words unprefixed.
    expect(v2.text).toContain("Jabin king of Canaan");
    expect(v2.text).not.toMatch(/[a-z]Jabin/);
    expect(v2.text).not.toMatch(/LORD [a-z]sold/);
    for (const v of m.verses) {
      const letters = v.crossrefs.map((c) => c.letter);
      expect(new Set(letters).size).toBe(letters.length);
    }
  });

  it("lifts cross-references out per verse", () => {
    const m = load("esv-Judges_4.json");
    const withXr = m.verses.filter((v) => v.crossrefs.length > 0);
    expect(withXr.length).toBeGreaterThan(3);
    for (const v of withXr) {
      expect(v.crossrefs[0].ref.length).toBeGreaterThan(0);
      expect(v.crossrefs[0].letter).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("captures the audio mp3 link", () => {
    const m = load("esv-Judges_4.json");
    expect(m.audioUrl).toMatch(/^https:\/\/audio\.esv\.org\/.*\.mp3$/);
  });

  it("sets poetry as lines, not prose (Song of Deborah)", () => {
    const m = load("esv-Judges_5-1-5.json");
    const v2 = m.verses.find((v) => v.verseNum === 2);
    expect(v2?.lines?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps psalm titles and poetry structure (Psalm 23)", () => {
    const m = load("esv-Psalm_23.json");
    expect(m.verses.length).toBe(6);
    const v1 = m.verses[0];
    expect(v1.psalmTitle ?? v1.heading).toBeTruthy();
    expect(v1.lines?.length).toBeGreaterThanOrEqual(1);
  });

  it("flags words of Christ (John 3:16)", () => {
    const m = load("esv-John_3-16-17.json");
    expect(m.verses.find((v) => v.verseNum === 16)?.woc).toBe(true);
  });
});

describe("formatRef", () => {
  it("formats singles, same-chapter and cross-chapter ranges", () => {
    expect(formatRef(refInt(7, 4, 14))).toBe("Judges 4:14");
    expect(formatRef(refInt(7, 4, 4), refInt(7, 4, 9))).toBe("Judges 4:4–9");
    expect(formatRef(refInt(7, 4, 1), refInt(7, 5, 31))).toBe("Judges 4:1–5:31");
  });
});
