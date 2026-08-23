"use client";

// The Notebook pane (03 · 04 · 08 · 09 · 01/06 for sermons): a page of
// objects + ink with the tool rail on the seam edge. Autosaves stroke
// deltas; undo/redo by two- and three-finger taps; lasso → menu;
// dictation lands at the cursor; reference cards drop in from the Bible;
// sermon pages record in the header and replay by tapping a stroke;
// worksheets submit — never auto-tick.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { InkCanvas, type InkCanvasHandle } from "./ink-canvas";
import { ToolRail } from "./tool-rail";
import { BrushPopover, PalettePopover } from "./pen-popovers";
import { PageObjects, hitObject, objectRect } from "./page-objects";
import { LassoMenu } from "./lasso-menu";
import { ClosingCard, type Proposal } from "./closing-card";
import { RecordingChip, ReplayBar, type SegmentMeta, type TranscriptLine } from "./recording-control";
import { useDesk, useDeskEvent } from "./desk-state";
import { PaneHeader, Chip, DISPLAY, cardShadow, Popover, Kicker } from "./ui";
import { CheckIcon, RecDot } from "./desk-icons";
import { SermonRecorder } from "@/lib/spirit-recording";
import { fmtSeconds, newId, pageHeightFor, strokeBounds, strokeDistanceTo, type PageObject, type Stroke } from "@/lib/ink";
import { askConfirm, askPrompt } from "./dialog";
import { haptic } from "@/lib/haptics";
import { getOrCreateMicrophoneStream, deactivateMicrophoneStream } from "@/lib/microphone";
import { formatRef } from "@/lib/bible-refs";
import { parseReadingRef } from "@/lib/spirit-refs";

interface PageRow {
  id: string;
  notebookId: string | null;
  kind: string;
  title: string;
  subtitle: string | null;
  dayId: string | null;
  seriesId: string | null;
  weekIndex: number | null;
  refStart: number | null;
  refEnd: number | null;
  background: string;
  strokes: Stroke[];
  objects: PageObject[];
  textLayer: string | null;
  status: string;
  submittedAt: string | null;
  recordingId: string | null;
  transcribedAt: string | null;
  thumbnail: string | null;
  updatedAt: string;
}
interface NotebookRow {
  id: string;
  title: string;
  kind: string;
  accent: string;
  pageCount: number;
  recordingCount: number;
  inkLang: string;
  audioLang: string;
}
interface RecordingRow {
  id: string;
  durationSec: number;
  status: string;
  title: string;
  transcript: TranscriptLine[];
  startedAt: string;
}

export interface NotebookPaneProps {
  railSide: "left" | "right";
  context: "study" | "sermon" | "free";
  initialPageId?: string | null;
  dayId?: string | null;
  onKicker?: () => void;
  onPageChange?: (page: { id: string; kind: string; title: string; refStart: number | null } | null) => void;
}

const PAGE_W = 800;

// One resolve per key at a time: React's dev double-mount (and a double tap)
// must not create two pages for the same day or Sunday.
const inflight = new Map<string, Promise<{ page?: { id: string } } | null>>();
function resolveOnce(key: string, run: () => Promise<Response>) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = run()
    .then((r) => (r.ok ? (r.json() as Promise<{ page?: { id: string } }>) : null))
    .catch(() => null)
    .finally(() => setTimeout(() => inflight.delete(key), 1500));
  inflight.set(key, p);
  return p;
}

