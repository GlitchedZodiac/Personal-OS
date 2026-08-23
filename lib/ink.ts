// The ink model — shared by the iPad notebook canvas, the Bible overlay,
// page thumbnails and the phone's read-only renderer. Pure module: no
// DOM beyond a CanvasRenderingContext2D handed in by the caller.
//
// Design: docs/design/pitaya-ipad-03-notebook-rail.dc.html (brushes),
// 05 (overlay anchoring), 06 (per-stroke timestamps for sermon replay).
// A PencilKit PKDrawing exposes the same point data (location, force,
// timeOffset), so the native pane round-trips into this shape.

export type InkTool = "fountain" | "gpen" | "pencil" | "marker";

export interface InkPoint {
  x: number;
  y: number;
  /** pressure 0..1 (0.5 when the input has none) */
  p: number;
  /** ms since the stroke's t0 */
  t: number;
}

export interface Stroke {
  id: string;
  tool: InkTool;
  color: string;
  /** base width in page units */
  width: number;
  opacity: number;
  /** epoch ms at the first point */
  t0: number;
  pts: InkPoint[];
  /** seconds into the active recording at t0, when one was running */
  recT?: number | null;
  /** overlay: anchored to a verse — offsets relative to that verse's box */
  anchor?: { ref: number; dx: number; dy: number } | null;
  /** overlay: where the stroke lives — the text column or the margin */
  region?: "text" | "margin";
}

export type PageObjectType = "refcard" | "text" | "image" | "section" | "prompt" | "answer" | "header";

export interface PageObject {
  id: string;
  type: PageObjectType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  t0?: number;
  recT?: number | null;
  data: Record<string, unknown>;
}

/** Logical page width — every page is laid out in these units and scaled to the pane. */
export const PAGE_WIDTH = 800;
export const PAGE_MIN_HEIGHT = 1120;
export const PAGE_GROW_MARGIN = 260;

export const BRUSHES: Record<InkTool, { label: string; sub: string; base: number; alpha: number }> = {
  fountain: { label: "Fountain pen", sub: "pressure → weight · his TWSBI", base: 2.6, alpha: 0.92 },
  gpen: { label: "G-pen", sub: "fine, flexes on press · comics nib", base: 1.5, alpha: 0.95 },
  pencil: { label: "Pencil", sub: "tilt shades · grain", base: 2.2, alpha: 0.78 },
  marker: { label: "Marker", sub: "flat, translucent — not the highlighter", base: 7, alpha: 0.42 },
};

export const WIDTH_STEPS = [0.7, 1, 1.5] as const; // thin · default · thick multipliers

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Exponential smoothing — Procreate's "streamline". 0 = raw, 1 = glassy. */
export function streamline(prev: InkPoint | null, next: InkPoint, amount: number): InkPoint {
  if (!prev || amount <= 0) return next;
  const k = 1 - Math.min(0.92, amount);
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, p: next.p, t: next.t };
}

/** Half-width at a point for a tool, from pressure and (lightly) speed. */
export function halfWidthAt(stroke: Stroke, i: number): number {
  const pt = stroke.pts[i];
  const base = stroke.width;
  const p = Number.isFinite(pt.p) ? pt.p : 0.5;
  switch (stroke.tool) {
    case "fountain": {
      // nib: pressure dominates, fast strokes thin a little
      const prev = stroke.pts[i - 1];
      let speed = 0;
      if (prev) {
        const d = Math.hypot(pt.x - prev.x, pt.y - prev.y);
        const dt = Math.max(1, pt.t - prev.t);
        speed = Math.min(1, d / dt / 2.4);
      }
      return (base * (0.45 + 0.95 * p) * (1 - 0.25 * speed)) / 2;
    }
    case "gpen":
      return (base * (0.35 + 1.25 * p * p)) / 2;
    case "pencil":
      return (base * (0.6 + 0.5 * p)) / 2;
    case "marker":
      return base / 2;
    default:
      return base / 2;
  }
}

export function strokeBounds(s: Stroke): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of s.pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const pad = s.width;
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function pageHeightFor(strokes: Stroke[], objects: PageObject[], min = PAGE_MIN_HEIGHT): number {
  let bottom = 0;
  for (const s of strokes) {
    const b = strokeBounds(s);
    bottom = Math.max(bottom, b.y + b.h);
  }
  for (const o of objects) bottom = Math.max(bottom, o.y + (o.h ?? 80));
  return Math.max(min, Math.ceil((bottom + PAGE_GROW_MARGIN) / 40) * 40);
}

