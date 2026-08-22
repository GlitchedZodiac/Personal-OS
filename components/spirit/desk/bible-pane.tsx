"use client";

// The Bible pane (02 · 05 · 07): the Reader, hosted, with a pen.
//
// Two modes, toggled from the pen settings and echoed in the header:
// STUDY — pen marks on the text column are gestures that evaporate (circle
// = select the range, tick/strike = accept/dismiss a suggested mark);
// SCRATCH — the chapter freezes like print and every stroke keeps. The
// overlay is orthogonal (05): one ink layer over the whole page; margin
// ink ALWAYS keeps. The highlighter is the only thing that creates a
// highlight (tap a verse number = whole verse, drag = span). Hover shows
// the rail + "which tool" chip; a press-hold on a verse lifts a reference
// card across the seam. Nothing floats over text.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SpiritReader, type SpiritReaderHandle } from "@/components/spirit/reader";
import { InkCanvas, type InkCanvasHandle, type StrokeEndInfo } from "./ink-canvas";
import { useDesk, useDeskEvent, hlColor } from "./desk-state";
import { ActionBarA, ActionBarB, type BarAction } from "./action-bar";
import { RefCardGhost } from "./ref-card";
import { RefPopover, type RefPopoverState } from "./ref-popover";
import { PaneHeader, Chip, Segmented, Popover, Kicker } from "./ui";
import { EyeIcon, LayersIcon, MarginIcon, PinIcon, PenIcon } from "./desk-icons";
import { formatRef, refParts, BOOKS } from "@/lib/bible-refs";
import { type Stroke } from "@/lib/ink";

const MARGIN_W = [26, 122, 170] as const;
const MARGIN_LABEL = ["MARGIN · NONE", "MARGIN · WIDE", "MARGIN · WIDER"] as const;

export interface BiblePaneProps {
  role: "main" | "reference";
  query: string | null;
  onQueryChange: (q: string) => void;
  free?: boolean;
  dayId?: string | null;
  /** the context layer available on this chapter ("This study · wk 3" / "Sermon · Aug 23") */
  layerContext?: { key: string; label: string } | null;
  onKicker?: () => void;
  headerExtra?: ReactNode;
}

interface OverlayPage {
  id: string;
  chapterKey: number;
  layerKey: string;
  strokes: Stroke[];
  layout: Record<string, unknown> | null;
}

// the ink layer (canvas + its pointer wrapper) sits over the text: hit-tests look through it
function isInkLayer(el: Element) {
  return el instanceof HTMLCanvasElement || Boolean((el as HTMLElement).closest?.("[data-ink-canvas]"));
}

function verseElAt(clientX: number, clientY: number): HTMLElement | null {
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    if (isInkLayer(el)) continue;
    const v = (el as HTMLElement).closest?.("[data-verse]") as HTMLElement | null;
    if (v) return v;
  }
  return null;
}
function refOf(el: HTMLElement | null): number | null {
  const v = el?.getAttribute("data-verse");
  return v ? Number(v) : null;
}

