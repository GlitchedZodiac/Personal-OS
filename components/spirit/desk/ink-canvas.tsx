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
  strokeDistanceTo,
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
  onUndoGesture?: () => void;
  onRedoGesture?: () => void;
  onZoom?: (factor: number, center: { x: number; y: number }) => void;
  /** the pinch lifted — commit the live zoom */
  onZoomEnd?: () => void;
  selectedIds?: Set<string> | null;
  highlightStrokeId?: string | null;
  /** overlay: anchor a finished stroke to a verse (page coords in) */
  anchorFor?: (pt: { x: number; y: number }, clientPt: { x: number; y: number }) => Stroke["anchor"] | null;
  offsetFor?: (s: Stroke) => { x: number; y: number } | null;
  regionFor?: (pt: { x: number; y: number }, clientPt: { x: number; y: number }) => "text" | "margin";
  fingerDraws?: boolean;
  /** press-hold with no movement: return true to take the pointer over as a drag (ref card in flight) */
  onHold?: (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => boolean | void;
  onDragMove?: (client: { x: number; y: number }) => void;
  onDragEnd?: (client: { x: number; y: number }, cancelled: boolean) => void;
  style?: CSSProperties;
  className?: string;
  /** the page's paper color (for thumbnails/exports) */
  paper?: string;
}

