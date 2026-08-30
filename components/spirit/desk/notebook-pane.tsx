"use client";

// The Notebook pane (03 · 04 · 08 · 09 · 01/06 for sermons): a page of
// objects + ink with the tool rail on the seam edge. Autosaves stroke
// deltas; undo/redo by two- and three-finger taps; lasso → menu;
// dictation lands at the cursor; reference cards drop in from the Bible;
// sermon pages record in the header and replay by tapping a stroke;
// worksheets submit — never auto-tick.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { InkCanvas, type InkCanvasHandle } from "./ink-canvas";
import { ToolRail } from "./tool-rail";
import { BrushPopover, PalettePopover } from "./pen-popovers";
import { PageObjects, hitObject, objectRect } from "./page-objects";
import { LassoMenu } from "./lasso-menu";
import { ClosingCard, type Proposal } from "./closing-card";
import { RecordingChip, ReplayBar, type SegmentMeta, type TranscriptLine } from "./recording-control";
import { useDesk, useDeskEvent } from "./desk-state";
import { FindVersePopover } from "./find-verse";
import { applyOutbox, flushOutbox, keepStorage, listOutbox, queueDelta } from "@/lib/ink-outbox";
import { refParts } from "@/lib/bible-refs";
import { PaneHeader, Chip, DISPLAY, cardShadow, Popover, Kicker } from "./ui";
import { CheckIcon, RecDot } from "./desk-icons";
import { SermonRecorder } from "@/lib/spirit-recording";
import { fmtSeconds, newId, pageHeightFor, strokeBounds, strokeDistanceTo, type PageObject, type Stroke } from "@/lib/ink";
import { askConfirm, askPrompt } from "./dialog";
import { haptic } from "@/lib/haptics";
import { useWakeLock } from "@/lib/wake-lock";
import { getOrCreateMicrophoneStream, deactivateMicrophoneStream } from "@/lib/microphone";
import { formatRef } from "@/lib/bible-refs";

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
  /** false when the desk's seam is the toolbar (split landscape) — V2 */
  showRail?: boolean;
  /** a verse dropped while this pane was not on screen — the shell opened it for us */
  pendingNote?: { refStart: number; refEnd: number; label: string; text: string; seq: number } | null;
  onNoteConsumed?: () => void;
  context: "study" | "sermon" | "free";
  initialPageId?: string | null;
  dayId?: string | null;
  onKicker?: () => void;
  onPageChange?: (page: { id: string; kind: string; title: string; refStart: number | null } | null) => void;
}

/** fit-to-width is the floor: below 1 the page is narrower than the pane and the margin is dead paper */
const MIN_ZOOM = 1;
const MAX_ZOOM = 3.2;

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