/** Draw one stroke as a variable-width ribbon (round joins by construction). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  opts: { offsetX?: number; offsetY?: number; alphaScale?: number; colorOverride?: string } = {},
) {
  const pts = s.pts;
  if (!pts.length) return;
  const ox = opts.offsetX ?? 0;
  const oy = opts.offsetY ?? 0;
  const color = opts.colorOverride ?? s.color;
  const alpha = Math.max(0, Math.min(1, (s.opacity ?? 1) * (BRUSHES[s.tool]?.alpha ?? 1) * (opts.alphaScale ?? 1)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tool === "marker") ctx.globalCompositeOperation = "multiply";

  if (pts.length === 1) {
    const r = halfWidthAt(s, 0);
    ctx.beginPath();
    ctx.arc(pts[0].x + ox, pts[0].y + oy, Math.max(0.6, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Ribbon: offset each point by its half-width along the segment normal.
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const hw = Math.max(0.35, halfWidthAt(s, i));
    left.push([pts[i].x + nx * hw + ox, pts[i].y + ny * hw + oy]);
    right.push([pts[i].x - nx * hw + ox, pts[i].y - ny * hw + oy]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) {
    const [px, py] = left[i - 1];
    const [cx, cy] = left[i];
    ctx.quadraticCurveTo(px, py, (px + cx) / 2, (py + cy) / 2);
  }
  ctx.lineTo(left[left.length - 1][0], left[left.length - 1][1]);
  for (let i = right.length - 1; i >= 1; i--) {
    const [px, py] = right[i];
    const [cx, cy] = right[i - 1];
    ctx.quadraticCurveTo(px, py, (px + cx) / 2, (py + cy) / 2);
  }
  ctx.closePath();
  ctx.fill();
  // round the two ends
  const r0 = Math.max(0.35, halfWidthAt(s, 0));
  const r1 = Math.max(0.35, halfWidthAt(s, pts.length - 1));
  ctx.beginPath();
  ctx.arc(pts[0].x + ox, pts[0].y + oy, r0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pts[pts.length - 1].x + ox, pts[pts.length - 1].y + oy, r1, 0, Math.PI * 2);
  ctx.fill();
  if (s.tool === "pencil") {
    // a light grain: a second, thinner, jittered pass
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = Math.max(0.5, s.width * 0.35);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const j = ((i * 7919) % 13) / 13 - 0.5;
      const x = pts[i].x + ox + j * 0.9;
      const y = pts[i].y + oy - j * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  opts: { alphaScale?: number; offsetFor?: (s: Stroke) => { x: number; y: number } | null } = {},
) {
  for (const s of strokes) {
    const off = opts.offsetFor ? opts.offsetFor(s) : null;
    drawStroke(ctx, s, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0, alphaScale: opts.alphaScale });
  }
}

/** Render strokes (and a paper background) into a PNG data URL — thumbnails, recognition, export. */
export function renderToDataUrl(
  strokes: Stroke[],
  opts: {
    width?: number;
    height?: number;
    scale?: number;
    background?: string | null;
    region?: { x: number; y: number; w: number; h: number };
    objectsText?: { x: number; y: number; text: string }[];
  } = {},
): string | null {
  if (typeof document === "undefined") return null;
  const region = opts.region ?? { x: 0, y: 0, w: opts.width ?? PAGE_WIDTH, h: opts.height ?? PAGE_MIN_HEIGHT };
  const scale = opts.scale ?? 1;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(region.w * scale));
  c.height = Math.max(1, Math.round(region.h * scale));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.scale(scale, scale);
  ctx.translate(-region.x, -region.y);
  for (const t of opts.objectsText ?? []) {
    ctx.fillStyle = "#232227";
    ctx.font = "16px Instrument Sans, sans-serif";
    ctx.fillText(t.text, t.x, t.y + 16);
  }
  drawStrokes(ctx, strokes);
  return c.toDataURL("image/png");
}

// ——— geometry for gestures ———

export function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** A stroke is "inside" a lasso when most of its points are. */
export function strokesInLasso(strokes: Stroke[], poly: { x: number; y: number }[]): Stroke[] {
  if (poly.length < 3) return [];
  return strokes.filter((s) => {
    let inside = 0;
    for (const pt of s.pts) if (pointInPolygon(pt.x, pt.y, poly)) inside++;
    return inside >= Math.max(1, Math.ceil(s.pts.length * 0.6));
  });
}