const TAP_MS = 320;
const TAP_PX = 7;
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
    onHold,
    onDragMove,
    onDragEnd,
    style,
    className,
    paper,
  } = props;
  const desk = useDesk();
  const { pen, recordingSeconds } = desk;
  const penActive = useRef(false); // palm rejection is per canvas: touch is inert while this canvas's pen is down
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

  const clientToPage = useCallback(
    (cx: number, cy: number) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
    },
    [scale],
  );
  const pageToClient = useCallback(
    (x: number, y: number) => {
      const el = wrapRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + x * scale, y: r.top + y * scale };
    },
    [scale],
  );

  // ——— viewport tracking (canvases follow the scroll) ———
  const measure = useCallback(() => {
    const sc = scrollRef?.current;
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (sc) {
      const sr = sc.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const left = Math.max(0, sr.left - wr.left);
      const top = Math.max(0, sr.top - wr.top);
      const w = Math.min(sr.width, wr.width - left);
      const h = Math.min(sr.height, wr.height - top);
      setViewport((v) => (v.left === left && v.top === top && v.w === w && v.h === h ? v : { left, top, w: Math.max(0, w), h: Math.max(0, h) }));
    } else {
      const wr = wrap.getBoundingClientRect();
      setViewport((v) => (v.w === wr.width && v.h === wr.height && v.left === 0 && v.top === 0 ? v : { left: 0, top: 0, w: wr.width, h: wr.height }));
    }
  }, [scrollRef]);

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
    for (const s of strokes) {
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
  }, [strokes, viewport, scale, dpr, selectedIds, highlightStrokeId, alpha, offsetFor]);

  useEffect(() => {
    redrawBase();
  }, [redrawBase]);

  const redrawRef = useRef<(() => void) | null>(null);
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
  }, [viewport, scale, dpr, alpha]);
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
  const widthMul = pen.widthMul ?? WIDTH_STEPS[pen.widthStep];
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
    if (holdTimer.current) clearTimeout(holdTimer.current);
    // hold→drag is a pen gesture: the highlighter, eraser and lasso never hand off
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
    for (const ev of events) {
      const p = clientToPage(ev.clientX, ev.clientY);
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
      if (st.mode === "erase") {
        const radius = (8 + widthMul * 5) / scale;
        for (const s of strokes) {
          if (st.erased.has(s.id)) continue;
          const off = offsetFor ? offsetFor(s) : null;
          if (strokeDistanceTo(s, p.x - (off?.x ?? 0), p.y - (off?.y ?? 0)) < radius + s.width) st.erased.add(s.id);
        }
      }
    }
    redrawLive();
  };

  const finishStroke = (e: React.PointerEvent, cancelled = false) => {
    const st = cur.current;
    if (!st || e.pointerId !== st.pointerId) return;
    cur.current = null;
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
      redrawLive();
      return;
    }
    // tap?
    if (durationMs < TAP_MS && st.movedPx < TAP_PX) {
      const hit = onTap?.({ x: st.stroke.pts[0].x, y: st.stroke.pts[0].y, clientX: clientStart.x, clientY: clientStart.y, pointerType: st.pointerType });
      if (hit || st.mode !== "draw" || st.pointerType === "touch") {
        redrawLive();
        return;
      }
      // a pen tap on nothing: a dot
      const dot: Stroke = { ...st.stroke, pts: [st.stroke.pts[0]] };
      commit(dot, { kind: "dot", pts: dot.pts, bounds: strokeBoundsOf(dot.pts), tool: pen.tool, clientStart, clientEnd, clientPts: st.clientPts });
      redrawLive();
      return;
    }
    if (st.mode === "erase") {
      if (st.erased.size && onStrokesChange) {
        const rm = st.erased;
        onStrokesChange(strokes.filter((s) => !rm.has(s.id)), { removed: Array.from(rm) });
      }
      redrawLive();
      return;
    }
    if (st.mode === "lasso") {
      const poly = st.stroke.pts;
      onLasso?.(strokesInLasso(strokes, poly), poly, strokeBoundsOf(poly));
      redrawLive();
      return;
    }
    // QuickShape: held still at the end for HOLD_MS → snap
    let pts = st.stroke.pts;
    const held = now - st.holdStart > HOLD_MS && durationMs > 450;
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
      const verdict = onHighlighterStroke(stroke, info);
      if (verdict === "keep") {
        // the highlighter is real ink now: a translucent band in the category colour that stays
        commit(stroke, info);
      } else {
        ghosts.current.push({ stroke: { ...stroke, width: stroke.width }, born: nowMs() });
      }
      redrawLive();
      return;
    }
    commit(stroke, info);
    redrawLive();
  };

  const commit = (stroke: Stroke, info: StrokeEndInfo) => {
    const pt0 = stroke.pts[0];
    if (regionFor) stroke.region = regionFor({ x: pt0.x, y: pt0.y }, info.clientStart);
    const verdict = onStrokeEnd ? onStrokeEnd(stroke, info) : "keep";
    if (verdict === "discard") {
      ghosts.current.push({ stroke, born: nowMs() });
      return;
    }
    if (anchorFor) stroke.anchor = anchorFor({ x: pt0.x, y: pt0.y }, info.clientStart) ?? null;
    onStrokesChange?.([...strokes, stroke], { appended: [stroke] });
  };

  // ——— pointer plumbing ———
  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    const wrap = wrapRef.current;
    if (e.pointerType === "touch" && !fingerDraws) {
      if (penActive.current) return; // palm
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: nowMs(), moved: 0 });
      maxTouches.current = Math.max(maxTouches.current, touches.current.size);
      if (touches.current.size === 2) {
        const [a, b] = Array.from(touches.current.values());
        pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
      wrap?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (cur.current) return; // one stroke at a time
    if (e.pointerType === "pen") penActive.current = true;
    wrap?.setPointerCapture(e.pointerId);
    beginStroke(e);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "touch" && !fingerDraws) {
      const t = touches.current.get(e.pointerId);
      if (!t) {
        return;
      }
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.moved += Math.hypot(dx, dy);
      t.x = e.clientX;
      t.y = e.clientY;
      if (touches.current.size === 1) {
        scrollRef?.current?.scrollBy(-dx, -dy);
      } else if (touches.current.size === 2 && pinch.current) {
        const [a, b] = Array.from(touches.current.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.d0 > 0 && Math.abs(d - pinch.current.d0) > 2) {
          const f = d / pinch.current.d0;
          pinch.current.d0 = d;
          onZoom?.(f, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
      return;
    }
    if (cur.current) {
      extendStroke(e);
      return;
    }
    if (e.pointerType === "pen" && e.buttons === 0 && onHover) {
      const p = clientToPage(e.clientX, e.clientY);
      onHover({ x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY });
    }
  };

  const onPointerUp = (e: React.PointerEvent, cancelled = false) => {
    if (e.pointerType === "touch" && !fingerDraws) {
      const t = touches.current.get(e.pointerId);
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2 && pinch.current) {
        pinch.current = null;
        onZoomEnd?.();
      }
      if (t && touches.current.size === 0) {
        const quick = nowMs() - t.t < 260 && t.moved < 10;
        const n = maxTouches.current;
        maxTouches.current = 0;
        if (quick && n === 1) {
          const p = clientToPage(e.clientX, e.clientY);
          onTap?.({ x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY, pointerType: "touch" });
        } else if (quick && n === 2) onUndoGesture?.();
        else if (quick && n >= 3) onRedoGesture?.();
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
        cursor: enabled ? (pen.tool === "eraser" ? "cell" : "crosshair") : "default",
        ...bgStyle,
        ...style,
      }}
      data-ink-canvas=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e)}
      onPointerCancel={(e) => onPointerUp(e, true)}
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
