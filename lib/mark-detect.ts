// V3 §1 — the mark grammar, as geometry. PURE: points and boxes in, a verdict
// out; no DOM (word boxes are measured by lib/word-boxes.ts and handed in).
//
// The spec's definitions, implemented literally:
//   circle    — a stroke that closes ≥80% around ≥1 word
//   underline — a stroke riding a baseline within ±6pt under ≥1 word
// Everything else (arrows, brackets, stars, letters) is NOT a mark: it stays
// plain overlay ink. Shape alone never pops anything — the caller owns the
// dwell, the dot, and the 4s decay; this module only answers "is this a mark,
// and on which words?"

export interface WordBox {
  /** word index within the verse's visible text */
  wi: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MarkHit {
  kind: "circle" | "underline";
  wordStart: number;
  wordEnd: number;
}

interface Pt { x: number; y: number }

const UNDERLINE_BAND_PT = 6; // §1: within ±6pt under the baseline
const CIRCLE_COVERAGE = 0.8; // §1: closes ≥80% around

function bboxOf(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/** angular coverage of the path around a center: 360° minus the largest angular gap */
function coverageAround(pts: Pt[], cx: number, cy: number): number {
  const angles = pts.map((p) => Math.atan2(p.y - cy, p.x - cx)).sort((a, b) => a - b);
  if (angles.length < 3) return 0;
  let largestGap = 0;
  for (let i = 1; i < angles.length; i++) largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
  largestGap = Math.max(largestGap, angles[0] + Math.PI * 2 - angles[angles.length - 1]);
  return (Math.PI * 2 - largestGap) / (Math.PI * 2);
}

function detectCircle(pts: Pt[], words: WordBox[]): MarkHit | null {
  if (pts.length < 8) return null;
  const bb = bboxOf(pts);
  if (bb.w < 8 || bb.h < 6) return null;
  // closed: the pen came back near where it started, relative to how far it travelled
  const len = pathLength(pts);
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  if (len < 40 || gap > len * 0.25) return null;
  const circled: number[] = [];
  for (const w of words) {
    const cx = w.left + w.width / 2;
    const cy = w.top + w.height / 2;
    // the word's center must sit inside the stroke's bbox — a loop elsewhere circles nothing
    if (cx < bb.minX || cx > bb.maxX || cy < bb.minY || cy > bb.maxY) continue;
    // a ring, not a scribble THROUGH the word: most points stay outside the word box
    const inside = pts.filter((p) => p.x >= w.left && p.x <= w.left + w.width && p.y >= w.top && p.y <= w.top + w.height).length;
    if (inside > pts.length * 0.35) continue;
    if (coverageAround(pts, cx, cy) >= CIRCLE_COVERAGE) circled.push(w.wi);
  }
  if (!circled.length) return null;
  return { kind: "circle", wordStart: Math.min(...circled), wordEnd: Math.max(...circled) };
}

function detectUnderline(pts: Pt[], words: WordBox[]): MarkHit | null {
  if (pts.length < 2 || !words.length) return null;
  const bb = bboxOf(pts);
  // riding a baseline: flat, and meaningfully wider than tall
  if (bb.w < 14) return null;
  if (bb.h > 14 && bb.h > bb.w * 0.28) return null;
  const midY = (bb.minY + bb.maxY) / 2;
  const hit: number[] = [];
  for (const w of words) {
    const baseline = w.top + w.height; // the box bottom is the printed baseline for this purpose
    if (midY < baseline - 3 || midY > baseline + UNDERLINE_BAND_PT + 3) continue;
    const overlap = Math.min(bb.maxX, w.left + w.width) - Math.max(bb.minX, w.left);
    if (overlap >= Math.min(w.width * 0.5, bb.w)) hit.push(w.wi);
  }
  if (!hit.length) return null;
  return { kind: "underline", wordStart: Math.min(...hit), wordEnd: Math.max(...hit) };
}

/** classify one finished stroke against the words of the verse(s) under it */
export function detectMark(pts: Pt[], words: WordBox[]): MarkHit | null {
  if (!words.length || pts.length < 2) return null;
  return detectCircle(pts, words) ?? detectUnderline(pts, words);
}

/**
 * §1 multi-line: "segments drawn within 600ms on consecutive lines merge into ONE
 * anchor". Two hits merge when the second followed inside the window and their word
 * ranges are adjacent or overlapping (consecutive lines of one phrase).
 */
export const MULTILINE_MS = 600;
export function shouldMerge(prev: MarkHit, next: MarkHit, dtMs: number): boolean {
  if (dtMs > MULTILINE_MS) return false;
  if (prev.kind !== next.kind) return false;
  // adjacent or overlapping ranges — a gap of a couple of words still reads as one phrase
  const gap = Math.max(prev.wordStart, next.wordStart) - Math.min(prev.wordEnd, next.wordEnd);
  return gap <= 3;
}
export function mergeHits(a: MarkHit, b: MarkHit): MarkHit {
  return { kind: a.kind, wordStart: Math.min(a.wordStart, b.wordStart), wordEnd: Math.max(a.wordEnd, b.wordEnd) };
}