/** Is this stroke a closed loop (a circle gesture)? start ≈ end, some area. */
export function isClosedLoop(pts: InkPoint[]): boolean {
  if (pts.length < 12) return false;
  const a = pts[0], b = pts[pts.length - 1];
  const b2 = strokeBoundsOf(pts);
  const diag = Math.hypot(b2.w, b2.h);
  if (diag < 24) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) < Math.max(18, diag * 0.28);
}

/** A tick: a short stroke with one sharp direction change, going down then up-right. */
export function isTick(pts: InkPoint[]): boolean {
  if (pts.length < 6) return false;
  const b = strokeBoundsOf(pts);
  if (b.w < 8 || b.w > 90 || b.h < 6 || b.h > 90) return false;
  let lowest = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].y > pts[lowest].y) lowest = i;
  if (lowest <= 1 || lowest >= pts.length - 2) return false;
  const first = pts[0], low = pts[lowest], last = pts[pts.length - 1];
  return low.y - first.y > 3 && last.y < low.y - 4 && last.x > low.x;
}

/** A strike: a mostly horizontal dash (or a single diagonal slash) across something. */
export function isStrike(pts: InkPoint[]): boolean {
  if (pts.length < 4) return false;
  const b = strokeBoundsOf(pts);
  if (b.w < 22) return false;
  return b.h < Math.max(14, b.w * 0.35) && !isClosedLoop(pts);
}

/** An underline: long, flat, thin. */
export function isUnderline(pts: InkPoint[]): boolean {
  if (pts.length < 4) return false;
  const b = strokeBoundsOf(pts);
  return b.w > 40 && b.h < Math.max(10, b.w * 0.12);
}

export function strokeBoundsOf(pts: InkPoint[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** QuickShape: when the pen holds still at the end of a loop, snap it to an ellipse. */
export function snapToEllipse(pts: InkPoint[]): InkPoint[] {
  const b = strokeBoundsOf(pts);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = Math.max(6, b.w / 2), ry = Math.max(6, b.h / 2);
  const n = 48;
  const t0 = pts[0]?.t ?? 0;
  const out: InkPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, p: 0.55, t: t0 + i * 6 });
  }
  return out;
}

/** QuickShape: snap a near-straight stroke to a line (arrowheads keep their last few points). */
export function snapToLine(pts: InkPoint[]): InkPoint[] {
  if (pts.length < 2) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: 0.55, t: (a.t + b.t) / 2 }, b];
}

/** a finger tap is a bigger, slower thing than a pen tap */
export const TAP_MS = 320;
export const TAP_PX = 7;
export const PEN_TAP_MS = 250;
export const PEN_TAP_PX = 6;

/**
 * Was this contact a TAP, or was he writing?
 *
 * Judged on the bounding-box EXTENT of the whole contact path, because the two obvious
 * measures are each wrong on their own, and both have shipped and broken his handwriting:
 *   - arc length: a 240 Hz Pencil accumulates path length while standing perfectly still,
 *     so a real tap never registered and taps on page objects did nothing;
 *   - displacement (first point to last): "o", "a", "e", "d", "g", "0", "8" and every quick
 *     loop end where they began, so each was classified a tap and replaced with a dot.
 * Extent has neither failure: sensor jitter keeps the box a pixel or two wide, while a
 * letter's box is the size of the letter. Extent is also >= displacement by construction,
 * so it subsumes the drift test rather than needing to be combined with it.
 */
export function isTapContact(c: {
  durationMs: number;
  /** the widest dimension of the contact path's bounding box, in client px */
  spanPx: number;
  pointerType: string;
}): boolean {
  const ms = c.pointerType === "pen" ? PEN_TAP_MS : TAP_MS;
  const px = c.pointerType === "pen" ? PEN_TAP_PX : TAP_PX;
  return c.durationMs < ms && c.spanPx < px;
}

/**
 * Distance from a point to a stroke's POLYLINE — the segments, not just the sampled points.
 * `strokeDistanceTo` measures to points only, so a fast stroke (sparse samples) reads as far
 * away even when the eraser is sitting right on top of the line between two of them. That is
 * what made the eraser ring a liar: it covered ink that refused to vanish.
 */