export function BiblePane({ role, query, onQueryChange, free, dayId, layerContext, onKicker, headerExtra }: BiblePaneProps) {
  const desk = useDesk();
  const { pen, bibleMode, setBibleMode, overlayVisibility, setOverlayVisibility, overlayMargin, setOverlayMargin, hand, prefs, emit } = desk;
  const readerRef = useRef<SpiritReaderHandle | null>(null);
  const canvasRef = useRef<InkCanvasHandle | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState<string>(query ?? "");
  const [chapterKey, setChapterKey] = useState<number | null>(null);
  const [sel, setSel] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [barAnchor, setBarAnchor] = useState<{ x: number; y: number } | null>(null);
  const scrolledTo = useRef<string | null>(null);
  const [showChips, setShowChips] = useState(false);
  const [hover, setHover] = useState<{ left: number; top: number; width: number; num: number } | null>(null);
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number } | null>(null);
  const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
  const [overlay, setOverlay] = useState<OverlayPage | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [layerKey, setLayerKey] = useState<string>("my");
  const [layers, setLayers] = useState<{ layerKey: string; strokeCount: number }[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [unpinned, setUnpinned] = useState(false);
  const [inkChapters, setInkChapters] = useState<Set<number>>(new Set());
  const [popover, setPopover] = useState<RefPopoverState | null>(null);
  const [drag, setDrag] = useState<{ refStart: number; refEnd: number; label: string; text: string; x: number; y: number; hot: boolean } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const pending = useRef<{ append: Stroke[]; remove: string[] }>({ append: [], remove: [] });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef<Promise<OverlayPage | null> | null>(null);
  const lastTapClient = useRef<{ x: number; y: number } | null>(null);

  const marginPx = MARGIN_W[overlayMargin];
  const marginSide: "left" | "right" = hand === "left" ? "left" : "right";
  const pinned = strokes.length > 0 && !unpinned;
  const alpha = overlayVisibility === "show" ? 1 : overlayVisibility === "dim" ? 0.22 : 0;

  // ——— desk events: open in the reference Bible / main ———
  useDeskEvent(
    (e) => {
      if (e.type === "open-reference" && role === "reference") {
        setHistory((h) => (query ? [...h, query].slice(-12) : h));
        onQueryChange(e.q);
      } else if (e.type === "open-main" && role === "main") {
        onQueryChange(e.q);
      } else if (e.type === "jump-reference-pane" && role === "reference") {
        const p = refParts(e.refStart);
        const book = BOOKS[p.book - 1];
        setHistory((h) => (query ? [...h, query].slice(-12) : h));
        onQueryChange(`${book} ${p.chapter}`);
        setTimeout(() => readerRef.current?.select(e.refStart, e.refEnd ?? null), 500);
      }
    },
    [role, query, onQueryChange],
  );

  // ——— content size → overlay canvas size ———
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContentSize({ w: el.clientWidth, h: el.scrollHeight }));
    ro.observe(el);
    setContentSize({ w: el.clientWidth, h: el.scrollHeight });
    return () => ro.disconnect();
  }, []);

  // ——— overlay load per chapter + layer ———
  const loadOverlay = useCallback(async (ck: number, lk: string) => {
    try {
      const [pageRes, layersRes] = await Promise.all([
        fetch(`/api/spirit/ink?kind=overlay&chapterKey=${ck}&layerKey=${encodeURIComponent(lk)}&full=1&take=1`),
        fetch(`/api/spirit/ink?kind=overlay&chapterKey=${ck}&take=20`),
      ]);
      const pageBody = pageRes.ok ? await pageRes.json() : { pages: [] };
      const layersBody = layersRes.ok ? await layersRes.json() : { pages: [] };
      const page = pageBody.pages?.[0] ?? null;
      setOverlay(page ? { id: page.id, chapterKey: ck, layerKey: lk, strokes: (page.strokes ?? []) as Stroke[], layout: page.layout ?? null } : null);
      setStrokes(page ? ((page.strokes ?? []) as Stroke[]) : []);
      setLayers((layersBody.pages ?? []).map((p: { layerKey: string; strokeCount: number }) => ({ layerKey: p.layerKey, strokeCount: p.strokeCount })));
      setUnpinned(false);
      pending.current = { append: [], remove: [] };
    } catch {
      // offline — the Bible still reads
    }
  }, []);
  useEffect(() => {
    if (chapterKey) void loadOverlay(chapterKey, layerKey);
  }, [chapterKey, layerKey, loadOverlay]);
  useEffect(() => {
    fetch("/api/spirit/ink?kind=overlay&take=500")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const set = new Set<number>();
        for (const p of d?.pages ?? []) if (p.strokeCount > 0 && typeof p.chapterKey === "number") set.add(p.chapterKey);
        setInkChapters(set);
      })
      .catch(() => {});
  }, []);

  const flush = useCallback(async () => {
    if (!chapterKey) return;
    const { append, remove } = pending.current;
    if (!append.length && !remove.length) return;
    pending.current = { append: [], remove: [] };
    let page = overlay;
    if (!page) {
      if (!creating.current) {
        const book = BOOKS[Math.floor(chapterKey / 1000) - 1];
        creating.current = fetch("/api/spirit/ink", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "overlay", chapterKey, layerKey, title: `${book} ${chapterKey % 1000} · ${layerKey === "my" ? "my layer" : layerContext?.label ?? layerKey}`, layout: { pinnedAt: new Date().toISOString() } }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => (d?.page ? { id: d.page.id, chapterKey, layerKey, strokes: [], layout: d.page.layout ?? null } : null))
          .catch(() => null);
      }
      page = await creating.current;
      creating.current = null;
      if (!page) {
        pending.current = { append: [...append, ...pending.current.append], remove: [...remove, ...pending.current.remove] };
        return;
      }
      setOverlay(page);
    }
    await fetch(`/api/spirit/ink/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appendStrokes: append, removeStrokeIds: remove }),
    }).catch(() => {
      pending.current = { append: [...append, ...pending.current.append], remove: [...remove, ...pending.current.remove] };
    });
    setInkChapters((s) => new Set([...Array.from(s), chapterKey]));
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.layerKey === layerKey);
      const count = strokes.length;
      if (i < 0) return [...ls, { layerKey, strokeCount: count }];
      const copy = ls.slice();
      copy[i] = { layerKey, strokeCount: count };
      return copy;
    });
  }, [chapterKey, overlay, layerKey, layerContext, strokes.length]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1100);
  }, [flush]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ——— geometry helpers ———
  const relRect = (el: HTMLElement) => {
    const c = contentRef.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
  };
  const anchorFor = useCallback((pt: { x: number; y: number }, client: { x: number; y: number }) => {
    let el = verseElAt(client.x, client.y);
    if (!el && contentRef.current) {
      // nearest verse vertically (margin ink)
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      contentRef.current.querySelectorAll<HTMLElement>("[data-verse]").forEach((v) => {
        const r = relRect(v);
        const d = Math.abs(r.top + r.height / 2 - pt.y);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      });
      el = best;
    }
    if (!el) return null;
    const ref = refOf(el);
    if (!ref) return null;
    const r = relRect(el);
    return { ref, dx: pt.x - r.left, dy: pt.y - r.top };
  }, []);
  const offsetFor = useCallback((s: Stroke) => {
    if (!s.anchor || !contentRef.current) return null;
    const el = contentRef.current.querySelector<HTMLElement>(`#v-${s.anchor.ref}`);
    if (!el) return null;
    const r = relRect(el);
    const p0 = s.pts[0];
    return { x: r.left + s.anchor.dx - p0.x, y: r.top + s.anchor.dy - p0.y };
  }, []);
  const regionFor = useCallback((_pt: { x: number; y: number }, client: { x: number; y: number }) => {
    const els = document.elementsFromPoint(client.x, client.y);
    return els.some((el) => !isInkLayer(el) && (el as HTMLElement).closest?.("[data-text-column]")) ? ("text" as const) : ("margin" as const);
  }, []);

  const versesAlong = (pts: { x: number; y: number }[]) => {
    const refs = new Set<number>();
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 24))) {
      const r = refOf(verseElAt(pts[i].x, pts[i].y));
      if (r) refs.add(r);
    }
    const last = refOf(verseElAt(pts[pts.length - 1].x, pts[pts.length - 1].y));
    if (last) refs.add(last);
    return Array.from(refs).sort((a, b) => a - b);
  };
  const versesInBounds = (clientPts: { x: number; y: number }[]) => {
    if (!contentRef.current) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of clientPts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const out: number[] = [];
    contentRef.current.querySelectorAll<HTMLElement>("[data-verse]").forEach((v) => {
      const r = v.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      if (cy >= minY - 4 && cy <= maxY + 4 && r.right >= minX && r.left <= maxX) out.push(Number(v.getAttribute("data-verse")));
    });
    return out.sort((a, b) => a - b);
  };

  // ——— gestures ———
  const onStrokeEnd = (stroke: Stroke, info: StrokeEndInfo): "keep" | "discard" => {
    if (stroke.region === "margin") return "keep";
    if (bibleMode === "scratch") return "keep";
    // STUDY — interpret, then evaporate
    const reader = readerRef.current;
    if (!reader) return "discard";
    if (info.kind === "loop") {
      const vs = versesInBounds(info.clientPts);
      if (vs.length) {
        reader.select(vs[0], vs[vs.length - 1]);
        setBarAnchor(info.clientEnd);
        setShowChips(false);
      }
      return "discard";
    }
    if (info.kind === "tick" || info.kind === "strike") {
      const v = refOf(verseElAt(info.clientStart.x, info.clientStart.y)) ?? refOf(verseElAt(info.clientEnd.x, info.clientEnd.y));
      if (v) {
        const sug = reader.suggestionAt(v);
        if (sug) {
          if (info.kind === "tick") void reader.acceptSuggestion(v, sug.category);
          else reader.dismissSuggestion(v);
        }
      }
      return "discard";
    }
    if (info.kind === "underline") {
      const v = refOf(verseElAt(info.clientStart.x, info.clientStart.y));
      if (v) {
        reader.select(v);
        setBarAnchor(info.clientEnd);
      }
      return "discard";
    }
    return "discard";
  };
  const onHighlighterStroke = (info: StrokeEndInfo) => {
    const vs = versesAlong(info.clientPts);
    if (!vs.length) return;
    void readerRef.current?.applyHighlight(pen.hlCategory, vs[0], vs[vs.length - 1]);
  };
  const onTap = (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => {
    lastTapClient.current = { x: pt.clientX, y: pt.clientY };
    const els = document.elementsFromPoint(pt.clientX, pt.clientY).filter((el) => !isInkLayer(el)) as HTMLElement[];
    const first = els[0];
    if (!first) return false;
    const num = first.closest?.("[data-verse-number]") as HTMLElement | null;
    if (pen.tool === "highlighter" && num) {
      const ref = Number(num.getAttribute("data-verse-number"));
      void readerRef.current?.applyHighlight(pen.hlCategory, ref, ref);
      return true;
    }
    const sup = first.closest?.("sup") as HTMLElement | null;
    const btn = first.closest?.("button") as HTMLElement | null;
    const verse = first.closest?.("[data-verse]") as HTMLElement | null;
    const clickable = sup ?? btn ?? verse ?? (first.closest?.("[role=button], a") as HTMLElement | null);
    if (clickable) {
      clickable.click();
      return true;
    }
    return false;
  };
  const onHover = (h: { x: number; y: number; clientX: number; clientY: number } | null) => {
    if (!h || !paneRef.current) {
      setHover(null);
      setHoverTip(null);
      return;
    }
    const el = verseElAt(h.clientX, h.clientY);
    const pr = paneRef.current.getBoundingClientRect();
    setHoverTip({ x: h.clientX - pr.left, y: h.clientY - pr.top });
    if (!el) {
      setHover(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setHover({ left: r.left - pr.left, top: r.bottom - pr.top - 3, width: r.width, num: Number(el.getAttribute("data-verse-num")) });
  };
  const onHold = (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => {
    const el = verseElAt(pt.clientX, pt.clientY);
    const ref = refOf(el);
    if (!ref) return false;
    const v = readerRef.current?.getVerse(ref);
    const text = v ? (v.lines ? v.lines.join(" ") : v.text) : "";
    setDrag({ refStart: ref, refEnd: ref, label: formatRef(ref), text, x: pt.clientX, y: pt.clientY, hot: false });
    return true;
  };
  const onDragMove = (c: { x: number; y: number }) => {
    const hot = document.elementsFromPoint(c.x, c.y).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
    setDrag((d) => (d ? { ...d, x: c.x, y: c.y, hot } : d));
  };
  const onDragEnd = (c: { x: number; y: number }, cancelled: boolean) => {
    setDrag((d) => {
      if (d && !cancelled) {
        const hot = document.elementsFromPoint(c.x, c.y).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
        if (hot) emit({ type: "send-to-notes", refStart: d.refStart, refEnd: d.refEnd, label: d.label, text: d.text, source: `drag:${c.x},${c.y}` });
      }
      return null;
    });
  };

  // ——— action bar ———
  const onSelectionChange = (s: number | null, e: number | null) => {
    setSel({ start: s, end: e });
    if (s !== null && lastTapClient.current && !barAnchor) setBarAnchor(lastTapClient.current);
    if (s === null) {
      setBarAnchor(null);
      setShowChips(false);
    }
  };
  const barAction = (a: BarAction) => {
    const reader = readerRef.current;
    if (!reader || sel.start === null) return;
    if (a === "hl") {
      setShowChips((v) => !v);
      return;
    }
    if (a === "send") {
      const vs: string[] = [];
      for (let r = sel.start; r <= (sel.end ?? sel.start); r++) {
        const v = reader.getVerse(r);
        if (v) vs.push(v.lines ? v.lines.join(" ") : v.text);
      }
      emit({ type: "send-to-notes", refStart: sel.start, refEnd: sel.end ?? sel.start, label: formatRef(sel.start, sel.end ?? sel.start), text: vs.join(" "), source: "bar" });
      reader.clearSelection();
      return;
    }
    reader.setBar(a === "mem" ? "mem" : a === "more" ? "more" : a);
  };
  const applyCategory = (cat: string) => {
    if (sel.start === null) return;
    void readerRef.current?.applyHighlight(cat, sel.start, sel.end ?? sel.start);
    setShowChips(false);
    setBarAnchor(null);
  };

  // ——— strokes change ———
  const onStrokesChange = (next: Stroke[], delta: { appended?: Stroke[]; removed?: string[] }) => {
    setStrokes(next);
    if (delta.appended?.length) pending.current.append.push(...delta.appended);
    if (delta.removed?.length) pending.current.remove.push(...delta.removed);
    scheduleSave();
  };

  // a narrow pane (stacked Bible, ~360px) keeps every control but drops the long labels
  const narrow = contentSize.w > 0 && contentSize.w < 600;
  const layerLabel = narrow ? "" : layerKey === "my" ? "MY LAYER" : layerContext && layerContext.key === layerKey ? layerContext.label.toUpperCase() : layerKey.toUpperCase();
  const selectedLabel = sel.start !== null ? `${formatRef(sel.start, sel.end ?? sel.start).toUpperCase()} SELECTED` : null;
  const free2 = Boolean(free);
  const canvasEnabled = overlayVisibility !== "hide";

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
      {role === "reference" && (
        <>
          <span style={{ fontSize: 10, color: "#A9A7AE" }}>follows links</span>
          <button type="button" onClick={() => { const prev = history[history.length - 1]; if (prev) { setHistory((h) => h.slice(0, -1)); onQueryChange(prev); } }} style={{ fontSize: 13, color: history.length ? "#96949B" : "#D9D7DC", background: "none", border: 0, cursor: history.length ? "pointer" : "default" }} aria-label="Back">‹</button>
        </>
      )}
      {prefs.actionBar === "B" && sel.start !== null && <ActionBarB onAction={barAction} onHighlight={applyCategory} showChips={showChips} />}
      {pinned && (
        <Chip tone="tint" title="type set when first inked — unpin to reflow"><PinIcon /> PAGE PINNED</Chip>
      )}
      <div style={{ position: "relative" }}>
        <button type="button" onClick={() => setLayersOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${layersOpen ? "#A63D63" : "#E9CFDC"}`, background: layersOpen ? "#F0D3E0" : "#F6E3EB", borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>
          <LayersIcon />
          <span style={{ fontSize: 9, letterSpacing: "0.08em", fontWeight: 700, color: "#8C2F51" }}>{layerLabel}</span>
          <span style={{ fontSize: 9, color: "#B07A93" }}>⌄</span>
        </button>
        {layersOpen && (
          <Popover width={238} onClose={() => setLayersOpen(false)} style={{ top: 30, left: 0 }}>
            <Kicker>LAYERS ON {title.toUpperCase()}</Kicker>
            {[{ key: "my", label: "My layer" }, ...(layerContext ? [{ key: layerContext.key, label: layerContext.label }] : [])].map((l) => {
              const count = l.key === layerKey ? strokes.length : layers.find((x) => x.layerKey === l.key)?.strokeCount ?? 0;
              const on = l.key === layerKey;
              return (
                <button key={l.key} type="button" onClick={() => { setLayerKey(l.key); setLayersOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "7px 9px", borderRadius: 9, cursor: "pointer", background: on ? "#F6E3EB" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "inset 0 0 0 1px #F2F1F2", border: 0, textAlign: "left" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#232227" }}>{l.label}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 9.5, color: "#96949B" }}>{count} stroke{count === 1 ? "" : "s"}</span>
                </button>
              );
            })}
            {layers.filter((l) => l.layerKey !== "my" && l.layerKey !== layerContext?.key).map((l) => (
              <button key={l.layerKey} type="button" onClick={() => { setLayerKey(l.layerKey); setLayersOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 4, padding: "7px 9px", borderRadius: 9, cursor: "pointer", background: l.layerKey === layerKey ? "#F6E3EB" : "transparent", boxShadow: l.layerKey === layerKey ? "inset 0 0 0 1.5px #A63D63" : "inset 0 0 0 1px #F2F1F2", border: 0, textAlign: "left" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#232227" }}>{l.layerKey.replace(/^layer:/, "")}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 9.5, color: "#96949B" }}>{l.strokeCount}</span>
              </button>
            ))}
            <button type="button" onClick={() => { const nm = window.prompt("Name the layer"); if (nm?.trim()) { setLayerKey(`layer:${nm.trim()}`); setLayersOpen(false); } }} style={{ fontSize: 10, color: "#96949B", padding: "8px 9px 2px", borderTop: "1px solid #EDEBEE", marginTop: 8, lineHeight: 1.5, background: "none", border: 0, cursor: "pointer", width: "100%", textAlign: "left" }}>
              + new layer · layers are contexts, not versions — ink saves to the active one
            </button>
          </Popover>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E4E2E6", background: "#FAF9FA", borderRadius: 99, padding: "2.5px 3px 2.5px 9px" }}>
        <EyeIcon />
        <div style={{ display: "flex", gap: 2 }}>
          {(["hide", "dim", "show"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setOverlayVisibility(v)} style={{ fontSize: 8.5, letterSpacing: "0.06em", fontWeight: 700, borderRadius: 99, padding: "3.5px 9px", cursor: "pointer", border: 0, transition: "background .2s", background: overlayVisibility === v ? "#A63D63" : "transparent", color: overlayVisibility === v ? "#FFFFFF" : "#96949B" }}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => setOverlayMargin(((overlayMargin + 1) % 3) as 0 | 1 | 2)} title="margin: none · wide · wider" style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #E4E2E6", background: "#FFFFFF", borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>
        <MarginIcon />
        {!narrow && <span style={{ fontSize: 9, letterSpacing: "0.08em", fontWeight: 700, color: "#454349" }}>{MARGIN_LABEL[overlayMargin]}</span>}
      </button>
      <Segmented value={bibleMode} onChange={setBibleMode} size="sm" options={[{ value: "study", label: "STUDY" }, { value: "scratch", label: "SCRATCH" }]} />
      {headerExtra}
    </div>
  );

  return (
    <div ref={paneRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative", background: "#FFFFFF" }}>
      <PaneHeader kicker={role === "main" ? "BIBLE" : "REFERENCE"} title={narrow ? undefined : `${title || query || "…"}`} meta={narrow ? undefined : "ESV"} onKicker={onKicker} right={headerRight}>
        {selectedLabel && <Chip tone="tint" style={{ color: "#A63D63" }}>{selectedLabel}</Chip>}
      </PaneHeader>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        <div ref={contentRef} style={{ position: "relative", minHeight: "100%" }}>
          <SpiritReader
            ref={readerRef}
            embedded
            query={query}
            free={free2}
            dayId={dayId ?? null}
            role={role}
            externalActionBar
            typeLocked={pinned}
            marginInset={{ side: marginSide, px: marginPx }}
            inkChapters={chapterKey ? new Set(Array.from(inkChapters).filter((k) => Math.floor(k / 1000) === Math.floor(chapterKey / 1000)).map((k) => k % 1000)) : null}
            onOpenRef={(q, label) => {
              if (role === "main") emit({ type: "open-reference", q, label, source: "crossref" });
              else onQueryChange(q);
            }}
            onQueryChange={onQueryChange}
            onPassageLoaded={(d) => {
              setTitle(d.canonical);
              // opening a study reopens the Bible AT the assignment — once per chapter
              // load; the verses commit a tick after the data arrives, so retry briefly
              const key = `${d.canonical}`;
              if (scrolledTo.current !== key) {
                let tries = 0;
                const attempt = () => {
                  const sc = scrollRef.current;
                  const el = contentRef.current?.querySelector<HTMLElement>("[data-assigned]");
                  // "ready" means the verse is laid out below the fold; an early pass sees it at ~0
                  const top = sc && el ? el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 72 : 0;
                  if (sc && el && top > 40) {
                    scrolledTo.current = key;
                    sc.scrollTo({ top, behavior: "smooth" });
                    // the pinned-page / overlay loads that follow can briefly shrink the
                    // content and clamp the scroll back to 0 — re-apply once it settles
                    [700, 1600].forEach((ms) =>
                      setTimeout(() => {
                        const s2 = scrollRef.current;
                        const e2 = contentRef.current?.querySelector<HTMLElement>("[data-assigned]");
                        if (!s2 || !e2 || s2.scrollTop > 40) return;
                        const t2 = e2.getBoundingClientRect().top - s2.getBoundingClientRect().top + s2.scrollTop - 72;
                        if (t2 > 40) s2.scrollTo({ top: t2 });
                      }, ms),
                    );
                    return;
                  }
                  if (sc && el && sc.scrollTop > 40) {
                    scrolledTo.current = key; // he already scrolled — leave him be
                    return;
                  }
                  if (++tries < 10) setTimeout(attempt, 60 * tries);
                };
                setTimeout(attempt, 0); // a timer, not rAF — rAF starves when the view isn't compositing (background tab, hidden pane)
              }
            }}
            onChapterChange={(ck) => setChapterKey(ck)}
            onSelectionChange={onSelectionChange}
          />
          {contentSize.w > 0 && (
            <InkCanvas
              ref={canvasRef}
              strokes={strokes}
              onStrokesChange={onStrokesChange}
              width={contentSize.w}
              height={contentSize.h}
              scale={1}
              enabled={canvasEnabled}
              scrollRef={scrollRef}
              background="none"
              alpha={alpha}
              onStrokeEnd={onStrokeEnd}
              onHighlighterStroke={onHighlighterStroke}
              onHover={onHover}
              onTap={onTap}
              onHold={bibleMode === "study" ? onHold : undefined}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              anchorFor={anchorFor}
              offsetFor={offsetFor}
              regionFor={regionFor}
              style={{ position: "absolute", left: 0, top: 0, pointerEvents: canvasEnabled ? "auto" : "none", zIndex: 5 }}
            />
          )}
        </div>
      </div>
      {pinned && (
        <div style={{ borderTop: "1px solid #F0EDE8", background: "#FCFAF6", padding: "7px 14px", display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          <PinIcon color="#A9A7AE" size={11} />
          <span style={{ fontSize: 10, color: "#96949B" }}>Frozen like print — type size was set when the page was pinned; unpin to reflow (ink re-anchors by verse).</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setUnpinned(true)} style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>Unpin</button>
        </div>
      )}
      {/* hover rail + "which tool" chip (02a) */}
      {hover && canvasEnabled && (
        <span style={{ position: "absolute", left: hover.left + 24, top: hover.top, width: Math.max(40, hover.width - 32), height: 3, borderRadius: 99, background: "#A63D63", opacity: 0.4, pointerEvents: "none", zIndex: 6, animation: "hoverPulse 1.8s ease-in-out infinite" }} />
      )}
      {hoverTip && hover && canvasEnabled && (
        <div style={{ position: "absolute", left: Math.min(hoverTip.x + 14, (paneRef.current?.clientWidth ?? 400) - 170), top: Math.max(44, hoverTip.y - 30), display: "flex", alignItems: "center", gap: 6, background: "rgba(35,34,39,0.82)", borderRadius: 99, padding: "4px 10px", backdropFilter: "blur(4px)", pointerEvents: "none", zIndex: 7 }}>
          <PenIcon size={11} color="#F2F1F2" strokeWidth={2} />
          <span style={{ fontSize: 9.5, fontWeight: 600, color: "#F2F1F2" }}>{pen.tool === "highlighter" ? `highlighter · ${pen.hlCategory}` : `hover — binds to v. ${hover.num}`}</span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pen.tool === "highlighter" ? hlColor(pen.hlCategory) : pen.color, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.6)" }} />
        </div>
      )}
      {/* action bar A — rises beside the tip */}
      {prefs.actionBar === "A" && sel.start !== null && barAnchor && (
        <ActionBarA x={barAnchor.x} y={barAnchor.y} hand={hand} onAction={barAction} onHighlight={applyCategory} showChips={showChips} />
      )}
      {drag && <RefCardGhost label={drag.label} text={drag.text} x={drag.x} y={drag.y} />}
      {popover && (
        <RefPopover
          state={popover}
          onClose={() => setPopover(null)}
          onPeekFull={() => setPopover((p) => (p ? { ...p, full: true } : p))}
          onOpenReference={(q, label) => emit({ type: "open-reference", q, label })}
        />
      )}
      <style jsx global>{`
        @keyframes hoverPulse { 0%,100% { opacity:0.3; } 50% { opacity:0.5; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes vu { 0%,100% { transform:scaleY(0.3); } 50% { transform:scaleY(1); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes blinkC { 0%,55% { opacity:1; } 56%,100% { opacity:0; } }
        @keyframes march { to { stroke-dashoffset:-14; } }
        .desk-pill-item:hover { background:#38343C; }
      `}</style>
    </div>
  );
}
