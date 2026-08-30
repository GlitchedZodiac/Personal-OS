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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { SpiritReader, type SpiritReaderHandle } from "@/components/spirit/reader";
import { BibleNav } from "@/components/spirit/bible-nav";
import { InkCanvas, type InkCanvasHandle, type StrokeEndInfo } from "./ink-canvas";
import { useDesk, useDeskEvent, hlColor } from "./desk-state";
import { ActionBarA, ActionBarB, type BarAction } from "./action-bar";
import { RefCardGhost } from "./ref-card";
import { RefPopover, type RefPopoverState } from "./ref-popover";
import { PaneHeader, Chip, Popover, Kicker } from "./ui";
import { EyeIcon, LayersIcon, MarginIcon, PinIcon, PenIcon } from "./desk-icons";
import { formatRef, refParts, BOOKS, BOOK_ABBREV, CHAPTERS } from "@/lib/bible-refs";
import { type Stroke } from "@/lib/ink";
import { askConfirm, askPrompt } from "./dialog";
import { haptic } from "@/lib/haptics";
import { applyOutbox, deleteSeqs, listOutbox, queueDelta } from "@/lib/ink-outbox";

const MARGIN_W = [0, 122, 170] as const; // none · wide · wider — none is none
const MARGIN_LABEL = ["MARGIN · NONE", "MARGIN · WIDE", "MARGIN · WIDER"] as const;

/** one chapter forward or back, from the frozen header, with the ink dot the chips used to carry */
function ChapterStep({ label, target, book, inked, onGo }: { label: string; target: number | null; book: number | null; inked: boolean; onGo: () => void }) {
  const can = target !== null && book !== null;
  return (
    <button
      type="button"
      onClick={onGo}
      disabled={!can}
      title={can ? `${BOOK_ABBREV[book - 1]} ${target}` : undefined}
      aria-label={can ? `Go to ${BOOKS[book - 1]} ${target}` : "No chapter that way"}
      style={{ position: "relative", width: 22, height: 22, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 99, border: "1px solid #E4E2E6", background: "#FFFFFF", color: can ? "#454349" : "#D9D7DC", fontSize: 12, lineHeight: 1, cursor: can ? "pointer" : "default", padding: 0 }}
    >
      {label}
      {can && inked && (
        <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#A63D63" }} />
      )}
    </button>
  );
}

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
  /**
   * Storage key for "where he was reading in THIS tab" — the verse he had selected and how far
   * he had scrolled. Deliberately its OWN localStorage entry rather than a field on the desk
   * prefs: prefs load asynchronously, and anything the pane writes before they arrive erases
   * them. (It ate a saved tab that way, 2026-08-30.) Scroll position is per-device anyway.
   */
  placeKey?: string | null;
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

