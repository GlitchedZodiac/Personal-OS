import { describe, expect, it } from "vitest";
import { eraserCatches, isTapContact, strokeDistanceToSeg, type Stroke } from "@/lib/ink";
import { matchBooks } from "@/components/spirit/bible-nav";
import { BOOKS } from "@/lib/bible-refs";

// A stroke sampled sparsely — exactly what a fast pen produces at 240 Hz across a long sweep.
function line(x1: number, y1: number, x2: number, y2: number, width = 3, samples = 2): Stroke {
  const pts = Array.from({ length: samples }, (_, i) => {
    const u = i / (samples - 1);
    return { x: x1 + (x2 - x1) * u, y: y1 + (y2 - y1) * u, p: 0.5, t: i * 8 };
  });
  return { id: `s${x1}-${y1}`, tool: "gpen", color: "#000", width, opacity: 1, pts } as Stroke;
}

describe("eraser hit test", () => {
  it("measures to the SEGMENT, not just the sampled points", () => {
    // two samples 400 units apart; the eraser sits dead centre, 200 from either sample
    const s = line(0, 0, 400, 0, 3, 2);
    expect(strokeDistanceToSeg(s, 200, 1)).toBeCloseTo(1, 5);
    // the old point-only test would have said ~200 and refused to erase what the ring covered
    const pointOnly = Math.min(...s.pts.map((p) => Math.hypot(p.x - 200, p.y - 1)));
    expect(pointOnly).toBeGreaterThan(100);
  });

  it("catches ink the ring covers, at the ring's own radius", () => {
    const s = line(0, 0, 400, 0, 3, 2);
    const radius = 10;
    expect(eraserCatches(s, 200, 0, radius)).toBe(true);          // dead on
    expect(eraserCatches(s, 200, radius + 1.4, radius)).toBe(true);  // inside radius + half width
    expect(eraserCatches(s, 200, radius + 10, radius)).toBe(false);  // clearly outside
  });

  it("reaches exactly half a stroke width past the ring — never a full width", () => {
    const fat = line(0, 0, 400, 0, 20, 2);
    const radius = 10;
    // the visible edge of a 20-wide stroke is 10 out from the centreline
    expect(eraserCatches(fat, 200, 19.5, radius)).toBe(true);
    expect(eraserCatches(fat, 200, 20.5, radius)).toBe(false);
    // the old `radius + s.width` test grabbed from twice as far as the ring showed
    expect(strokeDistanceToSeg(fat, 200, 29) < radius + fat.width).toBe(true);
    expect(eraserCatches(fat, 200, 29, radius)).toBe(false);
  });

  it("handles a single-point stroke (a dot) without NaN", () => {
    const dot = { ...line(50, 50, 50, 50, 4, 2), pts: [{ x: 50, y: 50, p: 0.5, t: 0 }] } as Stroke;
    expect(strokeDistanceToSeg(dot, 53, 54)).toBeCloseTo(5, 5);
    expect(eraserCatches(dot, 53, 54, 4)).toBe(true);
  });
});

describe("tap vs handwriting — the classifier that decides whether his letter survives", () => {
  const pen = (durationMs: number, spanPx: number) => isTapContact({ durationMs, spanPx, pointerType: "pen" });

  it("a real pen tap is a tap", () => {
    expect(pen(90, 1)).toBe(true);
  });

  it("REGRESSION: a closed letter is NOT a tap, however near it ends to where it began", () => {
    // "o" — ~10 client px across, written in ~180 ms, ending 1 px from its start.
    // Judged by displacement it looked like a tap and was replaced with a single dot.
    expect(pen(180, 10)).toBe(false);
    expect(pen(220, 14)).toBe(false);
    expect(pen(160, 7)).toBe(false);
  });

  it("REGRESSION: a stationary 240 Hz Pencil is still a tap despite accumulated jitter", () => {
    // ~60 samples of sensor noise: arc length climbs past any sane threshold, extent does not
    expect(pen(200, 2)).toBe(true);
  });

  it("a long press is not a tap even if it never moved", () => {
    expect(pen(600, 0)).toBe(false);
  });

  it("a finger gets the looser thresholds a finger needs", () => {
    expect(isTapContact({ durationMs: 280, spanPx: 6, pointerType: "touch" })).toBe(true);
    expect(isTapContact({ durationMs: 280, spanPx: 6, pointerType: "pen" })).toBe(false);
  });
});

describe("Bible navigator book matching — how he actually types", () => {
  const first = (q: string) => { const m = matchBooks(q); return m.length ? BOOKS[m[0]] : null; };

  it("matches a full name and a prefix", () => {
    expect(first("john")).toBe("John");
    expect(first("gala")).toBe("Galatians");
  });

  it("REGRESSION: matches the informal abbreviations its own placeholder advertises", () => {
    expect(first("jn")).toBe("John");
    expect(first("jn3")).toBe("John");
    expect(first("1co")).toBe("1 Corinthians");
  });

  it("does not match nonsense", () => {
    expect(first("zzzz")).toBe(null);
  });

  it("keeps the exact prefix ahead of a looser match", () => {
    // "job" is a real book and must not lose to a subsequence hit elsewhere
    expect(first("job")).toBe("Job");
  });
});
