import { describe, expect, it } from "vitest";
import { eraserCatches, strokeDistanceToSeg, type Stroke } from "@/lib/ink";

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