export function NotebookPane({ railSide, showRail = true, pendingNote, onNoteConsumed, context, initialPageId, dayId, onPageChange }: NotebookPaneProps) {
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
  // The page is fit-to-width at zoom 1 (scale = paneW / PAGE_W), so 1 IS the most-zoomed-out
  // state: anything below it leaves paper narrower than the pane, and that margin is dead —
  // it is outside the ink canvas, so the pen does nothing there. He asked for the page to
  // "cover the whole thing as its most zoomed out version"; this is that, enforced.
  const [zoom, setZoom] = useState(1);
  // ——— PINCH: live, 1:1 with the fingers, then crisp ———
  // The page is composited during the gesture (transform only — no layout, no re-render)
  // and re-rasterised at the new scale on release with the point under the fingers held
  // exactly in place. Two fingers moving together pan as well as scale.
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  // FIND A VERSE (V2): the pencil-first picker — book, chapter, drag the range, drop the card
  const [findOpen, setFindOpen] = useState(false);
  // SPACE growers (V2): "drag down for more room — tap to add a little." Each sermon section
  // head (after the first) wears a handle; dragging it moves that section and EVERYTHING
  // below it — objects live, ink on release — so a packed section gains room mid-sermon.
  const [gapDrag, setGapDrag] = useState<{ y: number; dy: number } | null>(null);
  const spaceDown = (e: ReactPointerEvent, sectionY: number) => {
    e.preventDefault();
    e.stopPropagation();
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* fine */ }
    const y0 = e.clientY;
    let moved = false;
    pushHistory();
    const baseObjects = objects;
    setGapDrag({ y: sectionY, dy: 0 });
    const apply = (dyRaw: number) => {
      const dy = Math.max(0, Math.min(340, Math.round(dyRaw / 4) * 4));
      setGapDrag({ y: sectionY, dy });
      setObjects(baseObjects.map((o) => (o.y >= sectionY ? { ...o, y: o.y + dy } : o)));
      return dy;
    };
    const mv = (ev: globalThis.PointerEvent) => {
      const raw = (ev.clientY - y0) / scale;
      if (Math.abs(raw) > 3) moved = true;
      apply(raw);
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      const dy = moved ? apply((ev.clientY - y0) / scale) : apply(28); // a tap adds a little
      setGapDrag(null);
      if (dy <= 0) { setHistory((h) => h.slice(0, -1)); return; }
      // the ink below the boundary rides along — committed once, on release
      const movedStrokes = strokes.filter((s) => strokeBounds(s).y >= sectionY - 6).map((s) => ({ ...s, pts: s.pts.map((pt) => ({ ...pt, y: pt.y + dy })) }));
      if (movedStrokes.length) {
        const ids = new Set(movedStrokes.map((s) => s.id));
        setStrokes((ss) => ss.map((s) => (ids.has(s.id) ? movedStrokes.find((m) => m.id === s.id)! : s)));
        enqueue({ remove: movedStrokes.map((s) => s.id), append: movedStrokes, objects: true });
      } else {
        enqueue({ objects: true });
      }
      scheduleSave();
      haptic("soft");
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const pinchRef = useRef<{ wx: number; wy: number; k: number; fx: number; fy: number; sl: number; st: number } | null>(null);
  const onPinchZoom = (k: number, center: { x: number; y: number }) => {
    const sc = scrollRef.current, wrap = pageWrapRef.current;
    if (!sc || !wrap) return;
    const r = sc.getBoundingClientRect();
    const fx = center.x - r.left, fy = center.y - r.top; // focal, in the scroller's viewport
    if (!pinchRef.current) {
      // wrapper-pixel coordinate of the point the fingers grabbed
      // freeze the scroll origin: momentum still in flight would otherwise slide the page
      // out from under his fingers mid-pinch
      pinchRef.current = { wx: fx + sc.scrollLeft, wy: fy + sc.scrollTop, k: 1, fx, fy, sl: sc.scrollLeft, st: sc.scrollTop };
      wrap.style.willChange = "transform"; // promote the layer BEFORE the first painted frame
      wrap.style.transformOrigin = "0 0";
    }
    const st = pinchRef.current;
    const clamped = Math.max(MIN_ZOOM / zoom, Math.min(MAX_ZOOM / zoom, k));
    st.k = clamped;
    st.fx = fx;
    st.fy = fy;
    // put the grabbed point back under the fingers, scaled — this is the whole trick
    const tx = fx + st.sl - clamped * st.wx;
    const ty = fy + st.st - clamped * st.wy;
    wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${clamped})`;
  };
  const onPinchEnd = () => {
    const sc = scrollRef.current, wrap = pageWrapRef.current, st = pinchRef.current;
    pinchRef.current = null;
    if (!wrap) return;
    wrap.style.transform = "";
    wrap.style.willChange = "";
    wrap.style.transformOrigin = "";
    if (!sc || !st) return;
    // A two-finger drag at constant separation, or a pinch held against the zoom clamp, is a
    // PAN: k stays 1 but the page tracked his fingers the whole way. Returning here cleared the
    // transform and threw that away, so the page snapped back the instant he lifted.
    // 0.5% was far too tight: human fingers change separation by more than that during an
    // ordinary two-finger PAN, so most pans fell through to the zoom branch and multiplied the
    // zoom by ~0.99 each time. Over a session that random walk drifted him down to ~0.9 — which
    // is exactly the dead strip of un-inkable paper he photographed on the right of the page.
    const purePan = Math.abs(st.k - 1) < 0.04;
    const next = purePan ? zoom : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * st.k));
    const applied = purePan ? 1 : next / zoom; // what actually survived the clamp
    if (!purePan) {
      setZoom(next);
      haptic("soft");
    }
    // scrollLeft such that the grabbed wrapper point lands back under the fingers
    const left = st.wx * applied - st.fx;
    const top = st.wy * applied - st.fy;
    requestAnimationFrame(() => {
      sc.scrollLeft = Math.max(0, left);
      sc.scrollTop = Math.max(0, top);
    });
  };
  const [paneW, setPaneW] = useState(600);
  const [paneH, setPaneH] = useState(0);
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
  const [transcribing, setTranscribing] = useState(false);
  const [proposal, setProposal] = useState<{ kind: "page" | "sermon"; data: Proposal } | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [recordingRow, setRecordingRow] = useState<RecordingRow | null>(null);
  const [segments, setSegments] = useState<SegmentMeta[]>([]);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [recElapsed, setRecElapsed] = useState(0);
  const [recLevel, setRecLevel] = useState(0);
  const [uploading, setUploading] = useState(0);
  /**
   * The native shell reads this before it reloads a stale web view
   * (ios/iOSApp/WebShellView.swift — `refreshIfStale` on didBecomeActive). It used to mean
   * "unsaved ink", and on 2026-08-30 that cost him a sermon: the shell reloaded mid-service,
   * the recorder went with the page, and the last ~12 minutes were never captured at all.
   * A live recording is work in progress too. Nothing is worth a fresher bundle.
   */
  useEffect(() => {
    (window as unknown as { __pitayaHasUnsavedInk?: boolean }).__pitayaHasUnsavedInk =
      saving === "saving" || saving === "offline" ||
      recState === "recording" || recState === "paused" ||
      uploading > 0;
  }, [saving, recState, uploading]);
  // The screen going to sleep kills MediaRecorder outright — the other half of what stopped
  // his sermon. Held only while the mic is actually live, never for a page that is just open.
  useWakeLock(recState === "recording" || recState === "paused");
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
  // a page he opened while zoomed out from a previous session should still fill the pane
  
  // ...and at least tall enough to fill the scroller, so the band below the last line is live
  // paper he can write on rather than dead background
  const height = useMemo(() => {
    const content = pageHeightFor(strokes, objects);
    const fillsPane = paneH > 0 && scale > 0 ? Math.ceil(paneH / scale) : 0;
    return Math.max(content, fillsPane);
  }, [strokes, objects, paneH, scale]);
  const isSermon = page?.kind === "sermon";
  const isWorksheet = page?.kind === "worksheet";
  const readOnly = isWorksheet && page?.status === "submitted";

  // ——— pane width ———
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setPaneW(Math.max(240, el.clientWidth - 2));
    setPaneH(el.clientHeight);
      setPaneH(el.clientHeight);
    });
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
      // Fold in anything the durable log still holds for this page. Without this a page
      // recovered after a crash would render the SERVER's copy — his unsent paragraph would be
      // safe on disk and yet invisible, which reads exactly like losing it.
      const unsent = await listOutbox(p.id);
      const merged = applyOutbox((p.strokes ?? []) as Stroke[], (p.objects ?? []) as PageObject[], unsent);
      setStrokes(merged.strokes);
      setObjects(merged.objects);
      if (unsent.length) setSaving("offline");
      setHistory([]);
      setFuture([]);
      setLasso(null);
      setMode("page");
      haptic("light");
      setRecordingRow(d.recording ? { ...d.recording, transcript: (d.recording.transcript ?? []) as TranscriptLine[] } : null);
      if (d.recording?.id) {
        fetch(`/api/spirit/recordings/${d.recording.id}`).then((x) => (x.ok ? x.json() : null)).then((rr) => rr && setSegments(rr.segments ?? [])).catch(() => {});
        // AN INTERRUPTED RECORDING. `status: "recording"` with no live recorder in this page
        // means the tab went away mid-service — the reload on 2026-08-30 left the row stuck
        // like this forever, and because the replay bar hid that status, 28 minutes of sermon
        // looked like they had never existed. Close the row out and SAY SO; the audio that
        // reached the server is all still there.
        if (d.recording.status === "recording" && !recorder.current) {
          const mins = Math.round((d.recording.durationSec ?? 0) / 60);
          void fetch(`/api/spirit/recordings/${d.recording.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "uploaded" }),
          }).catch(() => {});
          setRecordingRow((r) => (r ? { ...r, status: "uploaded" } : r));
          setRecState("stopped");
          toast(
            mins > 0
              ? `That recording was interrupted — ${mins} minute${mins === 1 ? "" : "s"} were saved and are safe.`
              : "That recording was interrupted. What reached the server is safe.",
            { duration: 9000 },
          );
        }
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
  /**
   * The ONE way work becomes pending. It writes the durable log FIRST — before the in-memory
   * queue, before any network — so a kill at any instant after this call still has his ink on
   * disk. Ten call sites used to push straight into `pending.current`; eight of them had no
   * durable copy at all, and `pending.current` is RAM. That is the shape of the bug that ate a
   * paragraph on 2026-08-30: the ink was only ever in a ref, and the app restarted.
   */
  const enqueue = useCallback((d: { append?: Stroke[]; remove?: string[]; objects?: PageObject[] | true }) => {
    const id = pageRef.current?.id;
    const objs = d.objects === true ? objectsRef.current : d.objects;
    if (id) void queueDelta({ pageId: id, append: d.append, remove: d.remove, objects: objs });
    // Removals are folded in FIRST, cancelling any queued append of the same id: a stroke drawn
    // and erased inside one debounce window must not be re-appended after the server removes it.
    // New appends land after, so a move (same ids, new geometry) still replaces rather than dies.
    if (d.remove?.length) {
      const rm = new Set(d.remove);
      pending.current.append = pending.current.append.filter((st) => !rm.has(st.id));
      pending.current.remove.push(...d.remove);
    }
    if (d.append?.length) pending.current.append.push(...d.append);
    if (d.objects) pending.current.objects = true;
  }, []);

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
      if (!r.ok) throw new Error("save failed");
      // the server has it — now the durable log can let go of everything it was holding
      const left = await flushOutbox();
      setSaving(left.remaining > 0 ? "offline" : "saved");
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
  // Recover and retry. Anything the log still holds is replayed at boot — that is the case
  // that lost his paragraph — then again whenever the connection returns, and on a slow
  // heartbeat so a save that failed while he was NOT drawing still eventually lands.
  useEffect(() => {
    let alive = true;
    keepStorage();
    const drain = async () => {
      const r = await flushOutbox();
      if (!alive) return;
      if (r.remaining > 0) setSaving("offline");
      else if (r.sent > 0) { setSaving("saved"); toast.success(`Saved ${r.sent} change${r.sent === 1 ? "" : "s"} that were waiting.`); }
    };
    void drain();
    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    const id = setInterval(() => { if (navigator.onLine !== false) void drain(); }, 20000);
    return () => { alive = false; window.removeEventListener("online", onOnline); clearInterval(id); };
  }, []);
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
    // moved strokes are re-written: remove the old ids, append the moved copies (same ids → replace)
    enqueue({ remove: g.moved.map((m) => m.id), append: g.moved, objects: g.objects });
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
      enqueue({ remove: g.moved.map((m) => m.id), append: g.moved, objects: g.objects });
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
    enqueue({ append: delta.appended, remove: delta.removed });
    scheduleSave();
    // an ERASE must never grow the page — only a new mark near the bottom edge can
    if (delta.appended?.length === 1 && !delta.removed?.length && (isSermon || page?.kind === "study" || page?.kind === "worksheet")) autoGrowFor(delta.appended[0], next, objects);
  };
  const applyObjects = (next: PageObject[]) => {
    pushHistory();
    setObjects(next);
    enqueue({ objects: next });
    scheduleSave();
  };
  const redoRef = useRef<(() => void) | null>(null);
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    const n = Math.abs(strokes.length - prev.strokes.length);
    toast(`Undone${n ? ` — ${n} stroke${n === 1 ? "" : "s"}` : ""}`, { action: { label: "Redo", onClick: () => redoRef.current?.() } });
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, { strokes, objects }]);
    const removed = strokes.filter((s) => !prev.strokes.find((p) => p.id === s.id)).map((s) => s.id);
    const added = prev.strokes.filter((s) => !strokes.find((p) => p.id === s.id));
    setStrokes(prev.strokes);
    setObjects(prev.objects);
    enqueue({ remove: removed, append: added, objects: prev.objects });
    scheduleSave();
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next) return;
    const n = Math.abs(strokes.length - next.strokes.length);
    toast(`Redone${n ? ` — ${n} stroke${n === 1 ? "" : "s"}` : ""}`);
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, { strokes, objects }]);
    const removed = strokes.filter((s) => !next.strokes.find((p) => p.id === s.id)).map((s) => s.id);
    const added = next.strokes.filter((s) => !strokes.find((p) => p.id === s.id));
    setStrokes(next.strokes);
    setObjects(next.objects);
    enqueue({ remove: removed, append: added, objects: next.objects });
    scheduleSave();
  };
  redoRef.current = redo;

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

  // the shell opened this pane for a verse dropped with no notebook on screen
  const lastNote = useRef(0);
  useEffect(() => {
    if (!pendingNote || !page || pendingNote.seq === lastNote.current) return;
    lastNote.current = pendingNote.seq;
    void addRefCard(pendingNote.refStart, pendingNote.refEnd, pendingNote.label, pendingNote.text);
    onNoteConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNote, page]);

  useDeskEvent(
    (e) => {
      if (e.type === "send-to-notes") {
        let at: { x: number; y: number } | undefined;
        if (e.source?.startsWith("drag:") && canvasRef.current) {
          const [cx, cy] = e.source.slice(5).split(",").map(Number);
          at = canvasRef.current.clientToPage(cx, cy);
        }
        void addRefCard(e.refStart, e.refEnd, e.label, e.text, at);
      } else if (e.type === "capture-photo") {
        fileRef.current?.click();
      } else if (e.type === "capture-voice") {
        void dictate();
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
    // a pen holding a writing tool is WRITING — pausing mid-word must never lift an object
    if (pt.pointerType === "pen" && (pen.tool === "fountain" || pen.tool === "gpen" || pen.tool === "pencil" || pen.tool === "marker")) return false;
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
    enqueue({ objects: true });
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
      const converted: PageObject[] = [...objects];
      const o: PageObject = { id: newId(), type: "text", x: at.x, y: at.y, w: Math.max(260, Math.min(520, lasso.bounds.w + 40)), h: 60, t0: Date.now(), data: { text: p.text, label: "CONVERTED FROM INK" } };
      converted.push(o);
      setObjects(converted);
      enqueue({ remove: Array.from(lasso.ids), objects: converted });
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
        emit({ type: "dictate-state", on: false });
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
      emit({ type: "dictate-state", on: true, startedAt: Date.now() });
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
  const transcribeRecording = async () => {
    if (!recordingRow || transcribing) return;
    if (recState === "recording" || recState === "paused") return toast.error("Stop the recording first.");
    const sr = recorder.current;
    if (sr && sr.pendingUploads > 0) return toast.error("Still uploading the audio — try again in a moment.");
    setTranscribing(true);
    toast("Transcribing — this takes a minute for a full sermon.");
    setRecordingRow((r) => (r ? { ...r, status: "transcribing" } : r));
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
      toast.success(rr.recording.status === "ready" ? "Transcribed — tap any stroke to replay." : "Transcription did not finish — try again from ⋯.");
    }
    setTranscribing(false);
  };
  const renameRecording = async () => {
    if (!recordingRow) return;
    const name = await askPrompt({ title: "Name this recording", value: recordingRow.title ?? "", placeholder: "e.g. Jonah 2 — Pr. Marcos" });
    if (!name) return;
    const r = await fetch(`/api/spirit/recordings/${recordingRow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: name }) }).catch(() => null);
    if (r?.ok) { setRecordingRow((x) => (x ? { ...x, title: name } : x)); toast.success("Renamed."); }
  };
  /** Rename the open page — his 2026-08-30 ask: "how do I edit the title of a page". */
  const renamePage = async () => {
    if (!page) return;
    const name = await askPrompt({ title: "Name this page", value: page.title ?? "", placeholder: "e.g. Trusting God when it's dark" });
    if (name === null) return;
    const title = name.trim();
    setPage((p) => (p ? { ...p, title } : p));
    const r = await fetch(`/api/spirit/ink/${page.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => null);
    if (r?.ok) { toast.success("Renamed."); void loadNotebooks?.(); } else toast.error("Couldn't rename it — try again.");
  };
  const deleteRecording = async () => {
    if (!recordingRow) return;
    const live = recState === "recording" || recState === "paused";
    const sure = await askConfirm({ title: live ? "Stop and delete this recording?" : "Delete this recording?", body: "The audio and its transcript go; your ink and the page stay. This cannot be undone.", confirmLabel: live ? "Stop and delete" : "Delete recording", danger: true });
    if (!sure) return;
    // never leave the mic hot or the recorder orphaned uploading into a row that is gone
    if (live) { try { await recorder.current?.stop(); } catch { /* already stopped */ } setRecording(null); }
    const r = await fetch(`/api/spirit/recordings/${recordingRow.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setRecordingRow(null);
      setSegments([]);
      setRecState("idle");
      setPage((pg) => (pg ? { ...pg, recordingId: null } : pg));
      toast.success("Recording deleted.");
    } else toast.error("Couldn't delete it — try again.");
  };
  const stopRecording = async () => {
    const sr = recorder.current;
    if (!sr || !recordingRow) return;
    const total = await sr.stop();
    setRecording(null);
    await fetch(`/api/spirit/recordings/${recordingRow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSec: total, status: "uploaded" }) }).catch(() => {});
    // Transcription is HIS act now, not a side effect of stopping — it spends AI, so the
    // recording keeps as audio until he asks for the text (⋯ → Transcribe the recording).
    setRecState("stopped");
    // Refresh the row once the audio has finished uploading: without this the chip sat at
    // 0:00 and the replay bar never appeared, because nothing told the pane the recording
    // now had a duration and segments.
    void (async () => {
      for (let i = 0; i < 60 && sr.pendingUploads > 0; i++) await new Promise((r) => setTimeout(r, 500));
      const rr = await fetch(`/api/spirit/recordings/${recordingRow.id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (rr?.recording) {
        setRecordingRow({ ...rr.recording, transcript: (rr.recording.transcript ?? []) as TranscriptLine[] });
        setSegments(rr.segments ?? []);
      }
      toast.success("Recording kept — transcribe it from ⋯ whenever you want the text.");
    })();
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
      compact={paneW < 420}
    />
  );

  return (
    <div ref={paneRef} data-notebook-drop="1" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative", background: "#FFFFFF" }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" style={{ display: "none" }} onChange={(e) => void onPhoto(e.target.files)} />
      <PaneHeader
        kicker="NOTEBOOK"
        onKicker={() => setNbMenu((v) => !v)}
        title={mode === "list" ? listNotebook?.title : page?.title || nb?.title || "…"}
        onTitle={mode === "page" && page ? renamePage : undefined}
        meta={mode === "list" ? `${listPages.length} pages` : page ? (pageIndex ? `p. ${pageIndex}` : page.subtitle ?? "") : ""}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mode === "page" && page?.transcribedAt && <Chip tone="success">TRANSCRIBED ✓</Chip>}
            {/* `status !== "recording"` in this gate meant an INTERRUPTED row fell through to
                recState ("idle" after a reload) and drew a fresh Record button over an existing
                recording. Tapping it POSTs a new row and repoints the page, orphaning the
                sermon. Any row that exists now reads "stopped" once the mic is not live. */}
            {mode === "page" && isSermon && (
              <RecordingChip state={recordingRow && recState !== "recording" && recState !== "paused" ? "stopped" : recState} elapsed={recState === "stopped" ? recordingRow?.durationSec ?? recElapsed : recElapsed} level={recLevel} onToggle={toggleRecording} onStart={startRecording} onStop={stopRecording} consent={prefs.recording.consent} uploading={uploading} />
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
                      { label: "Rename this page", run: renamePage },
                      { label: "Typed block", run: () => { setPen({ tool: "text" }); addTextBlock("", false, lastTap.current ?? undefined); } },
                      { label: "Find a verse → card", run: () => setFindOpen(true) },
                      { label: isSermon ? "Close the page — read it" : "Transcribe this page", run: closePage },
                      { label: "Page list", run: () => nb && openList(nb) },
                      ...(isSermon && recordingRow ? [
                        ...(recordingRow.status !== "ready" && !transcribing && recState !== "recording" && recState !== "paused" ? [{ label: "Transcribe the recording", run: transcribeRecording }] : []),
                        ...(transcribing ? [{ label: "Transcribing…", run: () => {} }] : []),
                        { label: "Rename the recording", run: renameRecording },
                        { label: "Delete the recording", run: deleteRecording, danger: true },
                      ] : []),
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
            <div key={page.id} className="desk-page-in" style={{ position: "relative", width: PAGE_W * scale, minHeight: "100%" }}>
              {/* the pinch transform lives on its OWN div with no class — an animation on the
                  same element would outrank this inline transform and never paint it */}
              <div ref={pageWrapRef} style={{ position: "relative", width: "100%", minHeight: "100%" }}>
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
              {/* SPACE growers — V2: sermon sections gain room on demand. A handle above each
                  section head (after the first); drag moves the section and everything below,
                  tap adds a little. The live "+N" pill is the visible acknowledgement. */}
              {isSermon && objects.filter((o) => o.type === "section").sort((a, b) => a.y - b.y).slice(1).map((sec) => (
                <div key={`sp-${sec.id}`} style={{ position: "absolute", top: (sec.y - 30) * scale, right: 18 * scale, zIndex: 6, display: "flex", alignItems: "center", gap: 7 }}>
                  {gapDrag && gapDrag.y === sec.y && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "#FFFFFF", background: "rgba(35,34,39,0.82)", borderRadius: 99, padding: "2.5px 8px", fontVariantNumeric: "tabular-nums" }}>+{gapDrag.dy}</span>
                  )}
                  <div onPointerDown={(e) => spaceDown(e, sec.y)} title="Drag down for more room — tap to add a little" style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 7px 4px 9px", borderRadius: 8, cursor: "ns-resize", touchAction: "none", background: gapDrag && gapDrag.y === sec.y ? "#F1ECE6" : "transparent" }}>
                    <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#9A928A" }}>SPACE</span>
                    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="#9A928A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4 5 1l3 3M2 8l3 3 3-3" /></svg>
                  </div>
                </div>
              ))}
              {/* + ref — V2: opens FIND A VERSE. Rides the VERSES READ section, after its cards. */}
              {isSermon && (() => {
                const secs = objects.filter((o) => o.type === "section").sort((a, b) => a.y - b.y);
                const vs = secs.find((s) => ((s.data as { label?: string }).label ?? "").toUpperCase().startsWith("VERSES"));
                if (!vs) return null;
                const next = secs.find((s) => s.y > vs.y);
                const cards = objects.filter((o) => o.type === "refcard" && o.y >= vs.y && (!next || o.y < next.y));
                const cx = Math.min(800 - 110, 24 + cards.length * 210);
                return (
                  <button type="button" onClick={() => setFindOpen(true)} style={{ position: "absolute", top: (vs.y + 30) * scale, left: cx * scale, zIndex: 6, display: "flex", alignItems: "center", gap: 5, border: `1.5px dashed ${findOpen ? "#A63D63" : "#D9D7DC"}`, background: findOpen ? "#F6E3EB" : "transparent", borderRadius: 99, padding: "6px 12px", cursor: "pointer" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: findOpen ? "#8C2F51" : "#96949B" }}>+ ref</span>
                  </button>
                );
              })()}
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
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already ended */ }
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
                    enqueue({ remove: ids, append: replaced });
                    scheduleSave();
                    setMoving(false);
                    setLasso(null);
                  }}
                  style={{ position: "absolute", left: (lasso.bounds.x - 8) * scale, top: (lasso.bounds.y - 8) * scale, width: (lasso.bounds.w + 16) * scale, height: (lasso.bounds.h + 16) * scale, border: "1.5px dashed #A63D63", borderRadius: 8, background: "rgba(166,61,99,0.06)", cursor: "move", zIndex: 11, touchAction: "none" }}
                />
              )}
              </div>
            </div>
          )}
          {mode === "page" && !page && <div style={{ padding: 24, fontSize: 12, color: "#96949B" }}>Opening the page…</div>}
        </div>
        {mode === "page" && showRail && rail}
        {findOpen && mode === "page" && page && (
          <FindVersePopover
            initialBook={page.refStart ? refParts(page.refStart).book : null}
            onClose={() => setFindOpen(false)}
            onDrop={(refStart, refEnd, label, peek) => {
              setFindOpen(false);
              void addRefCard(refStart, refEnd, label, peek, lastTap.current ?? undefined);
              haptic("soft");
            }}
            style={{ top: 84, left: railSide === "left" ? undefined : 14, right: railSide === "left" ? 14 : undefined }}
          />
        )}
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
      {/* The gate used to allowlist four statuses and omit the two a BROKEN recording carries —
          "recording" (interrupted) and "failed" (transcription died). The audio is on the
          server in both cases; hiding the player is how 28 minutes of sermon looked lost. */}
      {mode === "page" && recordingRow && recState !== "recording" && recState !== "paused" && (
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
        <div onClick={(e) => { if (e.target === e.currentTarget && !proposalBusy) setProposal(null); }} style={{ position: "absolute", inset: 0, zIndex: 45, background: "rgba(35,34,39,0.18)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <ClosingCard proposal={proposal.data} variant={proposal.kind} pageLabel={`${nb?.title ?? "page"} · ${page?.title ?? ""}`} onConfirm={(p) => void confirmProposal(p)} onCancel={() => setProposal(null)} busy={proposalBusy} />
        </div>
      )}
      {proposalBusy && !proposal && (
        <div style={{ position: "absolute", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 44, background: "rgba(35,34,39,0.85)", color: "#F2F1F2", borderRadius: 99, padding: "6px 14px", fontSize: 10.5, fontWeight: 600 }}>
          reading the page…
        </div>
      )}
      {popover === "brush" && <BrushPopover style={{ right: railSide === "right" ? 66 : undefined, left: railSide === "left" ? 66 : undefined, top: 52 }} onClose={() => setPopover(null)} />}
      {popover === "palette" && showRail && <PalettePopover style={{ right: railSide === "right" ? 66 : undefined, left: railSide === "left" ? 66 : undefined, bottom: 16 }} onClose={() => setPopover(null)} />}
      {answerObj && (answerObj.data as { filed?: boolean }).filed && <span style={{ display: "none" }}><CheckIcon /></span>}
      <span style={{ display: "none" }}>{stripW}{cardShadow}</span>
    </div>
  );
}