export function NotebookPane({ railSide, context, initialPageId, dayId, onPageChange }: NotebookPaneProps) {
  const desk = useDesk();
  const { pen, setPen, popover, setPopover, prefs, setRecording, recordingSeconds, emit } = desk;
  const canvasRef = useRef<InkCanvasHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([]);
  const [page, setPage] = useState<PageRow | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [objects, setObjects] = useState<PageObject[]>([]);
  const [history, setHistory] = useState<{ strokes: Stroke[]; objects: PageObject[] }[]>([]);
  const [future, setFuture] = useState<{ strokes: Stroke[]; objects: PageObject[] }[]>([]);
  const [zoom, setZoom] = useState(1);
  // ——— PINCH: live, 1:1 with the fingers, then crisp ———
  // The page is composited during the gesture (transform only — no layout, no re-render)
  // and re-rasterised at the new scale on release with the point under the fingers held
  // exactly in place. Two fingers moving together pan as well as scale.
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ wx: number; wy: number; k: number; fx: number; fy: number } | null>(null);
  const onPinchZoom = (k: number, center: { x: number; y: number }) => {
    const sc = scrollRef.current, wrap = pageWrapRef.current;
    if (!sc || !wrap) return;
    const r = sc.getBoundingClientRect();
    const fx = center.x - r.left, fy = center.y - r.top; // focal, in the scroller's viewport
    if (!pinchRef.current) {
      // wrapper-pixel coordinate of the point the fingers grabbed
      pinchRef.current = { wx: fx + sc.scrollLeft, wy: fy + sc.scrollTop, k: 1, fx, fy };
    }
    const st = pinchRef.current;
    const clamped = Math.max(0.45 / zoom, Math.min(3.2 / zoom, k));
    st.k = clamped;
    st.fx = fx;
    st.fy = fy;
    // put the grabbed point back under the fingers, scaled — this is the whole trick
    const tx = fx + sc.scrollLeft - clamped * st.wx;
    const ty = fy + sc.scrollTop - clamped * st.wy;
    wrap.style.transformOrigin = "0 0";
    wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${clamped})`;
    wrap.style.willChange = "transform";
  };
  const onPinchEnd = () => {
    const sc = scrollRef.current, wrap = pageWrapRef.current, st = pinchRef.current;
    pinchRef.current = null;
    if (!wrap) return;
    wrap.style.transform = "";
    wrap.style.willChange = "";
    wrap.style.transformOrigin = "";
    if (!sc || !st) return;
    if (Math.abs(st.k - 1) < 0.005) return; // a two-finger pan, not a zoom
    const next = Math.max(0.45, Math.min(3.2, zoom * st.k));
    const applied = next / zoom; // what actually survived the clamp
    setZoom(next);
    haptic("soft");
    // scrollLeft such that the grabbed wrapper point lands back under the fingers
    const left = st.wx * applied - st.fx;
    const top = st.wy * applied - st.fy;
    requestAnimationFrame(() => {
      sc.scrollLeft = Math.max(0, left);
      sc.scrollTop = Math.max(0, top);
    });
  };
  const [paneW, setPaneW] = useState(600);
  const [mode, setMode] = useState<"page" | "list">("page");
  const [listNotebook, setListNotebook] = useState<NotebookRow | null>(null);
  const [listPages, setListPages] = useState<{ id: string; title: string; subtitle: string | null; kind: string; thumbnail: string | null; recordingId: string | null; transcribedAt: string | null; updatedAt: string; refStart: number | null; refEnd: number | null; recording?: { durationSec: number; status: string } | null }[]>([]);
  const [nbMenu, setNbMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [lasso, setLasso] = useState<{ ids: Set<string>; polygon: { x: number; y: number }[]; bounds: { x: number; y: number; w: number; h: number }; client: { x: number; y: number } } | null>(null);
  const [lassoBusy, setLassoBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [freshCards, setFreshCards] = useState<Set<string>>(new Set());
  const [dictating, setDictating] = useState(false);
  const [proposal, setProposal] = useState<{ kind: "page" | "sermon"; data: Proposal } | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [recordingRow, setRecordingRow] = useState<RecordingRow | null>(null);
  const [segments, setSegments] = useState<SegmentMeta[]>([]);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [recElapsed, setRecElapsed] = useState(0);
  const [recLevel, setRecLevel] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [replayStroke, setReplayStroke] = useState<string | null>(null);
  const [noteCard, setNoteCard] = useState<{ text: string; refStart: number; label: string; kind: "question" | "observation"; strokeIds: string[] } | null>(null);
  const recorder = useRef<SermonRecorder | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pending = useRef<{ append: Stroke[]; remove: string[]; objects: boolean }>({ append: [], remove: [], objects: false });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const scale = (paneW / PAGE_W) * zoom;
  const height = useMemo(() => pageHeightFor(strokes, objects), [strokes, objects]);
  const isSermon = page?.kind === "sermon";
  const isWorksheet = page?.kind === "worksheet";
  const readOnly = isWorksheet && page?.status === "submitted";

  // ——— pane width ———
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneW(Math.max(240, el.clientWidth - 2)));
    ro.observe(el);
    setPaneW(Math.max(240, el.clientWidth - 2));
    return () => ro.disconnect();
  }, [mode]);

  // ——— notebooks ———
  const loadNotebooks = useCallback(async () => {
    const r = await fetch("/api/spirit/notebooks").catch(() => null);
    if (r?.ok) setNotebooks((await r.json()).notebooks ?? []);
  }, []);
  useEffect(() => {
    void loadNotebooks();
  }, [loadNotebooks]);

  // ——— open a page ———
  const openPage = useCallback(
    async (id: string) => {
      await flushNow();
      const r = await fetch(`/api/spirit/ink/${id}`).catch(() => null);
      if (!r?.ok) return;
      const d = await r.json();
      const p = d.page as PageRow;
      setPage(p);
      setStrokes((p.strokes ?? []) as Stroke[]);
      setObjects((p.objects ?? []) as PageObject[]);
      setHistory([]);
      setFuture([]);
      setLasso(null);
      setMode("page");
      haptic("light");
      setRecordingRow(d.recording ? { ...d.recording, transcript: (d.recording.transcript ?? []) as TranscriptLine[] } : null);
      if (d.recording?.id) {
        fetch(`/api/spirit/recordings/${d.recording.id}`).then((x) => (x.ok ? x.json() : null)).then((rr) => rr && setSegments(rr.segments ?? [])).catch(() => {});
      } else setSegments([]);
      onPageChange?.({ id: p.id, kind: p.kind, title: p.title, refStart: p.refStart });
      try {
        localStorage.setItem(`spirit-desk-page:${context}`, p.id);
      } catch {}
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context, onPageChange],
  );

  // boot: the right page for the context
  useEffect(() => {
    (async () => {
      if (initialPageId) return openPage(initialPageId);
      if (context === "sermon") {
        const d = await resolveOnce("sermon:open", () => fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open" }) }));
        if (d?.page?.id) return openPage(d.page.id);
      }
      if (context === "study" && dayId) {
        const d = await resolveOnce(`study:${dayId}`, () => fetch("/api/spirit/worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "study", dayId }) }));
        if (d?.page?.id) return openPage(d.page.id);
      }
      const remembered = (() => {
        try {
          return localStorage.getItem(`spirit-desk-page:${context}`);
        } catch {
          return null;
        }
      })();
      if (remembered) return openPage(remembered);
      // a fresh Free page
      const nbs = await (await fetch("/api/spirit/notebooks")).json().catch(() => ({ notebooks: [] }));
      const free = (nbs.notebooks ?? []).find((n: NotebookRow) => n.kind === "free");
      const r = await fetch("/api/spirit/ink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "free", notebookId: free?.id, title: "Free page", objects: [] }) });
      if (r.ok) openPage((await r.json()).page.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, initialPageId, dayId]);

  // ——— saving ———
  // the flush reads the LATEST objects/page through refs: the debounced timer
  // otherwise closes over the state from when the save was scheduled and
  // would PATCH a stale object list (the ref-card drop used to vanish)
  const objectsRef = useRef(objects);
  const pageRef = useRef(page);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const flushNow = useCallback(async () => {
    const cur = pageRef.current;
    if (!cur) return;
    const { append, remove, objects: objDirty } = pending.current;
    if (!append.length && !remove.length && !objDirty) return;
    pending.current = { append: [], remove: [], objects: false };
    setSaving("saving");
    const body: Record<string, unknown> = {};
    if (append.length) body.appendStrokes = append;
    if (remove.length) body.removeStrokeIds = remove;
    if (objDirty) body.objects = objectsRef.current;
    try {
      const r = await fetch(`/api/spirit/ink/${cur.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSaving(r.ok ? "saved" : "offline");
      if (!r.ok) throw new Error("save failed");
    } catch {
      pending.current = { append: [...append, ...pending.current.append], remove: [...remove, ...pending.current.remove], objects: objDirty || pending.current.objects };
      setSaving("offline");
    }
  }, []);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushNow(), 1200);
    if (!thumbTimer.current) {
      thumbTimer.current = setTimeout(() => {
        thumbTimer.current = null;
        const png = canvasRef.current?.renderPng({ region: { x: 0, y: 0, w: PAGE_W, h: 560 }, scale: 0.22 });
        if (png && page) fetch(`/api/spirit/ink/${page.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thumbnail: png }) }).catch(() => {});
      }, 15000);
    }
  }, [flushNow, page]);
  useEffect(() => {
    const onHide = () => void flushNow();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [flushNow]);

  const pushHistory = () => {
    setHistory((h) => [...h.slice(-40), { strokes, objects }]);
    setFuture([]);
  };
  // ——— sections that grow (the sermon/study templates): push everything below a line down ———
  const growBelow = (boundaryY: number, delta: number, baseStrokes: Stroke[], baseObjects: PageObject[]) => {
    const movedObjects = baseObjects.map((o) => (o.y >= boundaryY - 1 ? { ...o, y: o.y + delta } : o));
    const moved: Stroke[] = [];
    const nextStrokes = baseStrokes.map((st) => {
      const b = strokeBounds(st);
      if (b.y + b.h / 2 < boundaryY - 1) return st; // decided by the stroke's middle — never sliced
      const ns = { ...st, pts: st.pts.map((pt) => ({ ...pt, y: pt.y + delta })) };
      moved.push(ns);
      return ns;
    });
    return { objects: movedObjects, strokes: nextStrokes, moved };
  };
  const applyGrow = (boundaryY: number, delta: number, fromStrokes: Stroke[], fromObjects: PageObject[]) => {
    const g = growBelow(boundaryY, delta, fromStrokes, fromObjects);
    setObjects(g.objects);
    setStrokes(g.strokes);
    pending.current.objects = true;
    // moved strokes are re-written: remove the old ids, append the moved copies (same ids → replace)
    if (g.moved.length) {
      pending.current.remove.push(...g.moved.map((m) => m.id));
      pending.current.append.push(...g.moved);
    }
    scheduleSave();
  };
  const lastGrowAt = useRef(0);
  const sectionsSorted = () => objects.filter((o) => o.type === "section").sort((a, b) => a.y - b.y);
  /** the stroke just written sits in a section and reaches its floor → the section grows */
  const autoGrowFor = (stroke: Stroke, current: Stroke[], currentObjects: PageObject[]) => {
    const secs = currentObjects.filter((o) => o.type === "section").sort((a, b) => a.y - b.y);
    if (secs.length < 2) return;
    const b = strokeBounds(stroke);
    const idx = secs.findIndex((sec, i) => b.y >= sec.y && (i === secs.length - 1 || b.y < secs[i + 1].y));
    if (idx < 0 || idx === secs.length - 1) return;
    const nextSec = secs[idx + 1];
    const floor = nextSec.y;
    // he must be writing in THIS heading's column, not brushing the far margin
    const r = objectRect(nextSec);
    const overlap = Math.min(b.x + b.w, r.x + (r.w ?? PAGE_W)) - Math.max(b.x, r.x);
    if (overlap < 24) return;
    if (Date.now() - lastGrowAt.current < 1200) return; // one nudge per word, not per stroke
    // only when the ink has ACTUALLY run into the next heading — not merely approached it.
    // (It used to fire 56 units early, which moved a section while he was still writing
    // comfortably inside his own; that read as the page moving on its own.)
    if (b.y + b.h > floor + 4) {
      // exactly the overrun, snapped to the 32-unit rule so the page keeps its rhythm
      const delta = Math.max(32, Math.ceil((b.y + b.h + 40 - floor) / 32) * 32);
      lastGrowAt.current = Date.now();
      // everything at/below the NEXT section moves; the stroke that triggered it stays where he wrote it
      const others = current.filter((st) => st.id !== stroke.id);
      const g = growBelow(floor, delta, others, currentObjects);
      setObjects(g.objects);
      setStrokes([...g.strokes, stroke]);
      pending.current.objects = true;
      if (g.moved.length) {
        pending.current.remove.push(...g.moved.map((m) => m.id));
        pending.current.append.push(...g.moved);
      }
      // never silent: say which heading moved, and hand him the way back
      haptic("soft");
      const movedLabel = String((secs[idx + 1].data as { label?: string })?.label ?? "the next section");
      toast(`${movedLabel} moved down to make room`, { action: { label: "Undo", onClick: () => undo() } });
    }
  };
  const applyStrokes = (next: Stroke[], delta: { appended?: Stroke[]; removed?: string[] }) => {
    if (readOnly) return;
    pushHistory();
    setStrokes(next);
    if (delta.appended?.length) pending.current.append.push(...delta.appended);
    if (delta.removed?.length) pending.current.remove.push(...delta.removed);
    scheduleSave();
    if (delta.appended?.length === 1 && (isSermon || page?.kind === "study" || page?.kind === "worksheet")) autoGrowFor(delta.appended[0], next, objects);
  };
  const applyObjects = (next: PageObject[]) => {
    pushHistory();
    setObjects(next);
    pending.current.objects = true;
    scheduleSave();
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, { strokes, objects }]);
    const removed = strokes.filter((s) => !prev.strokes.find((p) => p.id === s.id)).map((s) => s.id);
    const added = prev.strokes.filter((s) => !strokes.find((p) => p.id === s.id));
    setStrokes(prev.strokes);
    setObjects(prev.objects);
    pending.current.remove.push(...removed);
    pending.current.append.push(...added);
    pending.current.objects = true;
    scheduleSave();
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next) return;
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, { strokes, objects }]);
    const removed = strokes.filter((s) => !next.strokes.find((p) => p.id === s.id)).map((s) => s.id);
    const added = next.strokes.filter((s) => !strokes.find((p) => p.id === s.id));
    setStrokes(next.strokes);
    setObjects(next.objects);
    pending.current.remove.push(...removed);
    pending.current.append.push(...added);
    pending.current.objects = true;
    scheduleSave();
  };

  // ——— objects: add helpers ———
  const nextFreeY = () => {
    let bottom = 150;
    for (const s of strokes) {
      const b = strokeBounds(s);
      bottom = Math.max(bottom, b.y + b.h);
    }
    for (const o of objects) {
      if (o.type === "section") continue;
      bottom = Math.max(bottom, o.y + (objectRect(o).h ?? 60));
    }
    return bottom + 16;
  };
  const addRefCard = async (refStart: number, refEnd: number, label: string, text: string, at?: { x: number; y: number }) => {
    let body = text;
    if (!body) {
      const r = await fetch(`/api/spirit/passage?q=${encodeURIComponent(label)}`).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        body = ((d.verses ?? []) as { text: string; lines?: string[] }[]).slice(0, 3).map((v) => (v.lines ? v.lines.join(" ") : v.text)).join(" ");
      }
    }
    const o: PageObject = {
      id: newId(),
      type: "refcard",
      x: at ? Math.max(24, Math.min(PAGE_W - 220, at.x - 90)) : 24 + (objects.filter((x) => x.type === "refcard").length % 3) * 210,
      y: at ? Math.max(120, at.y - 20) : nextFreeY(),
      w: 196,
      h: 76,
      t0: Date.now(),
      recT: recordingSeconds(),
      data: { refStart, refEnd, label, text: body, droppedAt: recordingSeconds() },
    };
    applyObjects([...objects, o]);
    haptic("success");
    setFreshCards((s) => new Set([...Array.from(s), o.id]));
    setTimeout(() => setFreshCards((s) => { const n = new Set(s); n.delete(o.id); return n; }), 6000);
  };

  useDeskEvent(
    (e) => {
      if (e.type === "send-to-notes") {
        let at: { x: number; y: number } | undefined;
        if (e.source?.startsWith("drag:") && canvasRef.current) {
          const [cx, cy] = e.source.slice(5).split(",").map(Number);
          at = canvasRef.current.clientToPage(cx, cy);
        }
        void addRefCard(e.refStart, e.refEnd, e.label, e.text, at);
      } else if (e.type === "notebook-open-page") {
        void openPage(e.pageId);
      } else if (e.type === "notebook-page-list") {
        const nb = notebooks.find((n) => n.id === page?.notebookId) ?? notebooks[0];
        if (nb) void openList(nb);
      } else if (e.type === "dictate") {
        addTextBlock(e.text, true);
      } else if (e.type === "answer-box") {
        if (objects.some((o) => o.type === "answer")) return;
        const o: PageObject = { id: newId(), type: "answer", x: 24, y: nextFreeY(), w: PAGE_W - 48, h: 220, t0: Date.now(), data: { question: e.question, mode: "ink", text: "", filed: false, dayId: e.dayId, refStart: e.refStart } };
        applyObjects([...objects, o]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: o.y * scale - 60, behavior: "smooth" }), 50);
      } else if (e.type === "worksheet-open") {
        void (async () => {
          const r = await fetch("/api/spirit/worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", dayId: e.dayId }) });
          if (r.ok) {
            const d = await r.json();
            if (d.page?.id) openPage(d.page.id);
          }
        })();
      }
    },
    [objects, strokes, page, notebooks, scale],
  );

  const addTextBlock = (text: string, pendingFlag = false, at?: { x: number; y: number }) => {
    const o: PageObject = { id: newId(), type: "text", x: at?.x ?? 24, y: at?.y ?? nextFreeY(), w: 420, h: 60, t0: Date.now(), recT: recordingSeconds(), data: { text, pending: pendingFlag } };
    applyObjects([...objects, o]);
    if (!pendingFlag) setEditing({ id: o.id, value: text });
    return o;
  };

  // ——— taps on the page: objects, chips, cards ———
  // ——— MOVE A PAGE OBJECT: press and hold it, then drag. Text blocks, reference cards and
  // photos all move; the ink stays put. Saved through the same objects PATCH. ———
  const [moveObj, setMoveObj] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const onObjectHold = (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => {
    const o = hitObject(objects, pt.x, pt.y);
    if (!o || o.type === "section" || o.type === "header") return false;
    pushHistory();
    haptic("medium");
    setMoveObj({ id: o.id, dx: pt.x - o.x, dy: pt.y - o.y });
    return true;
  };
  const onObjectDragMove = (c: { x: number; y: number }) => {
    const mv = moveObj;
    if (!mv || !canvasRef.current) return;
    const pg = canvasRef.current.clientToPage(c.x, c.y);
    setObjects((os) => os.map((o) => (o.id === mv.id ? { ...o, x: Math.max(8, Math.min(PAGE_W - 40, pg.x - mv.dx)), y: Math.max(8, pg.y - mv.dy) } : o)));
  };
  const onObjectDragEnd = () => {
    if (!moveObj) return;
    setMoveObj(null);
    haptic("light");
    pending.current.objects = true;
    scheduleSave();
  };

  const onTap = (pt: { x: number; y: number; clientX: number; clientY: number; pointerType: string }) => {
    lastTap.current = { x: pt.x, y: pt.y };
    // A PEN HOLDING A DRAWING TOOL IS WRITING, NOT TAPPING. The study/sermon/worksheet
    // templates tile the page with full-width `prompt` objects; short marks (the dot of an
    // i, a comma, a stem) were classified as taps, "hit" one of those passive objects, and
    // the ink was thrown away. Only genuinely interactive things may claim a pen tap.
    const penWriting = pt.pointerType === "pen" && (pen.tool === "fountain" || pen.tool === "gpen" || pen.tool === "pencil" || pen.tool === "marker");
    if (lasso) {
      setLasso(null);
      return true;
    }
    // a stroke tap → replay (finger, or any pointer when the page has a recording and the tool is not a drawing pen on a finger tap)
    if (recordingRow && pt.pointerType === "touch") {
      const hit = strokes.find((s) => strokeDistanceTo(s, pt.x, pt.y) < 14 / scale);
      if (hit && typeof hit.recT === "number") {
        setReplayStroke(hit.id);
        setSeekTo(hit.recT);
        return true;
      }
    }
    const els = document.elementsFromPoint(pt.clientX, pt.clientY) as HTMLElement[];
    const growEl = els.find((el) => el.closest?.("[data-section-grow]"))?.closest?.("[data-section-grow]") as HTMLElement | null;
    if (growEl) {
      const secId = growEl.getAttribute("data-section-grow");
      const secs = sectionsSorted();
      const i = secs.findIndex((o) => o.id === secId);
      if (i >= 0) {
        pushHistory();
        haptic("light");
        const floor = i < secs.length - 1 ? secs[i + 1].y : Math.max(height - 40, secs[i].y + 200);
        applyGrow(floor, 200, strokes, objects);
      }
      return true;
    }
    const chipEl = els.find((el) => el.closest?.("[data-chip-ref]"))?.closest?.("[data-chip-ref]") as HTMLElement | null;
    if (chipEl) {
      emit({ type: "open-main", q: chipEl.getAttribute("data-chip-ref")!.replace(/:\d.*$/, "") });
      return true;
    }
    const modeEl = els.find((el) => el.closest?.("[data-answer-mode]"))?.closest?.("[data-answer-mode]") as HTMLElement | null;
    if (modeEl) {
      const m = modeEl.getAttribute("data-answer-mode") as "ink" | "type" | "speak";
      setAnswerMode(m);
      return true;
    }
    const o = hitObject(objects, pt.x, pt.y);
    if (!o) {
      // close the open editor, but never swallow the mark that closed it
      if (editing) commitEdit();
      return editing ? !penWriting : false;
    }
    if (o.type === "refcard") {
      const d = o.data as { refStart: number; refEnd: number; label: string };
      emit({ type: "jump-reference-pane", refStart: d.refStart, refEnd: d.refEnd });
      return true;
    }
    if (o.type === "text" && penWriting) return false; // write across a typed block if you like
    if (o.type === "text") {
      const d = o.data as { text?: string; pending?: boolean };
      if (d.pending) {
        applyObjects(objects.map((x) => (x.id === o.id ? { ...x, data: { ...x.data, pending: false } } : x)));
      } else setEditing({ id: o.id, value: d.text ?? "" });
      return true;
    }
    if (o.type === "header" && isSermon && !penWriting) {
      editSermonHeader();
      return true;
    }
    if (o.type === "answer") {
      const d = o.data as { mode?: string; text?: string };
      if (d.mode === "type" && !penWriting) {
        setEditing({ id: o.id, value: d.text ?? "" });
        return true;
      }
      return false; // ink mode: he is writing his answer IN the box
    }
    if (o.type === "prompt") {
      const d = o.data as { field?: boolean; value?: string };
      if (d.field && !penWriting) {
        void (async () => {
          const v = await askPrompt({ title: "Type it", value: d.value ?? "" });
          if (v !== null) applyObjects(objects.map((x) => (x.id === o.id ? { ...x, data: { ...x.data, value: v } } : x)));
        })();
        return true;
      }
      return false; // a plain prompt is paper — writing on it is writing
    }
    return false;
  };
  const commitEdit = () => {
    if (!editing) return;
    const o = objects.find((x) => x.id === editing.id);
    if (!o) return setEditing(null);
    const value = editing.value;
    if (o.type === "text" && !value.trim()) applyObjects(objects.filter((x) => x.id !== o.id));
    else applyObjects(objects.map((x) => (x.id === o.id ? { ...x, data: { ...x.data, text: value, pending: false } } : x)));
    setEditing(null);
  };
  const setAnswerMode = (m: "ink" | "type" | "speak") => {
    const a = objects.find((o) => o.type === "answer");
    if (!a) return;
    applyObjects(objects.map((x) => (x.id === a.id ? { ...x, data: { ...x.data, mode: m } } : x)));
    if (m === "type") setEditing({ id: a.id, value: String((a.data as { text?: string }).text ?? "") });
    if (m === "speak") void dictate(a.id);
  };
  const editSermonHeader = async () => {
    if (!page) return;
    const church = await askPrompt({ title: "Church", value: prefs.sermon.church || "", placeholder: "Iglesia…" });
    if (church === null) return;
    const preacher = await askPrompt({ title: "Preacher", value: prefs.sermon.preacher || "", placeholder: "Pr. …" });
    if (preacher === null) return;
    const passage = await askPrompt({ title: "Passage", value: page.refStart ? formatRef(page.refStart, page.refEnd ?? page.refStart) : "", placeholder: "e.g. Galatians 3:1-14" });
    const r = await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "header", pageId: page.id, church, preacher, passage }) });
    if (r.ok) {
      const d = await r.json();
      setObjects((d.page.objects ?? []) as PageObject[]);
      setPage((p) => (p ? { ...p, refStart: d.page.refStart, refEnd: d.page.refEnd, subtitle: d.page.subtitle } : p));
      desk.updatePrefs((p) => ({ ...p, sermon: { church: church ?? p.sermon.church, preacher: preacher ?? p.sermon.preacher } }));
    }
  };

  // ——— lasso ———
  const onLasso = (selected: Stroke[], polygon: { x: number; y: number }[], bounds: { x: number; y: number; w: number; h: number }) => {
    if (selected.length) haptic("light");
    if (!selected.length || !canvasRef.current) return;
    const c = canvasRef.current.pageToClient(bounds.x + bounds.w / 2, bounds.y);
    setLasso({ ids: new Set(selected.map((s) => s.id)), polygon, bounds, client: { x: c.x - 160, y: c.y } });
  };
  const lassoStrokes = () => strokes.filter((s) => lasso?.ids.has(s.id));
  const nearestCard = (b: { x: number; y: number; w: number; h: number }) => {
    let best: PageObject | null = null;
    let bd = Infinity;
    for (const o of objects) {
      if (o.type !== "refcard") continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const lassoImage = (pad = 16) => {
    if (!lasso) return null;
    const region = { x: Math.max(0, lasso.bounds.x - pad), y: Math.max(0, lasso.bounds.y - pad), w: lasso.bounds.w + pad * 2, h: lasso.bounds.h + pad * 2 };
    return canvasRef.current?.renderPng({ region, scale: 2, background: "#FFFFFF" }) ?? null;
  };
  const recognize = async (imageDataUrl: string, scope: "selection" | "page", context?: string) => {
    if (!page) return null;
    const r = await fetch(`/api/spirit/ink/${page.id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl, scope, context }) });
    if (!r.ok) return null;
    return (await r.json()).proposal as Proposal & { lines: { text: string }[] };
  };
  const lassoConvert = async () => {
    const img = lassoImage();
    if (!img || !lasso) return;
    setLassoBusy(true);
    try {
      const p = await recognize(img, "selection", "a lassoed part of the page");
      if (!p?.text?.trim()) return toast.error("Couldn't read that.");
      const at = { x: lasso.bounds.x, y: lasso.bounds.y };
      pushHistory();
      const remaining = strokes.filter((s) => !lasso.ids.has(s.id));
      setStrokes(remaining);
      pending.current.remove.push(...Array.from(lasso.ids));
      const o: PageObject = { id: newId(), type: "text", x: at.x, y: at.y, w: Math.max(260, Math.min(520, lasso.bounds.w + 40)), h: 60, t0: Date.now(), data: { text: p.text, label: "CONVERTED FROM INK" } };
      setObjects((os) => [...os, o]);
      pending.current.objects = true;
      scheduleSave();
      setLasso(null);
    } finally {
      setLassoBusy(false);
    }
  };
  const lassoNote = async () => {
    const img = lassoImage();
    if (!img || !lasso) return;
    setLassoBusy(true);
    try {
      const p = await recognize(img, "selection", "a note he wants to keep");
      const card = nearestCard(lasso.bounds);
      const refStart = card ? (card.data as { refStart: number }).refStart : page?.refStart ?? 1001001;
      setNoteCard({ text: p?.text ?? "", refStart, label: formatRef(refStart), kind: p?.text?.trim().endsWith("?") ? "question" : "observation", strokeIds: Array.from(lasso.ids) });
    } finally {
      setLassoBusy(false);
    }
  };
  const lassoCopy = async () => {
    const img = lassoImage();
    if (!img) return;
    try {
      const blob = await (await fetch(img)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Copied as an image.");
    } catch {
      window.open(img, "_blank");
    }
    setLasso(null);
  };
  const lassoDelete = () => {
    if (!lasso) return;
    applyStrokes(strokes.filter((s) => !lasso.ids.has(s.id)), { removed: Array.from(lasso.ids) });
    setLasso(null);
  };
  const saveNote = async () => {
    if (!noteCard) return;
    await fetch("/api/spirit/layer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "note", refStart: noteCard.refStart, kind: noteCard.kind, body: noteCard.text || "(ink note)", spoken: false }) });
    toast.success(`Kept as a${noteCard.kind === "observation" ? "n Observation" : " Question"} on ${noteCard.label}`);
    setNoteCard(null);
    setLasso(null);
  };

  // move mode: drag the selection with the next pointer drag on the handle
  const moveStart = useRef<{ x: number; y: number; orig: Stroke[] } | null>(null);

  // ——— dictation (08d) ———
  const dictate = async (targetAnswerId?: string) => {
    if (dictating) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await getOrCreateMicrophoneStream();
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        deactivateMicrophoneStream();
        setDictating(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        const form = new FormData();
        form.append("audio", blob, `note.${mime.includes("mp4") ? "mp4" : "webm"}`);
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.text?.trim()) {
          if (targetAnswerId) applyObjects(objects.map((x) => (x.id === targetAnswerId ? { ...x, data: { ...x.data, text: `${(x.data as { text?: string }).text ?? ""}${(x.data as { text?: string }).text ? " " : ""}${body.text.trim()}`, mode: "speak" } } : x)));
          else addTextBlock(body.text.trim(), true, lastTap.current ? { x: lastTap.current.x, y: lastTap.current.y } : undefined);
        } else toast.error("Couldn't hear that.");
      };
      recorderRef.current = rec;
      rec.start(250);
      setDictating(true);
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  // ——— photos ———
  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        const max = 900;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
    const o: PageObject = { id: newId(), type: "image", x: 24 + 40, y: nextFreeY(), w: 220, h: 170, t0: Date.now(), recT: recordingSeconds(), data: { src: dataUrl, caption: f.name.replace(/\.[a-z0-9]+$/i, "") } };
    applyObjects([...objects, o]);
  };

  // ——— recording (sermon pages) ———
  useEffect(() => {
    const id = setInterval(() => {
      if (recorder.current && recorder.current.state !== "stopped") {
        setRecElapsed(recorder.current.elapsedSeconds());
        setUploading(recorder.current.pendingUploads);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);
  const startRecording = async () => {
    if (!page) return;
    if (!prefs.recording.consent) return toast("Recording is off in Settings — strokes timestamp against the clock.");
    const r = await fetch("/api/spirit/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: page.id, seriesId: page.seriesId, weekIndex: page.weekIndex, title: page.title, preacher: prefs.sermon.preacher || null, passageRef: page.refStart ? formatRef(page.refStart, page.refEnd ?? page.refStart) : null, lang: notebooks.find((n) => n.id === page.notebookId)?.audioLang ?? "es", mimeType: SermonRecorder.bestMime().split(";")[0], retention: prefs.recording.retention }),
    });
    if (!r.ok) return toast.error("Couldn't start the recording.");
    const row = (await r.json()).recording as RecordingRow;
    const sr = new SermonRecorder(row.id, {
      onLevel: setRecLevel,
      onStateChange: (s) => setRecState(s),
      onSegment: (_i, ok, err) => {
        if (!ok) toast.error(`A segment didn't upload (${err ?? "network"}) — it keeps retrying.`);
      },
    });
    try {
      await sr.start();
    } catch {
      return toast.error("Could not access microphone.");
    }
    recorder.current = sr;
    setRecordingRow({ ...row, transcript: [] });
    setPage((p) => (p ? { ...p, recordingId: row.id } : p));
    setRecording({ recordingId: row.id, startEpoch: sr.startEpoch, paused: false, pausedAccum: 0, pausedSince: null });
  };
  const toggleRecording = () => {
    const sr = recorder.current;
    if (!sr) return;
    if (sr.state === "recording") {
      sr.pause();
      setRecording((r) => (r ? { ...r, paused: true, pausedSince: Date.now() } : r));
    } else if (sr.state === "paused") {
      sr.resume();
      setRecording((r) => (r ? { ...r, paused: false, pausedAccum: r.pausedAccum + (r.pausedSince ? Date.now() - r.pausedSince : 0), pausedSince: null } : r));
    }
  };
  const stopRecording = async () => {
    const sr = recorder.current;
    if (!sr || !recordingRow) return;
    const total = await sr.stop();
    setRecording(null);
    await fetch(`/api/spirit/recordings/${recordingRow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSec: total, status: "uploaded" }) }).catch(() => {});
    toast.success("Recording kept — transcribing in the background.");
    // wait for uploads then transcribe in a few calls
    const poll = async () => {
      for (let i = 0; i < 60 && sr.pendingUploads > 0; i++) await new Promise((r) => setTimeout(r, 500));
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`/api/spirit/recordings/${recordingRow.id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxSegments: 5 }) }).catch(() => null);
        if (!r?.ok) break;
        const d = await r.json();
        if (d.finished || d.status === "ready" || d.status === "audio_deleted") break;
      }
      const rr = await fetch(`/api/spirit/recordings/${recordingRow.id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (rr?.recording) {
        setRecordingRow({ ...rr.recording, transcript: (rr.recording.transcript ?? []) as TranscriptLine[] });
        setSegments(rr.segments ?? []);
        toast.success("Sunday's recording is transcribed — tap any stroke to replay.");
      }
    };
    void poll();
    setRecState("stopped");
  };

  // ——— close the page (sermon) / transcribe (others) ———
  const closePage = async () => {
    if (!page) return;
    await flushNow();
    const img = canvasRef.current?.renderPng({ region: { x: 0, y: 0, w: PAGE_W, h: Math.min(height, 3200) }, scale: 1.1, background: "#FFFFFF" });
    setProposalBusy(true);
    try {
      if (isSermon) {
        const r = await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", pageId: page.id, imageDataUrl: img }) });
        if (!r.ok) throw new Error();
        setProposal({ kind: "sermon", data: (await r.json()).proposal });
      } else {
        if (!img) throw new Error();
        const p = await recognize(img, "page");
        if (!p) throw new Error();
        setProposal({ kind: "page", data: { ...p, pageId: page.id } });
      }
    } catch {
      toast.error("Couldn't read the page.");
    } finally {
      setProposalBusy(false);
    }
  };
  const confirmProposal = async (payload: { text: string; refs: { refStart: number; refEnd: number; label: string; action: string; context: string }[]; questions: string[] }) => {
    if (!proposal || !page) return;
    setProposalBusy(true);
    try {
      const r = proposal.kind === "sermon"
        ? await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", pageId: page.id, ...payload }) })
        : await fetch(`/api/spirit/ink/${page.id}/transcribe`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setPage((p) => (p ? { ...p, textLayer: payload.text, transcribedAt: new Date().toISOString() } : p));
      toast.success(proposal.kind === "sermon" ? `Sunday's page closed — ${d.kept ?? 0} kept${d.series ? " · next week prepped" : ""}.` : `Kept ${d.created ?? 0} — the text layer is searchable.`);
      setProposal(null);
    } catch {
      toast.error("Couldn't keep it.");
    } finally {
      setProposalBusy(false);
    }
  };

  // ——— worksheet submit (09) ———
  const submit = async (action: "submit" | "reopen") => {
    if (!page) return;
    await flushNow();
    const r = await fetch("/api/spirit/worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, pageId: page.id }) });
    if (r.ok) haptic(action === "submit" ? "success" : "light");
    if (r.ok) {
      const d = await r.json();
      setPage((p) => (p ? { ...p, status: d.page.status, submittedAt: d.page.submittedAt } : p));
      if (action === "submit") toast.success("Submitted — the homework is ticked.");
    }
  };

  // ——— page list (08a) ———
  const openList = async (nb: NotebookRow) => {
    await flushNow();
    const r = await fetch(`/api/spirit/notebooks/${nb.id}`);
    if (!r.ok) return;
    const d = await r.json();
    setListNotebook(nb);
    setListPages(d.pages ?? []);
    setMode("list");
    setNbMenu(false);
  };
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** delete one or many pages from the list, with the warning */
  const deletePages = async (ids: string[]) => {
    if (!ids.length) return;
    const titles = listPages.filter((p) => ids.includes(p.id)).map((p) => p.title || p.kind);
    const ok = await askConfirm({
      title: ids.length === 1 ? `Delete "${titles[0]}"?` : `Delete ${ids.length} pages?`,
      body: ids.length === 1 ? "Its ink is gone for good. A recording attached to it stays in the library." : `${titles.slice(0, 3).join(" · ")}${ids.length > 3 ? ` · +${ids.length - 3} more` : ""}. Their ink is gone for good; recordings stay in the library.`,
      confirmLabel: ids.length === 1 ? "Delete page" : `Delete ${ids.length} pages`,
      danger: true,
    });
    if (!ok) return;
    haptic("warning");
    await Promise.all(ids.map((id) => fetch(`/api/spirit/ink/${id}`, { method: "DELETE" })));
    if (page && ids.includes(page.id)) { setPage(null); setStrokes([]); setObjects([]); }
    setSelected(new Set());
    setSelectMode(false);
    await loadNotebooks();
    if (listNotebook) await openList(listNotebook);
    // deleting is never the end of a page: it rests in the trash, and this brings it straight back
    toast(ids.length === 1 ? "Page moved to the trash" : `${ids.length} pages moved to the trash`, {
      action: {
        label: "Undo",
        onClick: () => {
          void (async () => {
            await Promise.all(ids.map((id) => fetch(`/api/spirit/ink/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) })));
            await loadNotebooks();
            if (listNotebook) await openList(listNotebook);
            haptic("success");
          })();
        },
      },
      duration: 12000,
    });
  };
  const deletePage = async () => {
    if (!page) return;
    if (!(await askConfirm({ title: `Delete "${page.title || "this page"}"?`, body: `Its ink is gone for good${recordingRow ? " — the recording stays in the library" : ""}.`, confirmLabel: "Delete page", danger: true }))) return;
    const nbRow = notebooks.find((n) => n.id === page.notebookId) ?? null;
    const goneId = page.id;
    pending.current = { append: [], remove: [], objects: false };
    await fetch(`/api/spirit/ink/${goneId}`, { method: "DELETE" });
    toast("Page moved to the trash", {
      action: {
        label: "Undo",
        onClick: () => {
          void (async () => {
            await fetch(`/api/spirit/ink/${goneId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
            await loadNotebooks();
            await openPage(goneId);
            haptic("success");
          })();
        },
      },
      duration: 12000,
    });
    try {
      localStorage.removeItem(`spirit-desk-page:${context}`);
    } catch {}
    setPage(null);
    setStrokes([]);
    setObjects([]);
    await loadNotebooks();
    if (nbRow) await openList(nbRow);
  };
  const newPage = async (nb: NotebookRow) => {
    haptic("medium");
    const kind = nb.kind === "sermons" ? "sermon" : nb.kind === "worksheets" ? "free" : "free";
    if (kind === "sermon") {
      const r = await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", fresh: true }) });
      if (r.ok) return openPage((await r.json()).page.id);
    }
    const r = await fetch("/api/spirit/ink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "free", notebookId: nb.id, title: `${nb.title} · page ${nb.pageCount + 1}`, objects: [] }) });
    if (r.ok) openPage((await r.json()).page.id);
  };

  const nb = notebooks.find((n) => n.id === page?.notebookId) ?? null;
  const pageIndex = page && listNotebook?.id === page.notebookId ? listPages.findIndex((p) => p.id === page.id) + 1 : null;
  const answerObj = objects.find((o) => o.type === "answer");
  const editingObj = editing ? objects.find((o) => o.id === editing.id) : null;
  const stripW = paneW;
  const rail = (
    <ToolRail
      side={railSide}
      onUndo={undo}
      onRedo={redo}
      canUndo={history.length > 0}
      canRedo={future.length > 0}
      onText={() => {
        setPen({ tool: "text" });
        addTextBlock("", false, lastTap.current ?? undefined);
      }}
      onRefCard={async () => {
        const ref = await askPrompt({ title: "Reference card", placeholder: "e.g. Romans 9:6", confirmLabel: "Add card" });
        if (!ref) return;
        const segs = parseReadingRef(ref);
        if (!segs.length) return toast.error("Couldn't read that reference.");
        void addRefCard(segs[0].refStart, segs[0].refEnd, segs[0].label, "", lastTap.current ?? undefined);
      }}
      onPhoto={() => fileRef.current?.click()}
      onMic={() => void dictate()}
      micActive={dictating}
      compact={paneW < 420}
    />
  );

  return (
    <div ref={paneRef} data-notebook-drop="1" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative", background: "#FFFFFF" }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" style={{ display: "none" }} onChange={(e) => void onPhoto(e.target.files)} />
      <PaneHeader
        kicker="NOTEBOOK"
        onKicker={() => setNbMenu((v) => !v)}
        title={mode === "list" ? listNotebook?.title : nb?.title ?? page?.title ?? "…"}
        meta={mode === "list" ? `${listPages.length} pages` : page ? (pageIndex ? `p. ${pageIndex}` : page.subtitle ?? "") : ""}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "page" && page?.transcribedAt && <Chip tone="success">TRANSCRIBED ✓</Chip>}
            {mode === "page" && isSermon && (
              <RecordingChip state={recordingRow && recState === "idle" && recordingRow.status !== "recording" ? "stopped" : recState} elapsed={recState === "stopped" ? recordingRow?.durationSec ?? recElapsed : recElapsed} level={recLevel} onToggle={toggleRecording} onStart={startRecording} onStop={stopRecording} consent={prefs.recording.consent} uploading={uploading} />
            )}
            {mode === "page" && !isSermon && <span style={{ fontSize: 10, color: "#A9A7AE" }}>{saving === "saving" ? "saving…" : saving === "offline" ? "offline — keeps retrying" : saving === "saved" ? "saved · just now" : isSermon ? "" : "strokes timestamp against the lesson"}</span>}
            {mode === "page" && (
              <div style={{ position: "relative" }}>
                <button type="button" onClick={() => setMoreMenu((v) => !v)} style={{ fontSize: 12, color: "#96949B", background: "none", border: 0, cursor: "pointer" }} aria-label="More">⋯</button>
                {moreMenu && (
                  <Popover width={232} onClose={() => setMoreMenu(false)} style={{ right: 0, top: 24 }}>
                    <Kicker>THIS PAGE</Kicker>
                    {[
                      { label: "New page", run: () => nb && newPage(nb) },
                      { label: isSermon ? "Close the page — read it" : "Transcribe this page", run: closePage },
                      { label: "Page list", run: () => nb && openList(nb) },
                      { label: zoom === 1 ? "Zoom 150%" : "Zoom 100%", run: () => setZoom((z) => (z === 1 ? 1.5 : 1)) },
                      { label: "Export as PNG", run: () => { const png = canvasRef.current?.renderPng({ scale: 1.5 }); if (png) window.open(png, "_blank"); } },
                      { label: "Clear the ink", run: async () => { if (!strokes.length || !(await askConfirm({ title: "Clear every stroke on this page?", body: "The cards and sections stay. Undo brings the ink back while the page is open.", confirmLabel: "Clear ink", danger: true }))) return; applyStrokes([], { removed: strokes.map((x) => x.id) }); } },
                      { label: "Delete this page", run: deletePage, danger: true },
                    ].map((m) => (
                      <button key={m.label} type="button" onClick={() => { setMoreMenu(false); void m.run(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 4, borderRadius: 9, fontSize: 12, fontWeight: 600, color: (m as { danger?: boolean }).danger ? "#B4533F" : "#232227", background: "transparent", border: 0, cursor: "pointer" }}>
                        {m.label}
                      </button>
                    ))}
                  </Popover>
                )}
              </div>
            )}
            {mode === "list" && selectMode && selected.size > 0 && <button type="button" onClick={() => void deletePages(Array.from(selected))} style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "#B4533F", border: 0, borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>Delete {selected.size}</button>}
            {mode === "list" && listPages.length > 0 && <button type="button" onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); haptic("selection"); }} style={{ fontSize: 10, fontWeight: 600, color: selectMode ? "#FFFFFF" : "#66646C", background: selectMode ? "#232227" : "none", border: selectMode ? 0 : "1px solid #E4E2E6", borderRadius: 99, padding: "4px 10px", cursor: "pointer" }}>{selectMode ? "Done" : "Select"}</button>}
            {mode === "list" && !selectMode && <button type="button" onClick={() => listNotebook && newPage(listNotebook)} style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>+ page</button>}
            {mode === "list" && page && <button type="button" onClick={() => setMode("page")} style={{ fontSize: 10, fontWeight: 600, color: "#66646C", background: "none", border: 0, cursor: "pointer" }}>back to the page</button>}
          </div>
        }
      >
        {nbMenu && (
          <Popover width={250} onClose={() => setNbMenu(false)} style={{ left: 0, top: 32 }}>
            <Kicker>NOTEBOOKS · THE SHELF</Kicker>
            {notebooks.map((n) => (
              <button key={n.id} type="button" onClick={() => openList(n)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "8px 10px", borderRadius: 10, border: "1px solid #E4E2E6", borderLeft: `4px solid ${n.accent}`, background: n.id === page?.notebookId ? "#FAF9FA" : "#FFFFFF", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#232227" }}>{n.title}</span>
                {n.recordingCount > 0 && <RecDot size={6} live={false} />}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "#96949B" }}>{n.pageCount} pages</span>
              </button>
            ))}
            <button type="button" onClick={async () => { const t = await askPrompt({ title: "Name the notebook", placeholder: "e.g. Term 2 · Romans" }); if (!t) return; const r = await fetch("/api/spirit/notebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }) }); if (r.ok) { await loadNotebooks(); setNbMenu(false); } }} style={{ marginTop: 8, fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>+ new notebook</button>
          </Popover>
        )}
      </PaneHeader>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: railSide === "left" ? "row-reverse" : "row" }}>
        {/* the page */}
        <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflow: "auto", position: "relative", background: "#FFFDF9" }}>
          {mode === "list" && listNotebook && (
            <div className="desk-page-in" style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: paneW > 560 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                {listPages.map((p, idx) => (
                  <div key={p.id} className="desk-lift" style={{ position: "relative", animation: `deskStaggerIn .42s cubic-bezier(.2,.9,.25,1) both`, animationDelay: `${Math.min(idx, 9) * 40}ms` }}>
                  {selectMode ? (
                    <span aria-hidden style={{ position: "absolute", top: 6, left: 7, zIndex: 2, width: 22, height: 22, borderRadius: "50%", background: selected.has(p.id) ? "#A63D63" : "rgba(255,255,255,0.92)", border: `1.5px solid ${selected.has(p.id) ? "#A63D63" : "#C9C7CD"}`, color: "#FFFFFF", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", transition: "background .18s, border-color .18s" }}>{selected.has(p.id) ? "✓" : ""}</span>
                  ) : (
                    <button type="button" aria-label="Delete page" onClick={async (e) => { e.stopPropagation(); await deletePages([p.id]); }} style={{ position: "absolute", top: 6, left: 7, zIndex: 2, width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid #E4E2E6", color: "#B4533F", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}
                  <button type="button" onClick={() => (selectMode ? toggleSelect(p.id) : void openPage(p.id))} style={{ width: "100%", border: `1px solid ${selectMode && selected.has(p.id) ? "#A63D63" : "#E4E2E6"}`, boxShadow: selectMode && selected.has(p.id) ? "inset 0 0 0 1px #A63D63" : "none", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#FFFFFF", textAlign: "left", padding: 0 }}>
                    <div style={{ height: 86, background: "#FFFDF9", backgroundImage: "radial-gradient(#EBE6E1 1px, transparent 1.2px)", backgroundSize: "14px 14px", position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
                      {p.recordingId && <span style={{ position: "absolute", top: 6, right: 7 }}><RecDot size={7} live={false} /></span>}
                    </div>
                    <div style={{ padding: "8px 10px 9px", borderTop: "1px solid #F2F1F2" }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || p.kind}</div>
                      <div style={{ fontSize: 9.5, color: "#96949B", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.refStart ? formatRef(p.refStart, p.refEnd ?? p.refStart) : p.subtitle ?? ""}{p.recording ? ` · ${fmtSeconds(p.recording.durationSec)} rec` : p.recordingId ? " · recording" : " · no recording"}{p.transcribedAt ? " · transcribed ✓" : ""}
                      </div>
                    </div>
                  </button>
                  </div>
                ))}
                <button type="button" onClick={() => newPage(listNotebook)} style={{ border: "1.5px dashed #D9D7DC", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", minHeight: 128, background: "transparent" }}>
                  <span style={{ fontSize: 20, color: "#96949B", lineHeight: 1 }}>+</span>
                  <span style={{ fontSize: 10, color: "#96949B" }}>new {listNotebook.kind === "sermons" ? "sermon " : ""}page</span>
                </button>
              </div>
              <div style={{ fontSize: 9.5, color: "#A9A7AE", padding: "12px 2px 0" }}>thumbnails are the real ink, shrunk · the red dot marks an attached recording</div>
            </div>
          )}
          {mode === "page" && page && (
            <div ref={pageWrapRef} key={page.id} className="desk-page-in" style={{ position: "relative", width: PAGE_W * scale, minHeight: "100%" }}>
              <InkCanvas
                ref={canvasRef}
                strokes={strokes}
                onStrokesChange={applyStrokes}
                width={PAGE_W}
                height={height}
                scale={scale}
                enabled={!readOnly}
                scrollRef={scrollRef}
                background={(page.background as "dots" | "lined" | "grid" | "blank" | "paper") ?? "dots"}
                onTap={onTap}
                onHold={onObjectHold}
                onDragMove={onObjectDragMove}
                onDragEnd={onObjectDragEnd}
                onEraseTick={() => haptic("light")}
                onLasso={onLasso}
                onUndoGesture={undo}
                onRedoGesture={redo}
                onZoom={onPinchZoom}
                onZoomEnd={onPinchEnd}
                selectedIds={lasso?.ids ?? null}
                highlightStrokeId={replayStroke}
                paper={page.background === "blank" ? "#FFFFFF" : "#FFFDF9"}
              >
                <PageObjects objects={objects} fresh={freshCards} editingId={editing?.id ?? null} liftedId={moveObj?.id ?? null} />
              </InkCanvas>
              {/* typed-block editor: floats over the object in page coords */}
              {editingObj && (
                <textarea
                  autoFocus
                  value={editing!.value}
                  onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
                  onBlur={commitEdit}
                  placeholder={editingObj.type === "answer" ? "type your answer…" : "type…"}
                  style={{ position: "absolute", left: (editingObj.x + (editingObj.type === "answer" ? 14 : 12)) * scale, top: (editingObj.y + (editingObj.type === "answer" ? 126 : 28)) * scale, width: ((editingObj.w ?? 420) - 24) * scale, minHeight: 72 * scale, fontSize: 13 * scale, lineHeight: 1.6, color: "#454349", background: "#FFFFFF", border: "1px solid #A63D63", borderRadius: 8 * scale, padding: `${6 * scale}px ${8 * scale}px`, resize: "none", zIndex: 12, fontFamily: "var(--font-body)", outline: "none" }}
                />
              )}
              {/* move handle for a lassoed selection */}
              {lasso && moving && (
                <div
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    moveStart.current = { x: e.clientX, y: e.clientY, orig: lassoStrokes().map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) })) };
                  }}
                  onPointerMove={(e) => {
                    if (!moveStart.current) return;
                    const dx = (e.clientX - moveStart.current.x) / scale;
                    const dy = (e.clientY - moveStart.current.y) / scale;
                    const moved = new Map(moveStart.current.orig.map((s) => [s.id, { ...s, pts: s.pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }]));
                    setStrokes((cur) => cur.map((s) => moved.get(s.id) ?? s));
                  }}
                  onPointerUp={() => {
                    if (!moveStart.current) return;
                    moveStart.current = null;
                    const ids = Array.from(lasso.ids);
                    const replaced = strokes.filter((s) => lasso.ids.has(s.id));
                    pending.current.remove.push(...ids);
                    pending.current.append.push(...replaced);
                    scheduleSave();
                    setMoving(false);
                    setLasso(null);
                  }}
                  style={{ position: "absolute", left: (lasso.bounds.x - 8) * scale, top: (lasso.bounds.y - 8) * scale, width: (lasso.bounds.w + 16) * scale, height: (lasso.bounds.h + 16) * scale, border: "1.5px dashed #A63D63", borderRadius: 8, background: "rgba(166,61,99,0.06)", cursor: "move", zIndex: 11, touchAction: "none" }}
                />
              )}
            </div>
          )}
          {mode === "page" && !page && <div style={{ padding: 24, fontSize: 12, color: "#96949B" }}>Opening the page…</div>}
        </div>
        {mode === "page" && rail}
      </div>

      {/* worksheet footer (09) */}
      {mode === "page" && isWorksheet && page && (
        <div style={{ borderTop: "1px solid #EDEBEE", background: "#FCFBFC", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          {page.status === "open" && <span style={{ fontSize: 10, color: "#A9A7AE" }}>you can leave — it keeps, unsubmitted</span>}
          {page.status === "submitted" && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: "#3E7A54", background: "#EAF3ED", borderRadius: 99, padding: "4px 11px" }}>✓ Submitted · {page.submittedAt ? new Date(page.submittedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""}</span>
              <button type="button" onClick={() => submit("reopen")} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>reopen</button>
            </>
          )}
          {page.status === "reopened" && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "4px 11px" }}>reopened — editing again</span>}
          <span style={{ flex: 1 }} />
          {page.status !== "submitted" && (
            <button type="button" onClick={() => submit("submit")} style={{ borderRadius: 10, padding: "10px 18px", fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: "#232227", color: "#FFFFFF", border: 0 }}>
              {page.status === "reopened" ? "Resubmit" : "Submit"}
            </button>
          )}
        </div>
      )}

      {/* replay (06a) */}
      {mode === "page" && recordingRow && recState !== "recording" && recState !== "paused" && (recordingRow.status === "ready" || recordingRow.status === "audio_deleted" || recordingRow.status === "transcribing" || recordingRow.status === "uploaded") && (
        <ReplayBar
          recordingId={recordingRow.id}
          duration={recordingRow.durationSec}
          segments={segments}
          transcript={recordingRow.transcript}
          audioGone={recordingRow.status === "audio_deleted" || segments.length === 0}
          seekTo={seekTo}
          status={recordingRow.status}
          onTime={() => {}}
        />
      )}

      {/* overlays */}
      {lasso && !moving && (
        <LassoMenu
          x={lasso.client.x}
          y={lasso.client.y}
          count={lasso.ids.size}
          anchorLabel={(() => { const c = nearestCard(lasso.bounds); return c ? `${(c.data as { label: string }).label} (nearest card)` : page?.refStart ? formatRef(page.refStart) : null; })()}
          onMove={() => setMoving(true)}
          onConvert={() => void lassoConvert()}
          onNote={() => void lassoNote()}
          onCopy={() => void lassoCopy()}
          onDelete={lassoDelete}
          busy={lassoBusy}
        />
      )}
      {noteCard && (
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, zIndex: 40, background: "#FFFDF9", border: "1px solid #EDE7E0", borderRadius: 12, padding: "11px 13px", boxShadow: "0 10px 30px rgba(20,15,18,0.15)", animation: "fadeUp .2s ease both" }}>
          <div style={{ fontSize: 13, color: "#454349", lineHeight: 1.5 }}>{noteCard.text || "(ink note — the words didn't transcribe; it keeps as ink)"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: "#96949B" }}>anchored to {noteCard.label} · kind proposed:</span>
            {(["question", "observation"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setNoteCard((n) => (n ? { ...n, kind: k } : n))} style={{ fontSize: 10, fontWeight: noteCard.kind === k ? 700 : 600, color: noteCard.kind === k ? "#FFFFFF" : "#66646C", background: noteCard.kind === k ? "#A63D63" : "#FFFFFF", border: noteCard.kind === k ? "none" : "1px solid #E4E2E6", borderRadius: 99, padding: "3px 11px", cursor: "pointer" }}>
                {k === "question" ? "Question" : "Observation"}{noteCard.kind === k ? " ✓" : ""}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setNoteCard(null)} style={{ fontSize: 10, color: "#A9A7AE", background: "none", border: 0, cursor: "pointer" }}>not now</button>
            <button type="button" onClick={() => void saveNote()} style={{ fontSize: 10.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", borderRadius: 9, padding: "6px 12px", border: 0, cursor: "pointer" }}>keep it</button>
          </div>
        </div>
      )}
      {proposal && (
        <div style={{ position: "absolute", inset: 0, zIndex: 45, background: "rgba(35,34,39,0.18)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <ClosingCard proposal={proposal.data} variant={proposal.kind} pageLabel={`${nb?.title ?? "page"} · ${page?.title ?? ""}`} onConfirm={(p) => void confirmProposal(p)} onCancel={() => setProposal(null)} busy={proposalBusy} />
        </div>
      )}
      {proposalBusy && !proposal && (
        <div style={{ position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 44, background: "rgba(35,34,39,0.85)", color: "#F2F1F2", borderRadius: 99, padding: "6px 14px", fontSize: 10.5, fontWeight: 600 }}>
          reading the page…
        </div>
      )}
      {popover === "brush" && <BrushPopover style={{ right: railSide === "right" ? 66 : undefined, left: railSide === "left" ? 66 : undefined, top: 52 }} onClose={() => setPopover(null)} />}
      {popover === "palette" && <PalettePopover style={{ right: railSide === "right" ? 66 : undefined, left: railSide === "left" ? 66 : undefined, bottom: 16 }} onClose={() => setPopover(null)} />}
      {answerObj && (answerObj.data as { filed?: boolean }).filed && <span style={{ display: "none" }}><CheckIcon /></span>}
      <span style={{ display: "none" }}>{stripW}{cardShadow}</span>
    </div>
  );
}
