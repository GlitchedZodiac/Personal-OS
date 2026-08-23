"use client";

// The desk's shared state: prefs (handedness, Bible mode, overlay, pen),
// the pen itself, the active recording clock, the layout per context, and
// a tiny event bus the panes talk through (send-to-notes, open-in-the-
// reference-Bible, tool changes). Per-device bits mirror to localStorage
// so the desk resumes before the network answers; user-level prefs persist
// through /api/spirit/desk-prefs.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_DESK_PREFS,
  mergeDeskPrefs,
  readLocalDeskPrefs,
  writeLocalDeskPrefs,
  type BibleMode,
  type DeskContext,
  type DeskPrefs,
  type Handedness,
  type OverlayVisibility,
  type MarginStep,
} from "@/lib/desk-prefs";
import type { InkTool } from "@/lib/ink";
import { haptic } from "@/lib/haptics";

export type PenTool = "fountain" | "gpen" | "pencil" | "marker" | "highlighter" | "eraser" | "lasso" | "text" | "hand";

export interface PenState {
  tool: PenTool;
  brush: InkTool;
  color: string;
  widthStep: 0 | 1 | 2;
  widthMul: number; // continuous, 0.5–2.2
  opacity: number;
  streamline: number;
  hlCategory: string; // the highlighter's category (six, fixed)
}

export interface RecordingClock {
  recordingId: string;
  startEpoch: number; // ms
  paused: boolean;
  pausedAccum: number; // ms paused in total
  pausedSince: number | null;
}

export type DeskEvent =
  | { type: "send-to-notes"; refStart: number; refEnd: number; label: string; text: string; source?: string }
  | { type: "open-reference"; q: string; refStart?: number; refEnd?: number; label?: string; source?: string }
  | { type: "open-main"; q: string }
  | { type: "jump-reference-pane"; refStart: number; refEnd?: number }
  | { type: "dictate"; text: string }
  | { type: "notebook-open-page"; pageId: string }
  | { type: "notebook-page-list" }
  | { type: "answer-box"; question: string; dayId: string; refStart: number }
  | { type: "worksheet-open"; dayId: string }
  | { type: "study-step"; step: number }
  | { type: "open-source"; key: string; label?: string }
  | { type: "set-slot"; slot: "left" | "right"; index: number; doc: string };

interface DeskStateValue {
  prefs: DeskPrefs;
  updatePrefs: (patch: Partial<DeskPrefs> | ((p: DeskPrefs) => DeskPrefs)) => void;
  hand: Handedness;
  pen: PenState;
  setPen: (patch: Partial<PenState>) => void;
  bibleMode: BibleMode;
  setBibleMode: (m: BibleMode) => void;
  overlayVisibility: OverlayVisibility;
  setOverlayVisibility: (v: OverlayVisibility) => void;
  overlayMargin: MarginStep;
  setOverlayMargin: (m: MarginStep) => void;
  context: DeskContext;
  setContext: (c: DeskContext) => void;
  popover: "pen" | "layout" | "brush" | "palette" | null;
  setPopover: (p: "pen" | "layout" | "brush" | "palette" | null) => void;
  recording: RecordingClock | null;
  setRecording: (r: RecordingClock | null | ((r: RecordingClock | null) => RecordingClock | null)) => void;
  /** seconds into the recording now, or null */
  recordingSeconds: () => number | null;
  penActive: React.MutableRefObject<boolean>;
  emit: (e: DeskEvent) => void;
  subscribe: (fn: (e: DeskEvent) => void) => () => void;
  dirtyPages: React.MutableRefObject<Set<string>>;
}

const Ctx = createContext<DeskStateValue | null>(null);

export function useDesk() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk outside DeskProvider");
  return v;
}