export function BiblePane({ role, query, onQueryChange, pendingJump, onJumpConsumed, free, dayId, layerContext, onKicker, headerExtra, placeKey }: BiblePaneProps) {
  const desk = useDesk();
  const { pen, overlayVisibility, setOverlayVisibility, overlayMargin, setOverlayMargin, hand, prefs, emit } = desk;
  const readerRef = useRef<SpiritReaderHandle | null>(null);
  const canvasRef = useRef<InkCanvasHandle | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState<string>(query ?? "");
  const [chapterKey, setChapterKey] = useState<number | null>(null);
  const queryRef = useRef<string | null>(query);
  queryRef.current = query;
  const readPlace = useCallback((): { q: string; verse: number | null; scrollY: number } | null => {
    if (!placeKey) return null;
    try {
      const raw = localStorage.getItem(placeKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [placeKey]);
  const writePlace = useCallback((verse: number | null, scrollY: number) => {
    if (!placeKey || !queryRef.current) return;
    try { localStorage.setItem(placeKey, JSON.stringify({ q: queryRef.current, verse, scrollY })); } catch {}
  }, [placeKey]);
  const restoredOnce = useRef(false);
  // Navigation lives in the pane header, which does not scroll. The Reader's own in-column
  // navigator is suppressed in the desk (see reader.tsx): one menu, always reachable.
  const [navOpen, setNavOpen] = useState(false);
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
  const lastTapClient = useRef<{ x: number; y: number; t: number } | null>(null);

  // the margin is not "random whitespace": it exists when he asked for one, or when margin
  // ink is on the shown layer — and collapses entirely while the layer is hidden
  const hasMarginInk = strokes.some((s) => s.region === "margin");
  const marginPx = overlayVisibility === "hide" ? 0 : MARGIN_W[Math.max(overlayMargin, hasMarginInk ? 1 : 0) as 0 | 1 | 2];
  const marginSide: "left" | "right" = hand === "left" ? "left" : "right";

  // ——— stable props for SpiritReader ———
  // These are the reason React.memo could never engage: a fresh Set, a fresh object and three
  // fresh closures on every render meant the reader re-rendered on every stroke commit, every
  // save flush and every hover move even though nothing it displays had changed.
  const marginInsetProp = useMemo(() => ({ side: marginSide, px: marginPx }), [marginSide, marginPx]);
  const inkChaptersProp = useMemo(
    () => (chapterKey
      ? new Set(Array.from(inkChapters).filter((k) => Math.floor(k / 1000) === Math.floor(chapterKey / 1000)).map((k) => k % 1000))
      : null),
    [inkChapters, chapterKey],
  );
  const handleOpenRef = useCallback((q: string, label?: string) => {
    if (role === "main") emit({ type: "open-reference", q, label, source: "crossref" });
    else onQueryChange(q);
  }, [role, emit, onQueryChange]);
  /**
   * The Reader reports every chapter it settles on, and the query that got it there. Feeding
   * that query back up is what keeps the tab's saved position honest no matter WHICH path moved
   * the Reader — a chip, the navigator, the audio player's arrows, a cross-reference. Before
   * this the query was thrown away here, and `mainQ` stayed null on every tab he owned while he
   * read twenty chapters. Setting an identical string is a no-op upstream, so this cannot loop.
   */
  const handleChapterChange = useCallback((ck: number, q: string) => {
    setChapterKey(ck);
    if (q && q !== queryRef.current) onQueryChange(q);
  }, [onQueryChange]);
  /**
   * Put him back where he was — once per mount, and only when the tab actually remembers a
   * spot. Returns true if it took over, so the assignment auto-scroll stands down rather than
   * fighting it (that fight is what made rotating feel random).
   *
   * This runs from TWO places on purpose. The passage can finish loading before the saved
   * place has arrived from prefs — ESV chapters are cached, and effects run child-first, so
   * the order is genuinely not guaranteed. Whichever arrives second does the work.
   */
  const restore = useCallback((canonical: string | null) => {
    const saved = readPlace();
    // only put him back if the saved spot belongs to the chapter actually on screen
    if (restoredOnce.current || !saved || saved.q !== queryRef.current) return false;
    if (!saved.verse && saved.scrollY <= 0) return false;
    restoredOnce.current = true;
    if (canonical) scrolledTo.current = canonical;
    // Both the scroll and the selection have to wait for the column to lay out — and the
    // selection has to land AFTER the Reader's own query effect, which clears sel/selEnd
    // whenever the query prop changes. Applying it in the same settle loop covers both.
    let n = 0;
    const put = () => {
      const sc = scrollRef.current;
      const ready = !!sc && (saved.scrollY <= 0 || sc.scrollHeight > sc.clientHeight + saved.scrollY - 40);
      if (ready) {
        if (saved.scrollY > 0 && sc) sc.scrollTop = saved.scrollY;
        // The Reader's handle directly, NOT selectVerseNow: that helper scrolls the verse into
        // view, which would fight the scroll position we just restored, and it schedules on
        // requestAnimationFrame, which never runs while the view is not compositing.
        if (saved.verse) readerRef.current?.select(saved.verse, null);
        return;
      }
      if (++n < 14) setTimeout(put, 60 * n);
    };
    setTimeout(put, 0);
    return true;
  }, [readPlace]);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const handlePassageLoaded = useCallback((d: { canonical: string }) => {
              setTitle(d.canonical);
              const ps = pendingSelect.current;
              if (ps) {
                pendingSelect.current = null;
                selectVerseNow(ps.refStart, ps.refEnd);
              }
              // PUT HIM BACK. Once per mount, and only when the tab actually remembers a spot:
              // this is the rotate-and-reload case, where the pane is brand new but he never
              // went anywhere. Claim `scrolledTo` so the assignment auto-scroll below does not
              // then yank him to today's verse — that fight is what made rotating feel random.
              if (!ps && restoreRef.current(d.canonical)) return;
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
              }, [selectVerseNow]);
  // Locked only while ink is actually ON SCREEN — reflowing text under a hidden layer cannot
  // visibly move anything, so there is nothing to protect and no reason to take the Aa away.
  const pinned = strokes.length > 0 && !unpinned && overlayVisibility !== "hide";
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
      // fold in any unsent marks for this layer, so ink recovered after a crash is VISIBLE
      const serverStrokes = page ? ((page.strokes ?? []) as Stroke[]) : [];
      const unsent = page ? await listOutbox(page.id) : [];
      setStrokes(unsent.length ? applyOutbox(serverStrokes, [], unsent).strokes : serverStrokes);
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
          body: JSON.stringify({ kind: "overlay", chapterKey, layerKey, title: `${book} ${chapterKey % 1000} · ${layerKey === "my" ? "my layer" : layerContext?.label ?? layerKey}`, layout: null }),
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
    // Durable before the network — the overlay page exists only now (it is created lazily), so
    // this is the first moment his verse ink can be written to the log with a real page id.
    const seq = await queueDelta({ pageId: page.id, append, remove });
    try {
      const r = await fetch(`/api/spirit/ink/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appendStrokes: append, removeStrokeIds: remove }),
      });
      if (!r.ok) throw new Error("overlay save failed");
      if (seq !== null) await deleteSeqs([seq]);
    } catch {
      // it stays in the log; the notebook pane's drain loop replays it when the network returns
      pending.current = { append: [...append, ...pending.current.append], remove: [...remove, ...pending.current.remove] };
    }
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

  // ——— gestures ———
  const onStrokeEnd = (stroke: Stroke, info: StrokeEndInfo): "keep" | "discard" => {
    if (stroke.region === "margin") return "keep";
    const reader = readerRef.current;
    if (!reader) return "keep";
    // Ink is a layer over print and it STAYS — the only strokes that ever evaporate are the
    // two that visibly consume a suggestion chip. Circles and underlines are annotations he
    // means to keep; selecting is a tap or a hold-drag, never the price of a mark.
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
    // everything else — loops, underlines, letters — is his ink
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
    lastTapClient.current = { x: pt.clientX, y: pt.clientY, t: Date.now() };
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
  /**
   * Drag the current selection out of the action bar and onto a notebook.
   *
   * The hold-on-a-verse gesture still works, but it is invisible and it needs the ink canvas
   * to be live — so with the layer hidden there was no way to reference a verse at all. A grip
   * on the bar is unambiguous: press it, drag, let go over a notebook.
   */
  const startDragFromBar = (e: ReactPointerEvent) => {
    if (sel.start === null) return;
    e.preventDefault();
    e.stopPropagation();
    const a = sel.start;
    const b = sel.end ?? sel.start;
    const parts: string[] = [];
    for (let r = a; r <= b; r++) {
      const v = readerRef.current?.getVerse(r);
      if (v) parts.push(v.lines ? v.lines.join(" ") : v.text);
    }
    haptic("medium");
    setDrag({ refStart: a, refEnd: b, label: formatRef(a, b), text: parts.join(" "), x: e.clientX, y: e.clientY, hot: false });
    const mv = (ev: globalThis.PointerEvent) => {
      const hot = document.elementsFromPoint(ev.clientX, ev.clientY).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, hot } : d));
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      const overNotebook = document.elementsFromPoint(ev.clientX, ev.clientY).some((el) => (el as HTMLElement).closest?.("[data-notebook-drop]"));
      setDrag(null);
      haptic(overNotebook ? "success" : "light");
      // dropping anywhere but a notebook still files it — the shell opens one (his 08-30 ask:
      // "drag verse or verses to any notebook from anywhere")
      emit({ type: "send-to-notes", refStart: a, refEnd: b, label: formatRef(a, b), text: parts.join(" "), source: overNotebook ? `drag:${ev.clientX},${ev.clientY}` : undefined });
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
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
  /** where the action bar should sit when there was no tap to anchor it to */
  const anchorForVerse = useCallback((s: number, e: number | null) => {
    const el = contentRef.current?.querySelector<HTMLElement>(`#v-${e ?? s}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.min(r.right - 40, r.left + r.width * 0.55), y: r.bottom };
  }, []);
  /** report where he is, so the tab can put him back here after a rotate or a reload */
  const placeRef = useRef<{ verse: number | null; scrollY: number }>({ verse: null, scrollY: 0 });
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** has he actually moved this session? an empty place must never overwrite a remembered one */
  const placeDirty = useRef(false);
  const reportPlace = useCallback((verse: number | null) => {
    if (!placeKey) return;
    const scrollY = Math.round(scrollRef.current?.scrollTop ?? 0);
    // An EMPTY report before he has done anything is just the mount talking: the Reader emits
    // onSelectionChange(null, null) the moment it renders. Once he has genuinely moved,
    // clearing a selection IS real news and does get recorded.
    if (!placeDirty.current && verse === null && scrollY <= 0) return;
    placeDirty.current = true;
    placeRef.current = { verse, scrollY };
    if (placeTimer.current) clearTimeout(placeTimer.current);
    // debounced — scrolling a chapter must not write on every frame
    placeTimer.current = setTimeout(() => writePlace(placeRef.current.verse, placeRef.current.scrollY), 400);
  }, [placeKey, writePlace]);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !placeKey) return;
    const onScroll = () => reportPlace(placeRef.current.verse);
    sc.addEventListener("scroll", onScroll, { passive: true });
    // Flush on the way OUT OF THE PAGE, reading the scroll live. Deliberately `pagehide` and
    // not the effect cleanup: React re-invokes effects on mount in development, so a cleanup
    // flush fires during a teardown that never really happened and writes an empty place over
    // a real one.
    const flush = () => {
      if (placeDirty.current) writePlace(placeRef.current.verse, Math.round(sc.scrollTop));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      sc.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      if (placeTimer.current) { clearTimeout(placeTimer.current); placeTimer.current = null; }
      // Re-arm for the next mount. Both of these are REFS, which survive the simulated
      // teardown React performs in development — leaving `restoredOnce` set meant the restore
      // ran on the discarded pass and the real one silently skipped it, every single time.
      restoredOnce.current = false;
      placeDirty.current = false;
    };
  }, [placeKey, writePlace, reportPlace]);

  // The other half of the restore: if the place arrived after the passage did, do it now.
  useEffect(() => {
    if (!title) return; // nothing rendered to scroll or select yet
    restore(title);
  }, [title, restore]);

  const onSelectionChange = useCallback((s: number | null, e: number | null) => {
    setSel({ start: s, end: e });
    reportPlace(s);
    // The bar used to need a TAP recorded by the ink canvas — so with the ink layer hidden
    // (HIDE), or after selecting any other way, it simply never appeared. Anchor to the tap
    // when there is one and to the selected verse itself when there is not.
    if (s !== null) {
      // Anchor to the tap only if it was JUST NOW; otherwise to the selected verse itself.
      // `prev ?? tap ?? anchor` had two ways of putting the bar where he was not looking:
      // `lastTapClient` is never cleared, so a tap from minutes ago — possibly since scrolled
      // off-screen, possibly over the other pane — beat the real selection; and `prev` meant
      // extending a selection left the bar pinned to the FIRST verse. Either one reads as
      // "the menu doesn't show up".
      const tap = lastTapClient.current;
      const fresh = tap && Date.now() - tap.t < 1200 ? { x: tap.x, y: tap.y } : null;
      setBarAnchor(fresh ?? anchorForVerse(s, e) ?? (tap ? { x: tap.x, y: tap.y } : null));
    }
    if (s === null) {
      setBarAnchor(null);
      setShowChips(false);
      lastTapClient.current = null;
    }
  }, [anchorForVerse, reportPlace]);
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
    if (delta.removed?.length) {
      const rm = new Set(delta.removed);
      // A stroke drawn and erased inside one debounce window queued append[X] AND remove[X].
      // The server applies removals first — against a copy that never had X — then appends it,
      // so the erased stroke came back on the next load. Cancel the append instead of racing.
      pending.current.append = pending.current.append.filter((s) => !rm.has(s.id));
      pending.current.remove.push(...delta.removed);
    }
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

  // The header gains chips CONDITIONALLY — a selection chip, the text-size lock, undo/redo once
  // there is ink — so its natural width is not a function of the pane alone. Measuring the
  // breakpoints against the raw pane width is what let the row grow past the pane's right edge
  // and get scissored off by the pane's overflow:hidden. Spend each optional chip from a BUDGET
  // instead, so adding one collapses the row's long labels rather than pushing controls off.
  const chipCost =
    96 +                                       // the navigator title + the two chapter steppers,
                                               // which are no longer optional: they are the only
                                               // way to move, so the OTHER chips give up room first
    (sel.start !== null ? 118 : 0) +           // "JONAH 2:1 SELECTED"
    (strokes.length > 0 && !unpinned && overlayVisibility !== "hide" ? 138 : 0) + // TEXT SIZE LOCKED
    (strokes.length || inkPast.length || inkFuture.length ? 64 : 0);              // ⤺ ⤻
  const budgetW = contentSize.w > 0 ? Math.max(0, contentSize.w - chipCost) : 0;
  // a narrow pane (stacked Bible, ~360px) keeps every control but drops the long labels
  const narrow = budgetW > 0 && budgetW < 600;
  // a third-of-the-desk pane (~240px, three columns): one eye button that cycles, one mode chip that toggles
  const tiny = budgetW > 0 && budgetW < 360;
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

  // The header is the ONLY navigation surface in the desk. It is frozen at the top of the pane,
  // so "go to Exodus 24" never costs a scroll back to the top first.
  const navBook = chapterKey ? Math.floor(chapterKey / 1000) : null;
  const navChapter = chapterKey ? chapterKey % 1000 : null;
  const maxChapter = navBook ? CHAPTERS[navBook - 1] ?? 1 : 1;
  const prevChapter = navBook && navChapter && navChapter > 1 ? navChapter - 1 : null;
  const nextChapter = navBook && navChapter && navChapter < maxChapter ? navChapter + 1 : null;
  const stepChapter = (dir: -1 | 1) => {
    const next = dir === -1 ? prevChapter : nextChapter;
    if (!navBook || next === null) return;
    haptic("selection");
    setHistory((h) => (query ? [...h, query].slice(-12) : h));
    onQueryChange(`${BOOKS[navBook - 1]} ${next}`);
  };
  const headerRight = (
    // minWidth:0 so this can be squeezed rather than forcing the row wider than the pane
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
      {role === "reference" && (
        <>
          {!tiny && <span style={{ fontSize: 10, color: "#A9A7AE" }}>follows links</span>}
          <button type="button" onClick={() => { const prev = history[history.length - 1]; if (prev) { setHistory((h) => h.slice(0, -1)); onQueryChange(prev); } }} style={{ fontSize: 13, color: history.length ? "#96949B" : "#D9D7DC", background: "none", border: 0, cursor: history.length ? "pointer" : "default" }} aria-label="Back">‹</button>
        </>
      )}
      {prefs.actionBar === "B" && sel.start !== null && <ActionBarB onAction={barAction} onHighlight={applyCategory} showChips={showChips} marked={markedOnSelection} onUnmark={unmarkSelection} onDragStart={startDragFromBar} />}
      {pinned && (
        // It was called "PAGE PINNED" and the footer claimed the page was "frozen like print"
        // with a captured type size. None of that was true: the ONLY effect is that the Aa type
        // sheet will not open, so that changing the size cannot reflow the text out from under
        // his ink. Name that, and let the chip itself be the way out.
        <Chip tone="tint" title="Text size is locked so your ink stays on the right words. Tap to unlock." onClick={() => setUnpinned(true)}><PinIcon /> TEXT SIZE LOCKED</Chip>
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
      {(strokes.length > 0 || inkPast.length > 0 || inkFuture.length > 0) && (
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
      {headerExtra}
    </div>
  );

  return (
    <div ref={paneRef} data-pane-role={role} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative", background: "#FFFFFF" }}>
      <PaneHeader
        kicker={role === "main" ? "BIBLE" : "REFERENCE"}
        // The title is no longer a label — it is the book/chapter/verse menu, and it shows at
        // every width, because a pane you cannot navigate is worse than a pane with no subtitle.
        title={`${title || query || "…"}`}
        meta={narrow ? undefined : "ESV"}
        onKicker={onKicker}
        onTitle={() => { haptic("selection"); setNavOpen((v) => !v); }}
        titleGlyph={navOpen ? "\u2303" : "\u2304"}
        titleHint="Book, chapter, verse"
        right={headerRight}
      >
        <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 3, flex: "none" }}>
          <ChapterStep label={"\u2039"} target={prevChapter} book={navBook} inked={prevChapter !== null && !!inkChaptersProp?.has(prevChapter)} onGo={() => stepChapter(-1)} />
          <ChapterStep label={"\u203A"} target={nextChapter} book={navBook} inked={nextChapter !== null && !!inkChaptersProp?.has(nextChapter)} onGo={() => stepChapter(1)} />
          {navOpen && (
            <Popover width={300} onClose={() => setNavOpen(false)} style={{ top: 26, left: -140 }}>
              <BibleNav
                currentBook={navBook}
                currentChapter={navChapter}
                tokens={{ card: "#FFFFFF", ink: "#232227", sub: "#66646C", faint: "#96949B", rule: "#E4E2E6", chip: "#F2F1F2" }}
                variant="popover"
                onClose={() => setNavOpen(false)}
                onPick={(q, verse) => {
                  setNavOpen(false);
                  // jumpToVerse already owns the hard part: it guards on the chapter the pane is
                  // actually rendering, so picking a verse in the open chapter selects now rather
                  // than arming a request that would hijack the next chapter he opens.
                  if (verse) { jumpToVerse(verse, null); return; }
                  if (query && q.trim().toLowerCase() === query.trim().toLowerCase()) return;
                  setHistory((h) => (query ? [...h, query].slice(-12) : h));
                  onQueryChange(q);
                }}
              />
            </Popover>
          )}
        </span>
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
            marginInset={marginInsetProp}
            inkChapters={inkChaptersProp}
            onOpenRef={handleOpenRef}
            onQueryChange={onQueryChange}
            onPassageLoaded={handlePassageLoaded}
            onChapterChange={handleChapterChange}
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
              onHold={onHold}
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
        <ActionBarA x={barAnchor.x} y={barAnchor.y} hand={hand} onAction={barAction} onHighlight={applyCategory} showChips={showChips} marked={markedOnSelection} onUnmark={unmarkSelection} onDragStart={startDragFromBar} />
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
