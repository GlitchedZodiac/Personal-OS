import { describe, expect, it } from "vitest";
import { detectMark, shouldMerge, mergeHits, type WordBox } from "@/lib/mark-detect";
import { findAnchorRange } from "@/lib/word-boxes";

// One printed line: three words on a 16px-tall line at y=100.
const LINE: WordBox[] = [
  { wi: 0, text: "justified", left: 20, top: 100, width: 60, height: 16 },
  { wi: 1, text: "by", left: 86, top: 100, width: 18, height: 16 },
  { wi: 2, text: "faith", left: 110, top: 100, width: 34, height: 16 },
];

/** a closed ellipse around a box, slightly padded */
function ellipseAround(cx: number, cy: number, rx: number, ry: number, n = 28, sweep = Math.PI * 2) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * sweep;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

describe("detectMark — circle", () => {
  it("a closed loop around one word circles exactly that word", () => {
    const w = LINE[2];
    const m = detectMark(ellipseAround(w.left + w.width / 2, w.top + w.height / 2, w.width / 2 + 9, w.height / 2 + 7), LINE);
    expect(m).toEqual({ kind: "circle", wordStart: 2, wordEnd: 2 });
  });

  it("a loop around the whole phrase takes the word range", () => {
    const m = detectMark(ellipseAround(82, 108, 76, 16), LINE);
    expect(m?.kind).toBe("circle");
    expect(m?.wordStart).toBe(0);
    expect(m?.wordEnd).toBe(2);
  });

  it("an open arc (60% around) is not a circle", () => {
    const w = LINE[0];
    const m = detectMark(ellipseAround(w.left + w.width / 2, w.top + w.height / 2, 40, 14, 28, Math.PI * 1.2), LINE);
    expect(m?.kind).not.toBe("circle");
  });

  it("a scribble through the word (points inside it) is plain ink", () => {
    const w = LINE[0];
    const pts = [];
    for (let i = 0; i < 30; i++) pts.push({ x: w.left + (i % 10) * 6, y: w.top + 4 + (i % 3) * 4 });
    pts.push(pts[0]);
    expect(detectMark(pts, LINE)).toBeNull();
  });
});

describe("detectMark — underline", () => {
  it("a flat stroke just under the baseline underlines the words it spans", () => {
    const pts = [];
    for (let x = 18; x <= 108; x += 5) pts.push({ x, y: 119 + Math.sin(x / 9) * 1.5 });
    const m = detectMark(pts, LINE);
    expect(m).toEqual({ kind: "underline", wordStart: 0, wordEnd: 1 });
  });

  it("a stroke 20pt below the line is margin ink, not an underline", () => {
    const pts = [];
    for (let x = 18; x <= 108; x += 5) pts.push({ x, y: 140 });
    expect(detectMark(pts, LINE)).toBeNull();
  });

  it("a steep diagonal is not an underline", () => {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: 20 + i * 4, y: 90 + i * 3 });
    expect(detectMark(pts, LINE)).toBeNull();
  });

  it("half-word overlap does not count; solid overlap does", () => {
    const pts = [];
    for (let x = 106; x <= 148; x += 4) pts.push({ x, y: 118 });
    const m = detectMark(pts, LINE);
    expect(m).toEqual({ kind: "underline", wordStart: 2, wordEnd: 2 });
  });
});

describe("multi-line merge (§1: 600ms, consecutive lines, one anchor)", () => {
  const a = { kind: "underline" as const, wordStart: 0, wordEnd: 4 };
  const b = { kind: "underline" as const, wordStart: 5, wordEnd: 9 };
  it("merges inside the window", () => {
    expect(shouldMerge(a, b, 400)).toBe(true);
    expect(mergeHits(a, b)).toEqual({ kind: "underline", wordStart: 0, wordEnd: 9 });
  });
  it("does not merge after the window, across kinds, or across a distance", () => {
    expect(shouldMerge(a, b, 900)).toBe(false);
    expect(shouldMerge(a, { ...b, kind: "circle" }, 300)).toBe(false);
    expect(shouldMerge(a, { kind: "underline", wordStart: 20, wordEnd: 24 }, 300)).toBe(false);
  });
});

describe("findAnchorRange — re-finding the words in another translation", () => {
  const boxes: WordBox[] = "for by grace you have been saved through faith".split(" ").map((text, wi) => ({ wi, text, left: wi * 40, top: 0, width: 36, height: 14 }));
  it("finds an exact phrase, punctuation-insensitively", () => {
    expect(findAnchorRange(boxes, "grace you have")).toEqual({ wordStart: 2, wordEnd: 4 });
    expect(findAnchorRange(boxes, "Faith")).toEqual({ wordStart: 8, wordEnd: 8 });
  });
  it("answers null when the words are not there (fall back to the verse)", () => {
    expect(findAnchorRange(boxes, "por gracia")).toBeNull();
  });
});