export function strokeDistanceToSeg(s: Stroke, x: number, y: number, stopBelow = -1): number {
  const pts = s.pts;
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    // callers that only need "is it within R" can stop at the first segment that proves it,
    // instead of walking all 40 segments of a stroke that was already caught by its second
    if (stopBelow >= 0 && best < stopBelow) return best;
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2)) : 0;
    const d = Math.hypot(a.x + u * vx - x, a.y + u * vy - y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * THE eraser predicate. The ring the user sees and the strokes that actually die are drawn
 * from this one expression — two expressions that merely agree today will disagree tomorrow.
 * A stroke's visible edge is a HALF width out from its centreline, so the catch is
 * radius + width/2, not radius + width.
 */
export function eraserCatches(s: Stroke, x: number, y: number, radius: number): boolean {
  return strokeDistanceToSeg(s, x, y, eraserReach(s, radius)) < eraserReach(s, radius);
}

/**
 * How far the eraser reaches past its own ring for a given stroke: a stroke's visible edge is
 * a HALF width out from its centreline. ONE name, used by the exact test, by the bounding-box
 * rejection and by the ring — three places that must never disagree. They did once: the catch
 * used a full `s.width` and grabbed from twice as far as the ring showed.
 */
export function eraserReach(s: Stroke, radius: number): number {
  return radius + s.width / 2;
}

/** axis-aligned box around a stroke's CENTRELINE — no width padding, that is the reach's job */
function centrelineBox(s: Stroke): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * Cached on the POINTS ARRAY, not the stroke object and not the id: `pts` is replaced whenever
 * the geometry changes, so a stale box is impossible, and a WeakMap lets a deleted stroke's
 * entry be collected. Module state rather than a ref, so nothing is written during render and
 * react-hooks/immutability has nothing to complain about.
 */
const boxCache = new WeakMap<Stroke["pts"], { x0: number; y0: number; x1: number; y1: number }>();
function cachedBox(s: Stroke) {
  let b = boxCache.get(s.pts);
  if (!b) { b = centrelineBox(s); boxCache.set(s.pts, b); }
  return b;
}

/**
 * Which strokes does an eraser at these points take?
 *
 * Pure and exported so a fuzz test can hold it against a brute-force reference. The catch set
 * is the contract: this must return exactly the strokes `eraserCatches` would, for every point
 * given — the optimisation is only allowed to be faster, never different. The box rejection is
 * inflated by the same `eraserReach` the exact test uses, so it can never reject a stroke the
 * exact test would have caught.
 */
/**
 * A PARTIAL eraser: cut the eraser's path out of a stroke and return what survives.
 *
 * The whole-stroke eraser was correct for a highlighter and wrong for a pen. His example: draw
 * a capital L meaning a lowercase one, rub out the foot, and the entire letter went. Erasing the
 * middle of a stroke must leave two strokes; erasing an end must shorten it.
 *
 * The cut is solved in the polyline's PARAMETER space, t ∈ [0, N-1], where t = (i-1) + u is the
 * point u of the way along segment pts[i-1]→pts[i] — NOT at sample granularity. That distinction
 * is the whole correctness of this function: a fast Pencil samples sparsely (the existing tests
 * pin two samples 400 units apart), so classifying each sampled POINT as in-or-out would put the
 * cut up to a whole segment away from where he actually put the nib, and a two-sample stroke
 * could not be cut at all. Same reason `strokeDistanceToSeg` measures to segments.
 *
 * `discs` are the eraser's sample centres in the STROKE's own coordinates — pass `offset` for
 * Bible-overlay ink, whose strokes are anchored to a live verse box and therefore drawn at a
 * shifting offset from page space. Getting that wrong carves a hole where the verse used to be.
 *
 * Returns null when nothing was touched, so the caller keeps the original object — an unchanged
 * `pts` array keeps its cached bounding box and its React identity. Returns [] when it all goes.
 *
 * EVERY fragment gets a fresh id. Reusing the parent's id for the leading run looks like a nice
 * optimisation and is a trap: the save queue cancels a queued append whose id is also in the
 * removal list (that guard exists because a stroke drawn and erased inside one debounce window
 * used to come back from the dead), so a fragment wearing its parent's id was silently dropped
 * on the way to the server. An erase is always: remove the original, append what survived.
 */
export function eraseFromStroke(
  s: Stroke,
  discs: readonly { x: number; y: number }[],
  radius: number,
  newIdFn: () => string,
  opts: { offset?: { x: number; y: number } | null; crumb?: number } = {},
): Stroke[] | null {
  const pts = s.pts;
  if (pts.length === 0) return null;
  const reach = eraserReach(s, radius);
  const ox = opts.offset?.x ?? 0, oy = opts.offset?.y ?? 0;
  const cs = discs.map((d) => ({ x: d.x - ox, y: d.y - oy }));

  // A dot is a deliberate mark — a full stop, the tittle of an i. Never carve one; take it whole
  // or leave it whole.
  if (pts.length === 1) {
    const p = pts[0];
    return cs.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < reach) ? [] : null;
  }

  // every [t0, t1] the eraser covers, in parameter space
  const cut: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const A = vx * vx + vy * vy;
    for (const c of cs) {
      const wx = a.x - c.x, wy = a.y - c.y;
      if (A === 0) {
        // duplicate samples — the Pencil emits them; treat as a point
        if (wx * wx + wy * wy < reach * reach) cut.push([i - 1, i]);
        continue;
      }
      const B = 2 * (wx * vx + wy * vy);
      const C = wx * wx + wy * wy - reach * reach;
      const disc = B * B - 4 * A * C;
      if (disc <= 0) continue;
      const rt = Math.sqrt(disc);
      let u0 = (-B - rt) / (2 * A);
      let u1 = (-B + rt) / (2 * A);
      if (u1 <= 0 || u0 >= 1) continue;
      u0 = Math.max(0, u0);
      u1 = Math.min(1, u1);
      cut.push([i - 1 + u0, i - 1 + u1]);
    }
  }
  if (!cut.length) return null;

  // merge into a disjoint union
  cut.sort((p1, p2) => p1[0] - p2[0]);
  const merged: [number, number][] = [cut[0]];
  for (const [lo, hi] of cut.slice(1)) {
    const last = merged[merged.length - 1];
    if (lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }

  // the complement is what survives
  const runs: [number, number][] = [];
  let at = 0;
  for (const [lo, hi] of merged) {
    if (lo > at) runs.push([at, lo]);
    at = Math.max(at, hi);
  }
  if (at < pts.length - 1) runs.push([at, pts.length - 1]);
  if (!runs.length) return [];

  const lerp = (t: number): InkPoint => {
    const i = Math.min(Math.floor(t), pts.length - 2);
    const u = t - i;
    const a = pts[i], b = pts[i + 1];
    return { ...a, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: a.p + (b.p - a.p) * u, t: a.t + (b.t - a.t) * u };
  };

  const crumb = opts.crumb ?? s.width;
  const out: Stroke[] = [];
  for (const [t0, t1] of runs) {
    const rp: InkPoint[] = [lerp(t0)];
    for (let k = Math.ceil(t0); k < t1; k++) if (k > t0 + 1e-9) rp.push(pts[k]);
    if (t1 > t0 + 1e-9) rp.push(lerp(t1));
    if (rp.length < 2) continue;
    // a surviving sliver shorter than the stroke is wide is a blob, not a mark
    let len = 0;
    for (let k = 1; k < rp.length; k++) len += Math.hypot(rp[k].x - rp[k - 1].x, rp[k].y - rp[k - 1].y);
    if (crumb >= 0 && len < crumb) continue;
    out.push({ ...s, id: newIdFn(), pts: rp });
  }
  return out;
}

