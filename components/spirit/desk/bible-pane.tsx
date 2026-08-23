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
import { askConfirm, askPrompt } from "./dialog";
import { haptic } from "@/lib/haptics";

const MARGIN_W = [0, 122, 170] as const; // none · wide · wider — none is none
const MARGIN_LABEL = ["MARGIN · NONE", "MARGIN · WIDE", "MARGIN · WIDER"] as const;

export interface BiblePaneProps {
  role: "main" | "reference";
  query: string | null;
  /** a verse the shell wants selected once this pane has the passage — bumped `seq` re-arms it */
  pendingJump?: { refStart: number; refEnd: number | null; seq: number } | null;
  /** tell the shell the jump has been taken, so a later remount cannot replay it */
  onJumpConsumed?: (seq: number) => void;
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

export function BiblePane({ role, query, onQueryChange, pendingJump, onJumpConsumed, free, dayId, layerContext, onKicker, headerExtra }: BiblePaneProps) {
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
  /** select a verse in the passage that is already on screen, and bring it into view */
  const selectVerseNow = useCallback((refStart: number, refEnd: number | null) => {
    requestAnimationFrame(() => {
      readerRef.current?.select(refStart, refEnd);
      const el = contentRef.current?.querySelector<HTMLElement>(`#v-${refStart}`);
      const sc = scrollRef.current;
      if (el && sc) {
        const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 90;
        sc.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    });
  }, []);
  const [history, setHistory] = useState<string[]>([]);
  /** a verse to select as soon as the next passage finishes loading */
  const pendingSelect = useRef<{ refStart: number; refEnd: number | null } | null>(null);
  /**
   * Bring a verse into view. If the pane must change chapter, arm the selection and let
   * `onPassageLoaded` fire it; if the pane is ALREADY on that chapter, `onQueryChange` sets an
   * identical string, the reader never reloads, `onPassageLoaded` never fires — so select now
   * instead of leaving the request armed to hijack whatever chapter he opens next.
   */
  const jumpToVerse = useCallback((refStart: number, refEnd: number | null) => {
    const p = refParts(refStart);
    const book = BOOKS[p.book - 1];
    if (!book) return; // an out-of-range ref would ask for the chapter "undefined 4"
    const target = `${book} ${p.chapter}`;
    // Guard on the chapter the pane is ACTUALLY rendering, not on the `query` prop. The Reader
    // owns navigation internally (chapter chips, the navigator) and never calls back up, so the
    // prop goes stale the moment he turns a page — and a stale prop here either no-ops a real
    // jump or arms a pendingSelect that later hijacks an unrelated chapter.
    const onThisChapterAlready = chapterKey !== null && chapterKey === p.book * 1000 + p.chapter;
    if (onThisChapterAlready) {
      pendingSelect.current = null;
      selectVerseNow(refStart, refEnd);
      return;
    }
    setHistory((h) => (query ? [...h, query].slice(-12) : h));
    pendingSelect.current = { refStart, refEnd };
    onQueryChange(target);
  }, [query, chapterKey, onQueryChange, selectVerseNow]);
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
  // the overlay's own undo stack — the tool rail belongs to the notebook, so the Bible
  // needs its own way back (two-finger tap, the header ⤺, and clear-the-layer)
  const [inkPast, setInkPast] = useState<Stroke[][]>([]);
  const [inkFuture, setInkFuture] = useState<Stroke[][]>([]);
  const pending = useRef<{ append: Stroke[]; remove: string[] }>({ append: [], remove: [] });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef<Promise<OverlayPage | null> | null>(null);
  const lastTapClient = useRef<{ x: number; y: number } | null>(null);

  // the margin is not "random whitespace": it exists when he asked for one, or when margin
  // ink is on the shown layer — and collapses entirely while the layer is hidden
  const hasMarginInk = strokes.some((s) => s.region === "margin");
  const marginPx = overlayVisibility === "hide" ? 0 : MARGIN_W[Math.max(overlayMargin, hasMarginInk ? 1 : 0) as 0 | 1 | 2];
  const marginSide: "left" | "right" = hand === "left" ? "left" : "right";
  const pinned = strokes.length > 0 && !unpinned;
  const alpha = overlayVisibility === "show" ? 1 : overlayVisibility === "dim" ? 0.22 : 0;

  // ——— desk events: open in the reference Bible / main ———
  useDeskEvent(
    (e) => {
      // A jump belongs to the REFERENCE pane when one is open. In a tab that has no
      // reference pane (Notebook | Bible, for instance) the main Bible takes it — the tap
      // used to go nowhere at all.
      const soleBible = role === "main" && !document.querySelector('[data-pane-role="reference"]');
      if (e.type === "open-reference" && (role === "reference" || soleBible)) {
        setHistory((h) => (query ? [...h, query].slice(-12) : h));
        onQueryChange(e.q);
      } else if (e.type === "open-main" && role === "main") {
        onQueryChange(e.q);
      } else if (e.type === "jump-reference-pane" && (role === "reference" || soleBible)) {
        jumpToVerse(e.refStart, e.refEnd ?? null);
        haptic("selection");
      }
    },
    [role, query, onQueryChange, jumpToVerse],
  );

  // the shell routes the jump here when the tab had no Bible pane at all and it had to open one
  const lastJump = useRef(0);
  useEffect(() => {
    if (!pendingJump || pendingJump.seq === lastJump.current) return;
    lastJump.current = pendingJump.seq;
    jumpToVerse(pendingJump.refStart, pendingJump.refEnd);
    // one-shot: without this the shell keeps the jump forever and a tab switch (which remounts
    // the pane) replays it, yanking him off whatever chapter he had navigated to since
    onJumpConsumed?.(pendingJump.seq);
  }, [pendingJump, jumpToVerse, onJumpConsumed]);

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
    if (!chapterKey) return;
    // save what is queued for the chapter/layer we are LEAVING before we load the next one —
    // a scroll or a layer tap inside the 1.1 s debounce used to destroy those strokes
    void (async () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await flushRef.current();
      await loadOverlay(chapterKey, layerKey);
    })();
  }, [chapterKey, layerKey, loadOverlay]);
  // and on the way out
  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);
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

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), 1100);
  }, []);
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
    // Each gesture evaporates ONLY when it actually did something. A gesture that consumed
    // nothing was handwriting that happened to look like one, and handwriting is never eaten.
    if (info.kind === "loop") {
      const vs = versesInBounds(info.clientPts);
      if (vs.length) {
        reader.select(vs[0], vs[vs.length - 1]);
        setBarAnchor(info.clientEnd);
        setShowChips(false);
        return "discard";
      }
    }
    if (info.kind === "tick" || info.kind === "strike") {
      const v = refOf(verseElAt(info.clientStart.x, info.clientStart.y)) ?? refOf(verseElAt(info.clientEnd.x, info.clientEnd.y));
      if (v) {
        const sug = reader.suggestionAt(v);
        if (sug) {
          if (info.kind === "tick") void reader.acceptSuggestion(v, sug.category);
          else reader.dismissSuggestion(v);
          return "discard";
        }
      }
    }
    if (info.kind === "underline") {
      const v = refOf(verseElAt(info.clientStart.x, info.clientStart.y));
      if (v) {
        reader.select(v);
        setBarAnchor(info.clientEnd);
        return "discard";
      }
    }
    // NOT a gesture — it is handwriting. Study mode evaporates MARKS, never words.
    return "keep";
  };
  const onHighlighterStroke = (stroke: Stroke, info: StrokeEndInfo): "keep" | "discard" => {
    const vs = versesAlong(info.clientPts);
    if (!vs.length) return stroke.region === "margin" ? "keep" : "discard"; // margin ink always stays
    // the verse-level highlight (the data the phone, the notebook and the layer queries use) …
    haptic("light");
    void readerRef.current?.applyHighlight(pen.hlCategory, vs[0], vs[vs.length - 1]);
    // … AND the band itself stays as ink in the category colour — a highlighter that feels like one
    stroke.color = hlColor(pen.hlCategory);
    stroke.opacity = 0.34;
    stroke.tool = "marker";
    return "keep";
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
    if (num && sel.start !== null) {
      // a second verse number while one is selected → the span between them
      const ref = Number(num.getAttribute("data-verse-number"));
      if (ref !== sel.start && ref !== sel.end) {
        haptic("selection");
        readerRef.current?.select(Math.min(sel.start, ref), Math.max(sel.end ?? sel.start, ref));
        return true;
      }
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
    // hold inside the current selection → the WHOLE span travels, not just the verse under the finger
    const inSel = sel.start !== null && ref >= sel.start && ref <= (sel.end ?? sel.start);
    const a = inSel ? sel.start! : ref;
    const b = inSel ? (sel.end ?? sel.start!) : ref;
    const parts: string[] = [];
    for (let r = a; r <= b; r++) {
      const v = readerRef.current?.getVerse(r);
      if (v) parts.push(v.lines ? v.lines.join(" ") : v.text);
    }
    haptic("medium");
    setDrag({ refStart: a, refEnd: b, label: formatRef(a, b), text: parts.join(" "), x: pt.clientX, y: pt.clientY, hot: false });
    return true;
  };
  // ——— finger range-select: start on a verse NUMBER (the gutter is the handle, so this can
  // never steal a scroll started on the text) and drag up or down across the chapter ———
  const onSelectDragStart = (c: { x: number; y: number }) => {
    const els = document.elementsFromPoint(c.x, c.y).filter((el) => !isInkLayer(el)) as HTMLElement[];
    const num = els[0]?.closest?.("[data-verse-number]") as HTMLElement | null;
    if (!num) return false;
    const ref = Number(num.getAttribute("data-verse-number"));
    if (!ref) return false;
    haptic("selection");
    readerRef.current?.select(ref, ref);
    return true;
  };
  const onSelectDragMove = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const a = refOf(verseElAt(from.x, from.y));
    const b = refOf(verseElAt(to.x, to.y));
    if (!a || !b) return;
    readerRef.current?.select(Math.min(a, b), Math.max(a, b));
  };
  const onDragMove = (c: { x: number; y: number }) => {
    const hot = document.elementsFromPoint(c.x, c.y).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
    setDrag((d) => (d ? { ...d, x: c.x, y: c.y, hot } : d));
  };
  const onDragEnd = (c: { x: number; y: number }, cancelled: boolean) => {
    setDrag((d) => {
      if (d && !cancelled) {
        const hot = document.elementsFromPoint(c.x, c.y).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
        if (hot) {
          haptic("success");
          emit({ type: "send-to-notes", refStart: d.refStart, refEnd: d.refEnd, label: d.label, text: d.text, source: `drag:${c.x},${c.y}` });
        }
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
    haptic(a === "send" ? "success" : "light");
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
    setInkPast((h) => [...h.slice(-40), strokes]);
    setInkFuture([]);
    setStrokes(next);
    if (delta.appended?.length) pending.current.append.push(...delta.appended);
    if (delta.removed?.length) pending.current.remove.push(...delta.removed);
    scheduleSave();
  };
  /** step the overlay's ink back or forward; the diff against what is on screen becomes the save */
  const stepInk = (dir: "undo" | "redo") => {
    const from = dir === "undo" ? inkPast : inkFuture;
    const target = from[from.length - 1];
    if (!target) return;
    if (dir === "undo") {
      setInkPast((h) => h.slice(0, -1));
      setInkFuture((f) => [...f, strokes]);
    } else {
      setInkFuture((f) => f.slice(0, -1));
      setInkPast((h) => [...h, strokes]);
    }
    const removed = strokes.filter((s) => !target.find((t) => t.id === s.id)).map((s) => s.id);
    const added = target.filter((t) => !strokes.find((s) => s.id === t.id));
    setStrokes(target);
    if (removed.length) pending.current.remove.push(...removed);
    if (added.length) pending.current.append.push(...added);
    haptic("light");
    scheduleSave();
  };
  /** wipe every stroke on the layer showing — the only escape from a page of test scribbles */
  const clearLayer = async () => {
    if (!strokes.length) return;
    const ok = await askConfirm({
      title: `Clear your ink on ${title || "this chapter"}?`,
      body: `${strokes.length} stroke${strokes.length === 1 ? "" : "s"} on the ${layerKey === "my" ? "My layer" : "current"} layer. Highlights on the verses stay — this is only the ink you drew.`,
      confirmLabel: "Clear the ink",
      danger: true,
    });
    if (!ok) return;
    haptic("warning");
    setInkPast((h) => [...h.slice(-40), strokes]);
    setInkFuture([]);
    pending.current.remove.push(...strokes.map((s) => s.id));
    setStrokes([]);
    setLayersOpen(false);
    scheduleSave();
  };

  // a narrow pane (stacked Bible, ~360px) keeps every control but drops the long labels
  const narrow = contentSize.w > 0 && contentSize.w < 600;
  // a third-of-the-desk pane (~240px, three columns): one eye button that cycles, one mode chip that toggles
  const tiny = contentSize.w > 0 && contentSize.w < 360;
  const layerLabel = narrow ? "" : layerKey === "my" ? "MY LAYER" : layerContext && layerContext.key === layerKey ? layerContext.label.toUpperCase() : layerKey.toUpperCase();
  const markedOnSelection = sel.start === null ? [] : Array.from(new Set((readerRef.current?.highlightsAt(sel.start, sel.end ?? sel.start) ?? []).map((h) => h.category)));
  const unmarkSelection = () => {
    if (sel.start === null) return;
    const ids = (readerRef.current?.highlightsAt(sel.start, sel.end ?? sel.start) ?? []).map((h) => h.id);
    haptic("warning");
    void readerRef.current?.removeHighlights(ids);
  };
  const selectedLabel = sel.start !== null ? `${formatRef(sel.start, sel.end ?? sel.start).toUpperCase()} SELECTED` : null;
  const free2 = Boolean(free);
  const canvasEnabled = overlayVisibility !== "hide";

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
      {role === "reference" && (
        <>
          {!tiny && <span style={{ fontSize: 10, color: "#A9A7AE" }}>follows links</span>}
          <button type="button" onClick={() => { const prev = history[history.length - 1]; if (prev) { setHistory((h) => h.slice(0, -1)); onQueryChange(prev); } }} style={{ fontSize: 13, color: history.length ? "#96949B" : "#D9D7DC", background: "none", border: 0, cursor: history.length ? "pointer" : "default" }} aria-label="Back">‹</button>
        </>
      )}
      {prefs.actionBar === "B" && sel.start !== null && <ActionBarB onAction={barAction} onHighlight={applyCategory} showChips={showChips} marked={markedOnSelection} onUnmark={unmarkSelection} />}
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
            {strokes.length > 0 && (
              <button type="button" onClick={() => void clearLayer()} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 6, borderRadius: 9, fontSize: 11.5, fontWeight: 600, color: "#B4533F", background: "transparent", border: 0, cursor: "pointer" }}>
                Clear my ink on this chapter · {strokes.length} stroke{strokes.length === 1 ? "" : "s"}
              </button>
            )}
            <button type="button" onClick={async () => { const nm = await askPrompt({ title: "Name the layer", placeholder: "e.g. Sunday · Galatians series" }); if (nm?.trim()) { setLayerKey(`layer:${nm.trim()}`); setLayersOpen(false); } }} style={{ fontSize: 10, color: "#96949B", padding: "8px 9px 2px", borderTop: "1px solid #EDEBEE", marginTop: 8, lineHeight: 1.5, background: "none", border: 0, cursor: "pointer", width: "100%", textAlign: "left" }}>
              + new layer · layers are contexts, not versions — ink saves to the active one
            </button>
          </Popover>
        )}
      </div>
      {strokes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, border: "1px solid #E4E2E6", background: "#FFFFFF", borderRadius: 99, padding: "2px 3px" }}>
          <button type="button" title="Undo your last mark here" onClick={() => stepInk("undo")} disabled={!inkPast.length} style={{ width: 26, height: 22, borderRadius: 99, border: 0, background: "transparent", cursor: inkPast.length ? "pointer" : "default", opacity: inkPast.length ? 1 : 0.3, fontSize: 12, color: "#454349" }}>⤺</button>
          <button type="button" title="Redo" onClick={() => stepInk("redo")} disabled={!inkFuture.length} style={{ width: 26, height: 22, borderRadius: 99, border: 0, background: "transparent", cursor: inkFuture.length ? "pointer" : "default", opacity: inkFuture.length ? 1 : 0.3, fontSize: 12, color: "#454349" }}>⤻</button>
        </div>
      )}
      {tiny ? (
        <button type="button" title={`overlay: ${overlayVisibility} — tap to cycle`} onClick={() => setOverlayVisibility(overlayVisibility === "show" ? "dim" : overlayVisibility === "dim" ? "hide" : "show")} style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #E4E2E6", background: overlayVisibility === "hide" ? "#FFFFFF" : "#FAF9FA", borderRadius: 99, padding: "4px 8px", cursor: "pointer", opacity: overlayVisibility === "hide" ? 0.6 : 1 }}>
          <EyeIcon />
          <span style={{ fontSize: 8, letterSpacing: "0.06em", fontWeight: 700, color: "#8C2F51" }}>{overlayVisibility.toUpperCase()}</span>
        </button>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E4E2E6", background: "#FAF9FA", borderRadius: 99, padding: "2.5px 3px 2.5px 9px" }}>
        <EyeIcon />
        <div style={{ display: "flex", gap: 2 }}>
          {(["hide", "dim", "show"] as const).map((v) => (
            <button key={v} type="button" onClick={() => { haptic("selection"); setOverlayVisibility(v); }} style={{ fontSize: 8.5, letterSpacing: "0.06em", fontWeight: 700, borderRadius: 99, padding: "3.5px 9px", cursor: "pointer", border: 0, transition: "background .2s", background: overlayVisibility === v ? "#A63D63" : "transparent", color: overlayVisibility === v ? "#FFFFFF" : "#96949B" }}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      )}
      <button type="button" onClick={() => { haptic("selection"); setOverlayMargin(((overlayMargin + 1) % 3) as 0 | 1 | 2); }} title="margin: none · wide · wider" style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #E4E2E6", background: "#FFFFFF", borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>
        <MarginIcon />
        {!narrow && <span style={{ fontSize: 9, letterSpacing: "0.08em", fontWeight: 700, color: "#454349" }}>{MARGIN_LABEL[overlayMargin]}</span>}
      </button>
      {tiny ? (
        <button type="button" title="Study ↔ Scratch" onClick={() => { haptic("selection"); setBibleMode(bibleMode === "study" ? "scratch" : "study"); }} style={{ fontSize: 8.5, letterSpacing: "0.08em", fontWeight: 700, color: "#FFFFFF", background: "#A63D63", border: 0, borderRadius: 99, padding: "5px 10px", cursor: "pointer" }}>{bibleMode === "study" ? "STUDY" : "SCRATCH"}</button>
      ) : (
        <Segmented value={bibleMode} onChange={(m) => { haptic("selection"); setBibleMode(m); }} size="sm" options={[{ value: "study", label: "STUDY" }, { value: "scratch", label: "SCRATCH" }]} />
      )}
      {headerExtra}
    </div>
  );

  return (
    <div ref={paneRef} data-pane-role={role} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative", background: "#FFFFFF" }}>
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
              const ps = pendingSelect.current;
              if (ps) {
                pendingSelect.current = null;
                selectVerseNow(ps.refStart, ps.refEnd);
              }
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
              onEraseTick={() => haptic("light")}
              onUndoGesture={() => stepInk("undo")}
              onRedoGesture={() => stepInk("redo")}
              onHover={onHover}
              onTap={onTap}
              onHold={(pt) => (pt.pointerType === "pen" && bibleMode !== "study" ? false : onHold(pt))}
              onSelectDragStart={onSelectDragStart}
              onSelectDragMove={onSelectDragMove}
              onSelectDragEnd={(c) => {
                if (c) setBarAnchor(c);
                haptic("light");
              }}
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
        <ActionBarA x={barAnchor.x} y={barAnchor.y} hand={hand} onAction={barAction} onHighlight={applyCategory} showChips={showChips} marked={markedOnSelection} onUnmark={unmarkSelection} />
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
