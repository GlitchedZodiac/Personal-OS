"use client";

// The ink surface — pointer events in, strokes out. Used by the notebook
// page (03/08), the Bible overlay (05), worksheets (09) and read-only
// renderers. Pen draws; fingers pan, pinch, two-finger-tap undo,
// three-finger-tap redo (Procreate grammar, 03); a pen that is down makes
// every touch pointer inert (palm rejection). Taps of any kind go to the
// parent, which hit-tests whatever lies under the point (verse numbers,
// reference cards, typed blocks) — the canvas never knows what it covers.
//
// Canvases are viewport-sized and follow the scroll, so a two-hour page
// never allocates a bitmap taller than the screen.

import { penTrace } from "@/lib/pen-trace";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import {
  BRUSHES,
  WIDTH_STEPS,
  drawStroke,
  isClosedLoop,
  isStrike,
  isTick,
  isUnderline,
  newId,
  snapToEllipse,
  snapToLine,
  streamline as smooth,
  strokeBounds,
  strokeBoundsOf,
  eraserSweep,
  isTapContact,
  strokesInLasso,
  type InkPoint,
  type InkTool,
  type Stroke,
} from "@/lib/ink";
import { useDesk, hlColor } from "./desk-state";

// performance.now behind a helper — handlers call it, the compiler lint otherwise flags it as render-impure
const nowMs = () => performance.now();

export type GestureKind = "loop" | "tick" | "strike" | "underline" | "stroke" | "dot";

export interface StrokeEndInfo {
  kind: GestureKind;
  pts: InkPoint[];
  bounds: { x: number; y: number; w: number; h: number };
  tool: string;
  /** client-space position of the first point (for elementsFromPoint) */
  clientStart: { x: number; y: number };
  clientEnd: { x: number; y: number };
  clientPts: { x: number; y: number }[];
}

export interface InkCanvasHandle {
  renderPng: (opts?: { region?: { x: number; y: number; w: number; h: number }; scale?: number; background?: string | null }) => string | null;
  clientToPage: (cx: number, cy: number) => { x: number; y: number };
  pageToClient: (x: number, y: number) => { x: number; y: number };
}