/**
 * Interpolate an eraser's own sample path so consecutive centres are no further apart than
 * `maxGap`. A fast sweep otherwise leaves thin surviving slivers between the discs — the
 * partial-erase version of "the ring passed right over it and nothing happened".
 */
export function densify(path: readonly { x: number; y: number }[], maxGap: number): { x: number; y: number }[] {
  if (path.length < 2 || maxGap <= 0) return path.slice();
  const out: { x: number; y: number }[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / maxGap);
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

export function eraserSweep(
  strokes: readonly Stroke[],
  pts: readonly { x: number; y: number }[],
  radius: number,
  already: ReadonlySet<string>,
  offsetFor?: ((s: Stroke) => { x: number; y: number } | null) | null,
): string[] {
  const caught: string[] = [];
  for (const s of strokes) {
    if (already.has(s.id) || s.pts.length === 0) continue;
    const off = offsetFor ? offsetFor(s) : null;
    const ox = off?.x ?? 0, oy = off?.y ?? 0;
    const b = cachedBox(s);
    const reach = eraserReach(s, radius);
    for (const p of pts) {
      const x = p.x - ox, y = p.y - oy;
      // cheap rejection first — most strokes on a full page are nowhere near the tip
      if (x < b.x0 - reach || x > b.x1 + reach || y < b.y0 - reach || y > b.y1 + reach) continue;
      if (strokeDistanceToSeg(s, x, y, reach) < reach) { caught.push(s.id); break; }
    }
  }
  return caught;
}

export function strokeDistanceTo(s: Stroke, x: number, y: number): number {
  let best = Infinity;
  for (const pt of s.pts) {
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < best) best = d;
  }
  return best;
}

/** Seconds → m:ss (or h:mm:ss). */
export function fmtSeconds(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "0:00";
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