export function useDeskEvent(handler: (e: DeskEvent) => void, deps: unknown[] = []) {
  const { subscribe } = useDesk();
  useEffect(() => subscribe(handler), deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function DeskProvider({ children, initialContext = "study" }: { children: ReactNode; initialContext?: DeskContext }) {
  const [prefs, setPrefs] = useState<DeskPrefs>(DEFAULT_DESK_PREFS);
  const [pen, setPenState] = useState<PenState>({
    tool: "fountain",
    brush: "fountain",
    color: DEFAULT_DESK_PREFS.pen.color,
    widthStep: 1,
    widthMul: 1,
    opacity: 1,
    streamline: DEFAULT_DESK_PREFS.pen.streamline,
    hlCategory: "God",
  });
  const [bibleMode, setBibleModeState] = useState<BibleMode>("study");
  const [overlayVisibility, setOverlayVisibilityState] = useState<OverlayVisibility>("show");
  const [overlayMargin, setOverlayMarginState] = useState<MarginStep>(1);
  const [context, setContext] = useState<DeskContext>(initialContext);
  const [popover, setPopover] = useState<"pen" | "layout" | "brush" | "palette" | null>(null);
  const [recording, setRecording] = useState<RecordingClock | null>(null);
  const penActive = useRef(false);
  const dirtyPages = useRef(new Set<string>());
  const listeners = useRef(new Set<(e: DeskEvent) => void>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);


  function applyPrefsToState(p: DeskPrefs) {
    setPenState((cur) => ({
      ...cur,
      tool: p.pen.tool,
      brush: p.pen.brush,
      color: p.pen.color,
      widthStep: p.pen.widthStep,
      widthMul: p.pen.widthMul ?? 1,
      opacity: p.pen.opacity,
      streamline: p.pen.streamline,
    }));
    setBibleModeState(p.bibleMode);
    setOverlayVisibilityState(p.overlay.visibility);
    setOverlayMarginState(p.overlay.margin);
  }

  /**
   * Apple Pencil double-tap. UIKit hands it to the companion (WebShellView's
   * UIPencilInteraction), which dispatches 'pitaya-pencil' here. Double-tap swaps to the
   * eraser and back to whatever he was holding; the swap is deliberately NOT persisted, so
   * a flick of the pencil never rewrites his saved default.
   */
  const beforeEraser = useRef<PenTool | null>(null);
  useEffect(() => {
    const onPencil = (ev: Event) => {
      const detail = (ev as CustomEvent<{ kind?: string; action?: string }>).detail ?? {};
      if (detail.action === "ignore") return;
      setPenState((cur) => {
        if (detail.action === "palette" || detail.action === "attributes") return cur;
        // eraser | previous — both mean "the other tool" here
        if (cur.tool === "eraser") {
          const back = beforeEraser.current ?? cur.brush;
          beforeEraser.current = null;
          return { ...cur, tool: back };
        }
        beforeEraser.current = cur.tool;
        return { ...cur, tool: "eraser" };
      });
      haptic("rigid");
    };
    window.addEventListener("pitaya-pencil", onPencil);
    return () => window.removeEventListener("pitaya-pencil", onPencil);
  }, []);

  // boot: local first, then the server's copy (a microtask after mount, so the
  // server-rendered markup hydrates before the local prefs reshape the desk)
  useEffect(() => {
    Promise.resolve().then(() => {
      const local = readLocalDeskPrefs();
      setPrefs(local);
      applyPrefsToState(local);
    });
    fetch("/api/spirit/desk-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.prefs) {
          const merged = mergeDeskPrefs(d.prefs);
          setPrefs(merged);
          writeLocalDeskPrefs(merged);
          applyPrefsToState(merged);
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  const updatePrefs = useCallback((patch: Partial<DeskPrefs> | ((p: DeskPrefs) => DeskPrefs)) => {
    setPrefs((prev) => {
      const next = mergeDeskPrefs(typeof patch === "function" ? patch(prev) : { ...prev, ...patch });
      writeLocalDeskPrefs(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/spirit/desk-prefs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }).catch(() => {});
      }, 900);
      return next;
    });
  }, []);

  const setPen = useCallback(
    (patch: Partial<PenState>) => {
      setPenState((cur) => {
        const next = { ...cur, ...patch };
        // remember recents + defaults
        if (patch.color && patch.color !== cur.color) {
          updatePrefs((p) => ({
            ...p,
            pen: {
              ...p.pen,
              color: patch.color as string,
              recents: [patch.color as string, ...p.pen.recents.filter((c) => c !== patch.color)].slice(0, 6),
            },
          }));
        } else if (patch.tool || patch.brush || patch.widthStep !== undefined || patch.widthMul !== undefined || patch.streamline !== undefined || patch.opacity !== undefined) {
          updatePrefs((p) => ({
            ...p,
            pen: {
              ...p.pen,
              // "text" and "eraser" are transient modes, never a boot tool — a width nudge
              // while erasing must not make the eraser what the desk opens with tomorrow
              tool: (next.tool === "text" || next.tool === "eraser" ? p.pen.tool : next.tool) as DeskPrefs["pen"]["tool"],
              brush: next.brush,
              widthStep: next.widthStep,
              widthMul: next.widthMul,
              streamline: next.streamline,
              opacity: next.opacity,
            },
          }));
        }
        return next;
      });
    },
    [updatePrefs],
  );

  const setBibleMode = useCallback(
    (m: BibleMode) => {
      setBibleModeState(m);
      updatePrefs((p) => ({ ...p, bibleMode: m }));
    },
    [updatePrefs],
  );
  const setOverlayVisibility = useCallback(
    (v: OverlayVisibility) => {
      setOverlayVisibilityState(v);
      updatePrefs((p) => ({ ...p, overlay: { ...p.overlay, visibility: v } }));
    },
    [updatePrefs],
  );
  const setOverlayMargin = useCallback(
    (m: MarginStep) => {
      setOverlayMarginState(m);
      updatePrefs((p) => ({ ...p, overlay: { ...p.overlay, margin: m } }));
    },
    [updatePrefs],
  );

  const emit = useCallback((e: DeskEvent) => {
    for (const fn of Array.from(listeners.current)) {
      try {
        fn(e);
      } catch (err) {
        console.warn("desk event handler failed", err);
      }
    }
  }, []);
  const subscribe = useCallback((fn: (e: DeskEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const recordingSeconds = useCallback(() => {
    if (!recording) return null;
    const now = Date.now();
    const paused = recording.pausedAccum + (recording.pausedSince ? now - recording.pausedSince : 0);
    return Math.max(0, (now - recording.startEpoch - paused) / 1000);
  }, [recording]);

  const value = useMemo<DeskStateValue>(
    () => ({
      prefs,
      updatePrefs,
      hand: prefs.handedness,
      pen,
      setPen,
      bibleMode,
      setBibleMode,
      overlayVisibility,
      setOverlayVisibility,
      overlayMargin,
      setOverlayMargin,
      context,
      setContext,
      popover,
      setPopover,
      recording,
      setRecording,
      recordingSeconds,
      penActive,
      emit,
      subscribe,
      dirtyPages,
    }),
    [prefs, updatePrefs, pen, setPen, bibleMode, setBibleMode, overlayVisibility, setOverlayVisibility, overlayMargin, setOverlayMargin, context, popover, recording, recordingSeconds, emit, subscribe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The six highlight categories — the highlighter's only palette. */
export const HL_CATEGORIES = [
  { name: "God", short: "God", color: "#D9A23E" },
  { name: "Promise & Covenant", short: "Promise", color: "#4C7DBF" },
  { name: "Command", short: "Command", color: "#3E7A54" },
  { name: "Sin & Consequence", short: "Sin", color: "#B4533F" },
  { name: "Christ", short: "Christ", color: "#7B5EA7" },
  { name: "Context", short: "Context", color: "#4E7C8A" },
] as const;

export function hlColor(name: string) {
  return HL_CATEGORIES.find((c) => c.name === name)?.color ?? "#D9A23E";
}