export interface InkCanvasProps {
  strokes: Stroke[];
  onStrokesChange?: (next: Stroke[], delta: { appended?: Stroke[]; removed?: string[]; replaced?: Stroke[] }) => void;
  width?: number;
  height: number;
  scale: number;
  enabled?: boolean;
  /** the scroll container the wrapper lives in (finger pan + viewport canvases) */
  scrollRef?: React.RefObject<HTMLElement | null>;
  background?: "dots" | "lined" | "grid" | "blank" | "paper" | "none";
  children?: ReactNode;
  /** 0..1 — the overlay's DIM */
  alpha?: number;
  /** who owns the meaning: return "discard" to evaporate the stroke (gesture consumed) */
  onStrokeEnd?: (stroke: Stroke, info: StrokeEndInfo) => "keep" | "discard" | void;
  onHighlighterStroke?: (stroke: Stroke, info: StrokeEndInfo) => "keep" | "discard" | void;
  onHover?: (pt: { x: number; y: number; clientX: number; clientY: number } | null) => void;
  /** return true when the tap hit something (a pen tap then makes no dot) */
  onTap?: (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => boolean | void;
  onLasso?: (selected: Stroke[], polygon: InkPoint[], bounds: { x: number; y: number; w: number; h: number }) => void;
  /** fires the moment the eraser catches a stroke (a haptic tick) */
  onEraseTick?: () => void;
  onUndoGesture?: () => void;
  onRedoGesture?: () => void;
  /** cumulative scale since the pinch began (NOT incremental) + the live midpoint of the two fingers */
  onZoom?: (k: number, center: { x: number; y: number }) => void;
  /** the pinch lifted — commit the live zoom */
  onZoomEnd?: () => void;
  selectedIds?: Set<string> | null;
  highlightStrokeId?: string | null;
  /** overlay: anchor a finished stroke to a verse (page coords in) */
  anchorFor?: (pt: { x: number; y: number }, clientPt: { x: number; y: number }) => Stroke["anchor"] | null;
  offsetFor?: (s: Stroke) => { x: number; y: number } | null;
  regionFor?: (pt: { x: number; y: number }, clientPt: { x: number; y: number }) => "text" | "margin";
  fingerDraws?: boolean;
  /** hold-still-to-snap a shape (off by default: it straightens handwriting) */
  quickShape?: boolean;
  /** press-hold with no movement: return true to take the pointer over as a drag (ref card in flight) */
  onHold?: (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => boolean | void;
  /** a finger landed here — return true to make this contact a range-drag instead of a scroll */
  onSelectDragStart?: (client: { x: number; y: number }) => boolean | void;
  onSelectDragMove?: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
  onSelectDragEnd?: (client?: { x: number; y: number }) => void;
  onDragMove?: (client: { x: number; y: number }) => void;
  onDragEnd?: (client: { x: number; y: number }, cancelled: boolean) => void;
  style?: CSSProperties;
  className?: string;
  /** the page's paper color (for thumbnails/exports) */
  paper?: string;
}

// setPointerCapture throws NotFoundError if the pointer has already ended — iPadOS can
// deliver a pointerup between the browser queueing pointerdown and React running our handler.
// An uncaught throw here would abandon the rest of the handler, so it is never allowed to.
function capture(el: Element | null | undefined, pointerId: number) {
  try { el?.setPointerCapture(pointerId); } catch { /* pointer already gone */ }
}

/** touches this soon after a pen lift are the hand resting between letters, not a gesture */
const PALM_AFTER_PEN_MS = 320;
// two quarantined contacts landing this close together are a deliberate two-finger gesture,
// never a resting palm — he writes a letter and pinches in the same breath
const PALM_PROMOTE_MS = 160;
// after a pinch ends the surviving finger must not immediately pan, or the page lurches
const PAN_AFTER_PINCH_MS = 160;
/**
 * How long after a pen lift the DESTRUCTIVE finger gestures stay locked out.
 *
 * He writes letter by letter and pauses about a second between letters, with his hand resting
 * on the glass the whole time. A hand that rocks or re-seats in that pause is two brief
 * contacts — which the gesture reader scored as a deliberate two-finger tap and answered by
 * UNDOING the letter he had just written. Panning and pinching can stay permissive; undo is
 * the one gesture that destroys work, so it waits until the pen has really been put down.
 */
const DESTRUCTIVE_AFTER_PEN_MS = 1500;
const HOLD_MS = 520;
const HOLD_PX = 5;

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(props, ref) {
  const {
    strokes,
    onStrokesChange,
    width = 800,
    height,
    scale,
    enabled = true,
    scrollRef,
    background = "dots",
    children,
    alpha = 1,
    onStrokeEnd,
    onHighlighterStroke,
    onHover,
    onTap,
    onLasso,
    onEraseTick,
    onUndoGesture,
    onRedoGesture,
    onZoom,
    onZoomEnd,
    selectedIds,
    highlightStrokeId,
    anchorFor,
    offsetFor,
    regionFor,
    fingerDraws = false,
    quickShape = false,
    onHold,
    onSelectDragStart,
    onSelectDragMove,
    onSelectDragEnd,
    onDragMove,
    onDragEnd,
    style,
    className,
    paper,
  } = props;
  const desk = useDesk();
  const { pen, recordingSeconds } = desk;
  const penActive = useRef(false); // palm rejection is per canvas: touch is inert while this canvas's pen is down
  /** when the pen last left the glass — writing letter by letter lifts it constantly while the
      palm stays down, so touches inside this window are the hand, not a finger gesture */
  const penLeftAt = useRef(0);
  const touchHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchDrag = useRef<number | null>(null);
  const selDrag = useRef<{ id: number; from: { x: number; y: number } } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const cur = useRef<{
    stroke: Stroke;
    raw: InkPoint[];
    lastSmoothed: InkPoint | null;
    clientPts: { x: number; y: number }[];
    pointerId: number;
    pointerType: string;
    t0: number;
    movedPx: number;
    lastMoveAt: number;
    holdAnchor: InkPoint | null;
    holdStart: number;
    mode: "draw" | "erase" | "lasso";
    erased: Set<string>;
    dragging: boolean;
  } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghosts = useRef<{ stroke: Stroke; born: number }[]>([]);
  const touches = useRef<Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: number }>>(new Map());
  const maxTouches = useRef(0);
  const pinch = useRef<{ d0: number; cx: number; cy: number } | null>(null);
  const raf = useRef<number | null>(null);

  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  /**
   * The wrapper can carry a live pinch transform this canvas knows nothing about. Both
   * mappings therefore measure the wrapper's ACTUAL on-screen box and derive the effective
   * scale from it — so a pen touching down mid-pinch still lands where he put it.
   */
  const clientToPage = useCallback(
    (cx: number, cy: number) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const eff = r.width > 4 ? r.width / width : scale;
      return { x: (cx - r.left) / eff, y: (cy - r.top) / eff };
    },
    [scale, width],
  );
  const pageToClient = useCallback(
    (x: number, y: number) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const eff = r.width > 4 ? r.width / width : scale;
      return { x: r.left + x * eff, y: r.top + y * eff };
    },
    [scale, width],
  );

  // ——— viewport tracking (canvases follow the scroll) ———
  /**
   * During a live pinch an ancestor transform scales this element, revealing page area that
   * was never measured — and the canvases, sized to the scroller's viewport, render it as
   * blank paper. Widening the measured area for the duration of the gesture keeps ink on
   * screen while he zooms out. The margin is the zoom-out headroom the pinch clamp allows.
   */
  const gestureMargin = useRef(1);
  const measure = useCallback(() => {
    const sc = scrollRef?.current;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const m = gestureMargin.current;
    if (sc) {
      const sr = sc.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const padX = (sr.width * (m - 1)) / 2;
      const padY = (sr.height * (m - 1)) / 2;
      const left = Math.max(0, sr.left - wr.left - padX);
      const top = Math.max(0, sr.top - wr.top - padY);
      const w = Math.min(sr.width * m, wr.width - left);
      const h = Math.min(sr.height * m, wr.height - top);
      setViewport((v) => (v.left === left && v.top === top && v.w === w && v.h === h ? v : { left, top, w: Math.max(0, w), h: Math.max(0, h) }));
    } else {
      const wr = wrap.getBoundingClientRect();
      setViewport((v) => (v.w === wr.width && v.h === wr.height && v.left === 0 && v.top === 0 ? v : { left: 0, top: 0, w: wr.width, h: wr.height }));
    }
  }, [scrollRef]);
  /** 2.2x covers the pinch clamp's full zoom-out headroom (0.45x) with room to spare */
  const widenForGesture = useCallback(() => {
    if (gestureMargin.current !== 1) return;
    gestureMargin.current = 2.2;
    measure();
  }, [measure]);
  const restoreAfterGesture = useCallback(() => {
    if (gestureMargin.current === 1) return;
    gestureMargin.current = 1;
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    measure();
    const sc = scrollRef?.current;
    const onScroll = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        measure();
      });
    };
    sc?.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => measure());
    if (sc) ro.observe(sc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", onScroll);
    return () => {
      sc?.removeEventListener("scroll", onScroll);
      ro.disconnect();
      window.removeEventListener("resize", onScroll);
    };
  }, [measure, scrollRef, scale, height]);

  /** ids under the eraser right now — hidden live, committed as one removal on lift */
  const [erasedNow, setErasedNow] = useState<Set<string> | null>(null);
  // ——— drawing the committed layer ———
  const redrawBase = useCallback(() => {
    const c = baseRef.current;
    if (!c || viewport.w <= 0 || viewport.h <= 0) return;
    const W = Math.round(viewport.w * dpr);
    const H = Math.round(viewport.h * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr * scale, dpr * scale);
    ctx.translate(-viewport.left / scale, -viewport.top / scale);
    const vx = viewport.left / scale, vy = viewport.top / scale, vw = viewport.w / scale, vh = viewport.h / scale;
    // selection wash first
    if (selectedIds && selectedIds.size) {
      ctx.save();
      ctx.fillStyle = "#F6E3EB";
      ctx.strokeStyle = "#A63D63";
      ctx.lineWidth = 1.5 / scale;
      for (const s of strokes) {
        if (!selectedIds.has(s.id)) continue;
        const b = strokeBounds(s);
        ctx.beginPath();
        ctx.roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const s of (mirror.current.length >= strokes.length ? mirror.current : strokes)) {
      if (erasedNow?.has(s.id)) continue; // under the eraser right now
      const off = offsetFor ? offsetFor(s) : null;
      const b = strokeBounds(s);
      const bx = b.x + (off?.x ?? 0), by = b.y + (off?.y ?? 0);
      if (bx + b.w < vx || bx > vx + vw || by + b.h < vy || by > vy + vh) continue;
      const isHl = highlightStrokeId && s.id === highlightStrokeId;
      if (isHl) {
        ctx.save();
        ctx.fillStyle = "#F6E3EB";
        ctx.strokeStyle = "#A63D63";
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.roundRect(bx - 5, by - 5, b.w + 10, b.h + 10, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      drawStroke(ctx, s, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0, alphaScale: alpha });
    }
  }, [strokes, viewport, scale, dpr, selectedIds, highlightStrokeId, alpha, offsetFor, erasedNow]);

  // what the committed canvas currently shows. `refs` holds the very stroke OBJECTS painted:
  // ids alone were not enough — growBelow/applyGrow/lasso-move rewrite a stroke's points and
  // hand back NEW objects with the SAME ids, and the canvas then never repainted them.
  const drawn = useRef<{ refs: Stroke[]; key: string } | null>(null);
  const mirror = useRef<Stroke[]>([]);
  /**
   * Advancing the mirror is the whole point of it: it has to be right BETWEEN renders,
   * which is exactly what the react-compiler rule forbids. One documented escape hatch,
   * used by the three call sites (render sync, commit, erase).
   */
  const setMirror = (next: Stroke[]) => {
    // eslint-disable-next-line react-hooks/immutability -- deliberate: correct between renders
    mirror.current = next;
  };
  useLayoutEffect(() => {
    setMirror(strokes);
  }, [strokes]);

  /** paint a single stroke onto the committed canvas immediately (no React round-trip) */
  const paintToBase = (s: Stroke) => {
    const c = baseRef.current;
    if (!c || viewport.w <= 0) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr * scale, dpr * scale);
    ctx.translate(-viewport.left / scale, -viewport.top / scale);
    const off = offsetFor ? offsetFor(s) : null;
    drawStroke(ctx, s, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0, alphaScale: alpha });
    if (drawn.current) drawn.current = { refs: [...drawn.current.refs, s], key: drawn.current.key };
  };

  // what the base canvas currently shows: the ids in order + the viewport/scale it was drawn for
  const baseKey = `${viewport.left}|${viewport.top}|${viewport.w}|${viewport.h}|${scale}|${dpr}|${alpha}|${highlightStrokeId ?? ""}|${selectedIds ? Array.from(selectedIds).join(",") : ""}|e${erasedNow ? erasedNow.size : -1}`;
  useEffect(() => {
    const prev = drawn.current;
    const c = baseRef.current;
    const samePrefix = (n: number) => !!prev && prev.refs.length >= n && strokes.slice(0, n).every((s, i) => prev.refs[i] === s);
    // already painted (commit paints eagerly) → nothing to do
    if (prev && prev.key === baseKey && prev.refs.length === strokes.length && samePrefix(strokes.length)) return;
    // append-only change with the same viewport → paint just the new strokes
    if (prev && c && prev.key === baseKey && strokes.length > prev.refs.length && samePrefix(prev.refs.length)) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr * scale, dpr * scale);
        ctx.translate(-viewport.left / scale, -viewport.top / scale);
        for (let i = prev.refs.length; i < strokes.length; i++) {
          const s = strokes[i];
          const off = offsetFor ? offsetFor(s) : null;
          drawStroke(ctx, s, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0, alphaScale: alpha });
        }
        drawn.current = { refs: strokes.slice(), key: baseKey };
        return;
      }
    }
    redrawBase();
    drawn.current = { refs: strokes.slice(), key: baseKey };
  }, [redrawBase, strokes, baseKey, dpr, scale, viewport, alpha, offsetFor]);

  // THE STROKE MIRROR — the `strokes` PROP is only as fresh as the last React render.
  // Writing letter by letter commits strokes faster than React re-renders, so building
  // the next list from the prop dropped whichever strokes were committed since that
  // render (his "incomplete scribbles"; the server still got them via the append queue,
  // so they reappeared on reload). Every commit/erase now reads and advances this mirror,
  // and the mirror re-syncs to the props on each render.
  // If this canvas unmounts mid-stroke — a page switch, a layout change, a rotation — the
  // stroke in flight is committed rather than lost with the component.
  const closeRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      closeRef.current?.();
    },
    [],
  );

  const redrawRef = useRef<(() => void) | null>(null);
  /** the continuous nib size — the eraser ring and every stroke width come from this */
  const widthMul = pen.widthMul ?? WIDTH_STEPS[pen.widthStep];
  // ONE source of truth for the eraser's size: the ring that is drawn and the catch test
  // that deletes read the same number, in page units.
  const eraseRadius = useCallback(() => (8 + widthMul * 5) / scale, [widthMul, scale]);
  const redrawLive = useCallback(() => {
    const c = liveRef.current;
    if (!c || viewport.w <= 0) return;
    const W = Math.round(viewport.w * dpr);
    const H = Math.round(viewport.h * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr * scale, dpr * scale);
    ctx.translate(-viewport.left / scale, -viewport.top / scale);
    const now = nowMs();
    // ghosts of consumed gestures evaporate over ~2s
    ghosts.current = ghosts.current.filter((g) => now - g.born < 2000);
    for (const g of ghosts.current) {
      const a = 0.75 * (1 - (now - g.born) / 2000);
      drawStroke(ctx, g.stroke, { alphaScale: Math.max(0, a) });
    }
    const st = cur.current;
    if (st && st.mode === "draw" && !st.dragging) drawStroke(ctx, st.stroke, { alphaScale: alpha });
    // ——— the eraser shows its work: a ring the true size of the eraser, and the strokes
    // it is about to take outlined underneath it. Visible from the instant it touches down.
    if (st && st.mode === "erase" && !st.dragging) {
      const tip = st.stroke.pts[st.stroke.pts.length - 1];
      const radius = eraseRadius(); // the SAME number the catch test uses — the ring cannot lie
      ctx.save();
      // what will go
      for (const s of mirror.current) {
        if (!st.erased.has(s.id)) continue;
        const off = offsetFor ? offsetFor(s) : null;
        drawStroke(ctx, s, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0, alphaScale: 0.28, colorOverride: "#B4533F" });
      }
      // the ring
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(180,83,63,0.10)";
      ctx.fill();
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = "#B4533F";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, radius + 1.5 / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; // a hairline so the ring reads on dark ink too
      ctx.stroke();
      ctx.restore();
    }
    if (st && st.mode === "lasso" && st.stroke.pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#A63D63";
      ctx.fillStyle = "#A63D6308";
      ctx.lineWidth = 1.2 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      ctx.beginPath();
      st.stroke.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (ghosts.current.length) requestAnimationFrame(() => redrawRef.current?.());
  }, [viewport, scale, dpr, alpha, offsetFor, eraseRadius]);
  /**
   * Claim the touch, in the one language UIKit listens to.
   *
   * `touch-action: none` tells WebKit "do not scroll here". It does NOT tell WebKit "the page
   * handled this touch" — those are two different signals feeding two different pieces of
   * machinery, and until now the app only ever sent the first. Calling preventDefault on a
   * NON-PASSIVE touchstart/touchmove is the second one: it is what stops iPadOS handing the
   * contact to Scribble or to a native recogniser that is still arbitrating.
   *
   * React attaches touch listeners passively, where preventDefault is a no-op, so this has to
   * be a native listener with { passive: false }. Scoped to the ink surface only, so the rail,
   * the popovers and typed fields keep every normal behaviour.
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !enabled) return;
    const claim = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
    };
    el.addEventListener("touchstart", claim, { passive: false });
    el.addEventListener("touchmove", claim, { passive: false });
    return () => {
      el.removeEventListener("touchstart", claim);
      el.removeEventListener("touchmove", claim);
    };
  }, [enabled]);
  useEffect(() => {
    redrawRef.current = redrawLive;
    redrawLive();
  }, [redrawLive]);

  useImperativeHandle(
    ref,
    () => ({
      renderPng: (opts = {}) => {
        if (typeof document === "undefined") return null;
        const region = opts.region ?? { x: 0, y: 0, w: width, h: height };
        const s = opts.scale ?? 1.25;
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(region.w * s));
        c.height = Math.max(1, Math.round(region.h * s));
        const ctx = c.getContext("2d");
        if (!ctx) return null;
        const bg = opts.background === undefined ? paper ?? "#FFFDF9" : opts.background;
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.scale(s, s);
        ctx.translate(-region.x, -region.y);
        for (const st of strokes) {
          const off = offsetFor ? offsetFor(st) : null;
          drawStroke(ctx, st, { offsetX: off?.x ?? 0, offsetY: off?.y ?? 0 });
        }
        return c.toDataURL("image/png");
      },
      clientToPage,
      pageToClient,
    }),
    [strokes, width, height, offsetFor, paper, clientToPage, pageToClient],
  );

  // ——— tool helpers ———
  const drawingTool = (): InkTool | null => {
    if (pen.tool === "fountain" || pen.tool === "gpen" || pen.tool === "pencil" || pen.tool === "marker") return pen.tool;
    if (pen.tool === "highlighter") return "marker";
    return null;
  };
  const strokeWidthFor = (tool: InkTool) => BRUSHES[tool].base * widthMul * (tool === "marker" && pen.tool === "highlighter" ? 2.2 : 1);

  const pressureOf = (e: React.PointerEvent | PointerEvent) => {
    if (e.pointerType === "pen") return Number.isFinite(e.pressure) && e.pressure > 0 ? e.pressure : 0.5;
    return 0.5;
  };

  const beginStroke = (e: React.PointerEvent) => {
    const p = clientToPage(e.clientX, e.clientY);
    const now = nowMs();
    const t0 = Date.now();
    const mode: "draw" | "erase" | "lasso" = pen.tool === "eraser" ? "erase" : pen.tool === "lasso" ? "lasso" : "draw";
    const tool = drawingTool() ?? "fountain";
    const stroke: Stroke = {
      id: newId(),
      tool,
      color: pen.tool === "highlighter" ? hlColor(pen.hlCategory) : pen.color,
      width: mode === "lasso" ? 1 : strokeWidthFor(tool),
      opacity: pen.opacity,
      t0,
      pts: [{ x: p.x, y: p.y, p: pressureOf(e), t: 0 }],
      recT: recordingSeconds(),
    };
    cur.current = {
      stroke,
      raw: [stroke.pts[0]],
      lastSmoothed: stroke.pts[0],
      clientPts: [{ x: e.clientX, y: e.clientY }],
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      t0: now,
      movedPx: 0,
      lastMoveAt: now,
      holdAnchor: stroke.pts[0],
      holdStart: now,
      mode,
      erased: new Set(),
      dragging: false,
    };
    if (mode === "erase") {
      // sweep at the landing point so the ring and its victims appear instantly
      for (const id of eraserSweep(mirror.current, [p], eraseRadius(), cur.current!.erased, offsetFor)) {
        cur.current!.erased.add(id);
      }
      if (cur.current!.erased.size) setErasedNow(new Set(cur.current!.erased));
      redrawLive();
    }
    if (holdTimer.current) clearTimeout(holdTimer.current);
    // hold→drag: any writing tool may hand off. The eraser and lasso never do — their drags
    // are destructive/selective and a hand-off would be a nasty surprise.
    const holdTool = pen.tool === "fountain" || pen.tool === "gpen" || pen.tool === "pencil" || pen.tool === "marker";
    if (onHold && holdTool && mode === "draw") {
      const pid = e.pointerId;
      const client = { x: e.clientX, y: e.clientY };
      holdTimer.current = setTimeout(() => {
        const st = cur.current;
        if (!st || st.pointerId !== pid || st.movedPx > 4) return; // a resting pen, not a slow start
        const took = onHold({ x: st.stroke.pts[0].x, y: st.stroke.pts[0].y, clientX: client.x, clientY: client.y, pointerType: st.pointerType });
        if (took) {
          st.dragging = true;
          st.stroke.pts = [st.stroke.pts[0]];
          redrawLive();
        }
      }, 600);
    }
  };

  const extendStroke = (e: React.PointerEvent) => {
    const st = cur.current;
    if (!st || e.pointerId !== st.pointerId) return;
    if (st.dragging) {
      onDragMove?.({ x: e.clientX, y: e.clientY });
      return;
    }
    const list: PointerEvent[] = typeof (e.nativeEvent as PointerEvent).getCoalescedEvents === "function" ? (e.nativeEvent as PointerEvent).getCoalescedEvents() : [];
    const events = list.length ? list : [e.nativeEvent as PointerEvent];
    const now = nowMs();
    // every coalesced sample's page point, so the erase sweep can run ONCE per event over all
    // of them instead of once per sample — same points tested, same strokes caught, C times
    // less work (a 240 Hz Pencil delivers 4-8 samples a frame)
    const swept: { x: number; y: number }[] = [];
    for (const ev of events) {
      const p = clientToPage(ev.clientX, ev.clientY);
      if (st.mode === "erase") swept.push(p);
      const last = st.raw[st.raw.length - 1];
      const dpx = Math.hypot((p.x - last.x) * scale, (p.y - last.y) * scale);
      st.movedPx += dpx;
      if (st.movedPx > 6 && holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      const pt: InkPoint = { x: p.x, y: p.y, p: pressureOf(ev), t: Date.now() - st.stroke.t0 };
      st.raw.push(pt);
      st.clientPts.push({ x: ev.clientX, y: ev.clientY });
      if (st.mode === "draw") {
        const sm = smooth(st.lastSmoothed, pt, pen.streamline);
        st.lastSmoothed = sm;
        st.stroke.pts.push(sm);
      } else {
        st.stroke.pts.push(pt);
      }
      // hold detection for QuickShape
      if (st.holdAnchor && Math.hypot((p.x - st.holdAnchor.x) * scale, (p.y - st.holdAnchor.y) * scale) > HOLD_PX) {
        st.holdAnchor = pt;
        st.holdStart = now;
      }
      st.lastMoveAt = now;
    }
    if (st.mode === "erase" && swept.length) {
      const caught = eraserSweep(mirror.current, swept, eraseRadius(), st.erased, offsetFor);
      if (caught.length) {
        for (const id of caught) st.erased.add(id);
        // it must feel like erasing: the ink goes NOW, not when the pen lifts
        setErasedNow(new Set(st.erased));
        onEraseTick?.();
      }
    }
    redrawLive();
  };

  /** end the open stroke using its own last point — for a lost capture or an overlapping contact */
  const closeStroke = (st: NonNullable<typeof cur.current>) => {
    const last = st.clientPts[st.clientPts.length - 1] ?? { x: 0, y: 0 };
    finishStroke({ pointerId: st.pointerId, clientX: last.x, clientY: last.y, pointerType: st.pointerType } as unknown as React.PointerEvent, false);
  };

  // the unmount cleanup calls through this ref (closeStroke is redefined every render)
  closeRef.current = () => {
    const st = cur.current;
    if (st) closeStroke(st);
  };

  const finishStroke = (e: React.PointerEvent, cancelled = false) => {
    const st = cur.current;
    if (!st || e.pointerId !== st.pointerId) return;
    cur.current = null;
    if (st.pointerType === "pen") penLeftAt.current = nowMs();
    penActive.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (st.dragging) {
      onDragEnd?.({ x: e.clientX, y: e.clientY }, cancelled);
      redrawLive();
      return;
    }
    const now = nowMs();
    const durationMs = now - st.t0;
    const clientStart = st.clientPts[0];
    const clientEnd = st.clientPts[st.clientPts.length - 1];
    if (cancelled) {
      setErasedNow(null);
      // A cancelled DRAWING always keeps, down to a single sample.
      //
      // pointercancel is not rare here and it is not the user's doing: it is what WebKit sends
      // when a NATIVE gesture recogniser wins the contact — the web view's scroll view, a
      // screen-edge back-swipe, Scribble. Arbitration is decided in the first samples, so the
      // strokes stolen this way are precisely the SHORT ones, and requiring more than two
      // points meant every stolen letter was deleted without a trace. That is what "it stops
      // writing" looked like from his side of the glass. A pen that touched paper made a mark;
      // there is no contact count at which it is safe to throw his ink away.
      if (st.mode === "draw" && st.stroke.pts.length > 0) {
        const cPts = st.stroke.pts;
        commit({ ...st.stroke, pts: cPts }, {
          kind: "stroke",
          pts: cPts,
          bounds: strokeBoundsOf(cPts),
          tool: pen.tool,
          clientStart,
          clientEnd,
          clientPts: st.clientPts,
        });
      }
      redrawLive();
      return;
    }

    // DISPLACEMENT from where it landed — movedPx is accumulated arc length, which a 240 Hz
    // Pencil racks up while standing still, so a real tap never registered.
    // the bounding box of everything he actually drew, in client px — see isTapContact
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of st.clientPts) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    const spanPx = st.clientPts.length ? Math.max(maxX - minX, maxY - minY) : 0;
    // An eraser contact that caught nothing and never moved was him reaching for a control
    // underneath (chapter chips, the navigator, play) — let it through, or the Bible's UI is
    // dead whenever the eraser is up.
    // ...but displacement ALONE cannot tell a tap from a loop: an "o", "a", "e", "d", "g", "0"
    // or "8" ends within a pixel or two of where it started. Using drift by itself turned every
    // closed letter into a dot. A tap is a contact that went nowhere AND travelled nowhere, so
    // both the displacement and the arc length have to be small.
    const isTap = isTapContact({ durationMs, spanPx, pointerType: st.pointerType });
    // An eraser contact that caught nothing and never moved was him reaching for a control
    // underneath (chapter chips, the navigator, play) — let it through, or the Bible's UI is
    // dead whenever the eraser is up. Judged on the SAME thresholds the tap branch will use,
    // so the two can never disagree and strand a contact that fires neither path.
    const eraserMissedAndStill = st.mode === "erase" && st.erased.size === 0 && isTap;
    if (st.mode === "erase" && !eraserMissedAndStill) {
      // handled by the erase branch below
    } else if (isTap) {
      const hit = onTap?.({ x: st.stroke.pts[0].x, y: st.stroke.pts[0].y, clientX: clientStart.x, clientY: clientStart.y, pointerType: st.pointerType });
      // belt and braces: a PEN that actually drew more than a dab keeps its ink even if
      // something claimed the tap. Ink is never destroyed by an ambiguous classification.
      const wasADab = st.raw.length <= 2;
      if ((hit && (st.pointerType !== "pen" || wasADab)) || st.mode !== "draw" || st.pointerType === "touch") {
        redrawLive();
        return;
      }
      // A pen tap on nothing is a dot — but ONLY if it really was a dab. Anything with more
      // samples than that is a mark he made, and truncating it to its first point is the
      // silent handwriting loss this whole classifier exists to prevent. Keep every point.
      const wasADot = st.raw.length <= 2;
      const kept: Stroke = wasADot ? { ...st.stroke, pts: [st.stroke.pts[0]] } : st.stroke;
      commit(kept, { kind: wasADot ? "dot" : "stroke", pts: kept.pts, bounds: strokeBoundsOf(kept.pts), tool: pen.tool, clientStart, clientEnd, clientPts: st.clientPts });
      redrawLive();
      return;
    }
    if (st.mode === "erase") {
      setErasedNow(null);
      if (st.erased.size && onStrokesChange) {
        const rm = st.erased;
        const next = mirror.current.filter((s) => !rm.has(s.id));
        setMirror(next);
        onStrokesChange(next, { removed: Array.from(rm) });
      }
      redrawLive();
      return;
    }
    if (st.mode === "lasso") {
      const poly = st.stroke.pts;
      onLasso?.(strokesInLasso(mirror.current, poly), poly, strokeBoundsOf(poly));
      redrawLive();
      return;
    }
    // QuickShape: held still at the end for HOLD_MS → snap. OFF by default — it was turning
    // slowly-written letters into perfect ellipses and straight lines (o, l, d…).
    let pts = st.stroke.pts;
    const held = quickShape && now - st.holdStart > HOLD_MS && durationMs > 450;
    if (held) {
      if (isClosedLoop(pts)) pts = snapToEllipse(pts);
      else if (isUnderline(pts) || (strokeBoundsOf(pts).w > 60 && !isClosedLoop(pts))) {
        const b = strokeBoundsOf(pts);
        if (b.h < b.w * 0.2 || b.w < b.h * 0.2) pts = snapToLine(pts);
      }
    }
    const stroke: Stroke = { ...st.stroke, pts };
    let kind: GestureKind = "stroke";
    if (isClosedLoop(pts)) kind = "loop";
    else if (isTick(pts)) kind = "tick";
    else if (isUnderline(pts)) kind = "underline";
    else if (isStrike(pts)) kind = "strike";
    const info: StrokeEndInfo = { kind, pts, bounds: strokeBoundsOf(pts), tool: pen.tool, clientStart, clientEnd, clientPts: st.clientPts };
    if (pen.tool === "highlighter" && onHighlighterStroke) {
      // decide the region FIRST: margin ink always keeps, highlighter included
      if (regionFor) stroke.region = regionFor({ x: stroke.pts[0].x, y: stroke.pts[0].y }, clientStart);
      const verdict = onHighlighterStroke(stroke, info);
      if (verdict === "keep") {
        // final — do NOT consult onStrokeEnd, whose gesture rules would discard the band
        commit(stroke, info, true);
      } else {
        ghosts.current.push({ stroke: { ...stroke, width: stroke.width }, born: nowMs() });
      }
      redrawLive();
      return;
    }
    commit(stroke, info);
    redrawLive();
  };

  const commit = (stroke: Stroke, info: StrokeEndInfo, decided = false) => {
    const pt0 = stroke.pts[0];
    if (!stroke.region && regionFor) stroke.region = regionFor({ x: pt0.x, y: pt0.y }, info.clientStart);
    const verdict = decided ? "keep" : onStrokeEnd ? onStrokeEnd(stroke, info) : "keep";
    if (verdict === "discard") {
      penTrace.record("up", { pointerType: "pen", pointerId: -1 }, { dropped: `onStrokeEnd discarded a ${info.kind}`, points: stroke.pts.length });
      ghosts.current.push({ stroke, born: nowMs() });
      return;
    }
    penTrace.committed();
    if (anchorFor) stroke.anchor = anchorFor({ x: pt0.x, y: pt0.y }, info.clientStart) ?? null;
    const next = [...mirror.current, stroke];
    setMirror(next);
    // paint it onto the committed layer NOW: the live layer is about to be cleared and
    // React may not repaint for another frame or two — the ink must never blink out
    paintToBase(stroke);
    onStrokesChange?.(next, { appended: [stroke] });
  };

  // ——— pointer plumbing ———
  /** contacts that PAN and TAP instead of drawing: fingers, and everything while the Hand tool is up */
  const pans = (e: React.PointerEvent) => pen.tool === "hand" || (e.pointerType === "touch" && !fingerDraws);
  /**
   * A contact's ROLE is decided once, at touch-down, and never revisited. Switching tools
   * with the pen still on the glass used to flip pans() mid-stroke, stranding the stroke and
   * latching penActive true — after which no finger worked on that canvas again.
   */
  const routeOf = useRef<Map<number, "ink" | "pan">>(new Map());
  // contacts the palm guard rejected, held briefly in case a second one proves them a pinch
  const quarantine = useRef<Map<number, { x: number; y: number; t: number }>>(new Map());
  /** contacts that only got in via quarantine promotion — allowed to pinch, never to tap */
  const promoted = useRef<Set<number>>(new Set());
  const pinchEndedAt = useRef(0);
  const routed = (e: React.PointerEvent) => routeOf.current.get(e.pointerId) ?? (pans(e) ? "pan" : "ink");
  const onPointerDown = (e: React.PointerEvent) => {
    penTrace.record("down", e);
    if (!enabled) return;
    const wrap = wrapRef.current;
    routeOf.current.set(e.pointerId, pans(e) ? "pan" : "ink");
    if (routed(e) === "pan") {
      // a resting palm is a palm whatever tool is up; but a finger arriving while another is
      // already down is a deliberate gesture (pinch, undo tap) and must get through
      if (e.pointerType === "touch" && touches.current.size === 0 && (penActive.current || nowMs() - penLeftAt.current < PALM_AFTER_PEN_MS)) {
        // Quarantine rather than discard. ONE contact just after a pen lift is a resting
        // palm. TWO within PALM_PROMOTE_MS is a pinch he means — and discarding the first
        // one is why zooming right after writing a word silently became a scroll.
        const t0 = nowMs();
        for (const [id, q] of quarantine.current) if (t0 - q.t > PALM_PROMOTE_MS) quarantine.current.delete(id);
        quarantine.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: t0 });
        // Promote ONLY once the pen is off the glass. While he is writing, a settling hand
        // puts down a heel and a pinky edge milliseconds apart — that is two contacts, and
        // promoting them panned the page out from under the live stroke and could even fire
        // the two-finger undo on the word he had just written. The quarantine exists for
        // "lifts the pen, then pinches", which is the penLeftAt window, never penActive.
        if (quarantine.current.size >= 2 && !penActive.current && !cur.current) {
          for (const [id, q] of quarantine.current) {
            touches.current.set(id, { x: q.x, y: q.y, sx: q.x, sy: q.y, t: q.t, moved: 0 });
            promoted.current.add(id);
          }
          quarantine.current.clear();
          // deliberately NOT advancing maxTouches: promoted contacts may only pinch. The
          // two-finger tap is destructive (undo) and must never be reachable from a palm.
          const [a, b] = Array.from(touches.current.values());
          pinch.current = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
          widenForGesture();
          // capture EVERY promoted contact — the first one never reached the normal capture
          // path, so a pinch that shrinks the canvas out from under it would strand it in
          // `touches` forever and kill finger gestures for the rest of the session.
          for (const id of touches.current.keys()) capture(wrap, id);
        }
        return;
      }
      quarantine.current.delete(e.pointerId);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: nowMs(), moved: 0 });
      if (touches.current.size === 1 && onSelectDragStart?.({ x: e.clientX, y: e.clientY })) {
        // a finger on the verse gutter drags a range instead of scrolling
        selDrag.current = { id: e.pointerId, from: { x: e.clientX, y: e.clientY } };
        capture(wrap, e.pointerId);
        return;
      }
      // press and hold with one finger → the same hand-off the pen gets (his "click and hold")
      if (onHold && touches.current.size === 1) {
        const pid = e.pointerId;
        const client = { x: e.clientX, y: e.clientY };
        if (touchHold.current) clearTimeout(touchHold.current);
        touchHold.current = setTimeout(() => {
          const t = touches.current.get(pid);
          if (!t || t.moved > 8 || touches.current.size !== 1) return;
          const pg = clientToPage(client.x, client.y);
          if (onHold({ x: pg.x, y: pg.y, clientX: client.x, clientY: client.y, pointerType: "touch" })) {
            touchDrag.current = pid;
          }
        }, 380);
      }
      maxTouches.current = Math.max(maxTouches.current, touches.current.size);
      if (touches.current.size === 2) {
        const [a, b] = Array.from(touches.current.values());
        pinch.current = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        widenForGesture();
      }
      capture(wrap, e.pointerId);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (cur.current) {
      // a new contact while the last stroke is still open — iPadOS can deliver the next
      // pointerdown before the previous pointerup when he writes letter by letter. The old
      // stroke ends where it was; the new one starts now. Never drop a contact.
      if (cur.current.pointerId === e.pointerId) return;
      closeStroke(cur.current);
    }
    if (e.pointerType === "pen") {
      penActive.current = true;
      // drop any contact the hand left on the glass — it must not pan or fire undo mid-word
      touches.current.clear();
      maxTouches.current = 0;
      if (touchHold.current) {
        clearTimeout(touchHold.current);
        touchHold.current = null;
      }
    }
    try {
      capture(wrap, e.pointerId);
    } catch {
      // a contact that already ended — the events still arrive
    }
    beginStroke(e);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (penTrace.enabled) {
      const ne = e.nativeEvent as PointerEvent;
      penTrace.record("move", e, { coalesced: typeof ne.getCoalescedEvents === "function" ? ne.getCoalescedEvents().length : 0 });
    }
    if (!enabled) return;
    if (routed(e) === "pan") {
      const t = touches.current.get(e.pointerId);
      if (!t) {
        return;
      }
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.moved += Math.hypot(dx, dy);
      t.x = e.clientX;
      t.y = e.clientY;
      if (selDrag.current?.id === e.pointerId) {
        onSelectDragMove?.(selDrag.current.from, { x: e.clientX, y: e.clientY });
        return;
      }
      if (touchDrag.current === e.pointerId) {
        onDragMove?.({ x: e.clientX, y: e.clientY });
        return;
      }
      if (t.moved > 8 && touchHold.current) {
        clearTimeout(touchHold.current);
        touchHold.current = null;
      }
      if (touches.current.size === 1) {
        // the finger left over from a pinch must not yank the page as the other lifts
        if (nowMs() - pinchEndedAt.current < PAN_AFTER_PINCH_MS) return;
        scrollRef?.current?.scrollBy(-dx, -dy);
      } else if (touches.current.size === 2 && pinch.current) {
        const [a, b] = Array.from(touches.current.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // cumulative — and the midpoint travels, so a pinch that also moves pans the page
        onZoom?.(d / pinch.current.d0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      return;
    }
    if (cur.current) {
      extendStroke(e);
      return;
    }
    // RESUME AFTER A STOLEN CONTACT.
    //
    // pointercancel and lostpointercapture end the stroke, but they do NOT lift the pen — it is
    // still on the glass, still moving, and every subsequent pointermove used to fall through
    // to the inert hover branch below. The nib kept travelling and nothing appeared until he
    // lifted and re-landed. That is, word for word, "it becomes unresponsive and it stops
    // writing." A cancel should cost a seam in one letter, never the rest of the contact.
    if (e.pointerType === "pen" && e.buttons !== 0 && routed(e) === "ink") {
      beginStroke(e);
      return;
    }
    if (e.pointerType === "pen" && e.buttons === 0 && onHover) {
      const p = clientToPage(e.clientX, e.clientY);
      onHover({ x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY });
    }
  };

  const onPointerUp = (e: React.PointerEvent, cancelled = false) => {
    penTrace.record(cancelled ? "cancel" : "up", e, { points: cur.current?.stroke.pts.length ?? 0 });
    const route = routed(e);
    routeOf.current.delete(e.pointerId);
    quarantine.current.delete(e.pointerId);
    const wasPromoted = promoted.current.delete(e.pointerId);
    if (route === "pan") {
      const t = touches.current.get(e.pointerId);
      touches.current.delete(e.pointerId);
      // a palm that got in only to complete a pinch never counts as a deliberate tap
      if (wasPromoted) maxTouches.current = 0;
      if (touchHold.current) {
        clearTimeout(touchHold.current);
        touchHold.current = null;
      }
      // the gesture counters must be cleared on EVERY exit, or a later single tap is
      // mistaken for the two-finger undo and deletes the stroke he just wrote
      if (touches.current.size === 0 && (selDrag.current?.id === e.pointerId || touchDrag.current === e.pointerId)) {
        maxTouches.current = 0;
      }
      if (selDrag.current?.id === e.pointerId) {
        selDrag.current = null;
        onSelectDragEnd?.();
        return;
      }
      if (touchDrag.current === e.pointerId) {
        touchDrag.current = null;
        onDragEnd?.({ x: e.clientX, y: e.clientY }, cancelled);
        return;
      }
      if (touches.current.size < 2 && pinch.current) {
        pinch.current = null;
        pinchEndedAt.current = nowMs();
        onZoomEnd?.();
        restoreAfterGesture();
      }
      if (t && touches.current.size === 0) {
        const quick = nowMs() - t.t < 260 && t.moved < 10;
        const n = maxTouches.current;
        maxTouches.current = 0;
        if (quick && n === 1) {
          const p = clientToPage(e.clientX, e.clientY);
          onTap?.({ x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY, pointerType: "touch" });
        } else if (quick && (n === 2 || n >= 3)) {
          // never let a hand that is still holding the pen undo his writing
          const penIsInPlay = penActive.current || nowMs() - penLeftAt.current < DESTRUCTIVE_AFTER_PEN_MS;
          if (!penIsInPlay) {
            if (n === 2) onUndoGesture?.();
            else onRedoGesture?.();
          }
        }
      }
      return;
    }
    finishStroke(e, cancelled);
  };

  const onPointerLeave = () => {
    onHover?.(null);
  };

  const bgStyle: CSSProperties =
    background === "dots"
      ? { background: paper ?? "#FFFDF9", backgroundImage: "radial-gradient(#EBE6E1 1px, transparent 1.2px)", backgroundSize: `${22 * scale}px ${22 * scale}px` }
      : background === "lined"
        ? { background: `repeating-linear-gradient(${paper ?? "#FFFDF9"} 0 ${31 * scale}px, #F0EAE4 ${31 * scale}px ${32 * scale}px)` }
        : background === "grid"
          ? { background: paper ?? "#FFFDF9", backgroundImage: `linear-gradient(#EDE7E0 1px, transparent 1px), linear-gradient(90deg, #EDE7E0 1px, transparent 1px)`, backgroundSize: `${24 * scale}px ${24 * scale}px` }
          : background === "paper"
            ? { background: paper ?? "#FFFEFB" }
            : background === "blank"
              ? { background: paper ?? "#FFFFFF" }
              : {};

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: "relative",
        width: width * scale,
        height: height * scale,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: enabled ? (pen.tool === "hand" ? "grab" : pen.tool === "eraser" ? "cell" : "crosshair") : "default",
        ...bgStyle,
        ...style,
      }}
      data-ink-canvas=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e)}
      onPointerCancel={(e) => onPointerUp(e, true)}
      // a lost capture is a STOLEN contact, not a lift — route it through the cancelled path so
      // the ink is kept whole, and let the resume above pick the stroke back up if the pen is
      // still down
      onLostPointerCapture={(e) => { penTrace.record("lostcapture", e); const st = cur.current; if (st && st.pointerId === e.pointerId) onPointerUp(e, true); }}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* objects — rendered in page units, scaled as a block; non-interactive (taps route through the canvas) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
      <canvas
        ref={baseRef}
        style={{ position: "absolute", left: viewport.left, top: viewport.top, width: viewport.w, height: viewport.h, pointerEvents: "none" }}
      />
      <canvas
        ref={liveRef}
        style={{ position: "absolute", left: viewport.left, top: viewport.top, width: viewport.w, height: viewport.h, pointerEvents: "none" }}
      />
    </div>
  );
});
