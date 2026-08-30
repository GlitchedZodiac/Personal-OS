"use client";

// The Desk (01 · 04 · 10): a top bar (‹ Home · diamond + title · the pen
// chip · layout picker · Flip) over panes. Layouts are presets per context
// — Study (Teaching | Notebook) · Sermon (Notebook | Bible over Reference)
// · Free reading (one text, margins wide) · Source (Notebook | Bible over
// Source) — remembered per context, per device. Handedness is a setting:
// the writing column sits on the writing side; the rail rides the seam.
// Seams are finger-only and snap to thirds; the Pencil never moves one.
// Portrait stacks: text above, writing below.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDesk, useDeskEvent } from "./desk-state";
import { BiblePane } from "./bible-pane";
import { NotebookPane } from "./notebook-pane";
import { TeachingPane } from "./teaching-pane";
import { SourcePane } from "./source-pane";
import { SundayPane } from "./sunday-pane";
import { PenPopover } from "./pen-popovers";
import { Popover, Kicker, DISPLAY } from "./ui";
import { FlipIcon, PenIcon, GPenIcon, HighlighterIcon, PencilIcon, MarkerIcon, EraserIcon, LassoIcon, MicIcon, PhotoIcon } from "./desk-icons";
import { SEAM_STOPS_H, SEAM_STOPS_V, nearestStop, type DeskContext } from "@/lib/desk-prefs";
import { SeamRail } from "./seam-rail";
import { haptic } from "@/lib/haptics";
import { BOOKS, refParts } from "@/lib/bible-refs";
import { toast } from "sonner";

export type DocKind = "bible" | "reference" | "teaching" | "notebook" | "source" | "sunday";

export interface DeskShellProps {
  context: DeskContext;
  title: string;
  chip?: string | null;
  mainQ: string | null;
  refQ?: string | null;
  free?: boolean;
  dayId?: string | null;
  pageId?: string | null;
  layerContext?: { key: string; label: string } | null;
  onTakeNotes?: () => void;
}

interface Layout {
  preset: "study" | "sermon" | "free" | "source" | "custom";
  writing: DocKind[]; // the writing column (usually [notebook]) — or [] for a text-only tab
  text: DocKind[]; // the text column, 1–2 docs — stacked, or side by side when cols
  cols?: boolean;
}
/** A tab is a saved arrangement (Logos-style): swipe or tap between them; each remembers its docs. */
interface DeskTab extends Layout {
  id: string;
  label: string;
  /**
   * Each tab stands in its own place in the Bible (2026-08-30, his report: switching tabs
   * reset the Bible to another book). A tab is an arrangement AND a position — that is what
   * makes flipping between two references worth doing.
   */
  mainQ?: string | null;
  refQ?: string | null;
  /** and its own place INSIDE that chapter — the verse he had, and how far down he was */
  verse?: number | null;
  scrollY?: number;
}
const TAB_TEMPLATES: { key: string; label: string; sub: string; make: () => Layout }[] = [
  { key: "notebook", label: "Notebook", sub: "one full page", make: () => ({ preset: "custom", writing: ["notebook"], text: [] }) },
  { key: "bible", label: "Bible", sub: "one text, full width", make: () => ({ preset: "free", writing: [], text: ["bible"] }) },
  { key: "reference", label: "Reference", sub: "the Bible that follows links", make: () => ({ preset: "custom", writing: [], text: ["reference"] }) },
  { key: "nb-bible", label: "Notebook | Bible", sub: "two panes", make: () => ({ preset: "custom", writing: ["notebook"], text: ["bible"] }) },
  { key: "nb-ref", label: "Notebook | Reference", sub: "two panes", make: () => ({ preset: "custom", writing: ["notebook"], text: ["reference"] }) },
  { key: "bible-ref", label: "Bible | Reference", sub: "two texts side by side", make: () => ({ preset: "custom", writing: [], text: ["bible", "reference"], cols: true }) },
  { key: "sermon", label: "Notebook | Bible ⁄ Reference", sub: "the Sunday desk — stacked", make: () => ({ preset: "sermon", writing: ["notebook"], text: ["bible", "reference"] }) },
  { key: "three", label: "Notebook | Bible | Reference", sub: "three columns", make: () => ({ preset: "custom", writing: ["notebook"], text: ["bible", "reference"], cols: true }) },
  { key: "study", label: "Notebook | Teaching", sub: "the study desk", make: () => ({ preset: "study", writing: ["notebook"], text: ["teaching"] }) },
  { key: "source", label: "Notebook | Bible ⁄ Source", sub: "with the source open", make: () => ({ preset: "source", writing: ["notebook"], text: ["bible", "source"] }) },
];
const defaultTabsFor = (context: DeskContext): DeskTab[] => {
  const t = (key: string, id: string, label?: string): DeskTab => {
    const tpl = TAB_TEMPLATES.find((x) => x.key === key)!;
    return { id, label: label ?? tpl.label, ...tpl.make() };
  };
  if (context === "sermon") return [t("sermon", "sermon", "Sunday"), t("notebook", "nb"), t("bible", "bible"), t("reference", "ref"), t("three", "three", "All three")];
  if (context === "free") return [t("bible", "bible"), t("nb-bible", "nb-bible"), t("notebook", "nb"), t("bible-ref", "bible-ref")];
  return [t("study", "study", "Study"), t("nb-bible", "nb-bible"), t("bible", "bible"), t("notebook", "nb"), t("three", "three", "All three")];
};
/** a 28pt band control with the full 36pt row as its hit area — the band sits on the
 * screen's top edge, so Fitts does the rest */
function BandBtn({ title, onClick, active, children }: { title: string; onClick?: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ width: 28, height: 28, flex: "none", borderRadius: 9, background: active ? "#F6E3EB" : "#FFFFFF", border: `1px solid ${active ? "#A63D63" : "#E4E2E6"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
      {children}
    </button>
  );
}

/** the 15×11 arrangement thumbnail a tab pill wears — writing pane tinted, text panes outlined */
function TabThumb({ writing, text, cols, active }: { writing: number; text: number; cols?: boolean; active: boolean }) {
  const line = active ? "#C98BA8" : "#A9A7AE";
  return (
    <span style={{ display: "flex", gap: 1.5, width: 15, height: 11, flex: "none" }}>
      {writing > 0 && <span style={{ flex: 1.1, background: active ? "#F0D3E0" : "#DEDCE0", borderRadius: 1.5 }} />}
      {text > 0 && (text > 1 && !cols ? (
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <span style={{ flex: 1.2, border: `1px solid ${line}`, borderRadius: 1.5, boxSizing: "border-box" }} />
          <span style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 1.5, boxSizing: "border-box" }} />
        </span>
      ) : (
        Array.from({ length: Math.min(text, 2) }, (_, i) => <span key={i} style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 1.5, boxSizing: "border-box" }} />)
      ))}
      {writing === 0 && text === 0 && <span style={{ flex: 1, border: `1px solid ${line}`, borderRadius: 1.5, boxSizing: "border-box" }} />}
    </span>
  );
}

const newTabId = () => `t-${Math.random().toString(36).slice(2, 8)}`;
const PRESETS: Record<"study" | "sermon" | "free" | "source", Layout> = {
  study: { preset: "study", writing: ["notebook"], text: ["teaching"] },
  sermon: { preset: "sermon", writing: ["notebook"], text: ["bible", "reference"] },
  free: { preset: "free", writing: [], text: ["bible"] },
  source: { preset: "source", writing: ["notebook"], text: ["bible", "source"] },
};
const DOC_LABEL: Record<DocKind, string> = { bible: "Bible", reference: "Reference Bible", teaching: "Teaching", notebook: "Notebook", source: "Source", sunday: "Sunday" };

export function DeskShell(props: DeskShellProps) {
  const { context, title, chip, free, dayId, pageId, layerContext, onTakeNotes } = props;
  const desk = useDesk();
  const { hand, pen, prefs, updatePrefs, popover, setPopover, setContext } = desk;
  const [tabs, setTabs] = useState<DeskTab[]>(() => {
    const saved = prefs.layouts[context]?.tabs as DeskTab[] | undefined;
    return saved && saved.length ? saved : defaultTabsFor(context);
  });
  const [activeTab, setActiveTab] = useState<string>(() => prefs.layouts[context]?.activeTab ?? (prefs.layouts[context]?.tabs?.[0]?.id ?? defaultTabsFor(context)[0].id));
  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const layout: Layout = tab;
  // edits always land on the active tab (slot menus, events, presets)
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;
  /** patch the ACTIVE tab — layout, or its own Bible position */
  const updateTab = useCallback((next: (t: DeskTab) => Partial<DeskTab>) => {
    setTabs((ts) => ts.map((t) => (t.id === (activeRef.current ?? ts[0].id) ? { ...t, ...next(t) } : t)));
  }, []);
  const setLayout = (next: Layout | ((l: Layout) => Layout)) => {
    updateTab((t) => (typeof next === "function" ? next(t) : next));
  };
  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const tabsLoaded = useRef(false);
  const [nbFrac, setNbFrac] = useState(prefs.layouts[context]?.nbFrac ?? 0.535);
  const [stackFrac, setStackFrac] = useState(prefs.layouts[context]?.stackFrac ?? 0.6);
  // the ACTIVE tab's position; writing goes back into that tab, so switching restores it
  const mainQ = tab?.mainQ ?? props.mainQ;
  const setMainQ = useCallback((q: string | null) => updateTab(() => ({ mainQ: q })), [updateTab]);
  // Where he is INSIDE the chapter, per tab. This lives in its own localStorage entry rather
  // than on the tab: desk prefs load asynchronously, and a pane that reports its position
  // before they arrive overwrites them — which cost a saved tab during smoke on 2026-08-30.
  // Scroll position is a per-device thing anyway; it has no business syncing.
  const placeKey = tab ? `spirit-place:${context}:${tab.id}` : null;
  // a verse the shell asked a Bible pane to show. `seq` re-arms it so tapping the same
  // reference card twice jumps twice.
  const [jump, setJump] = useState<{ refStart: number; refEnd: number | null; seq: number; to: "main" | "reference" } | null>(null);
  // a verse dropped while no notebook was open — replayed once the pane mounts
  const noteSeq = useRef(1);
  const [pendingNote, setPendingNote] = useState<{ refStart: number; refEnd: number; label: string; text: string; seq: number } | null>(null);
  const clearJump = useCallback((seq: number) => setJump((j) => (j && j.seq === seq ? null : j)), []);
  const refQ = tab?.refQ ?? props.refQ ?? props.mainQ;
  const setRefQ = useCallback((q: string | null) => updateTab(() => ({ refQ: q })), [updateTab]);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState<"v" | "h" | null>(null);
  const [size, setSize] = useState({ w: 1180, h: 820 });
  const [slotMenu, setSlotMenu] = useState<{ col: "writing" | "text"; index: number } | null>(null);
  const [stepInfo, setStepInfo] = useState<{ step: number; total: number } | null>(null);
  // V2 band state — inline tab rename, the capture pill, and the clock the band carries
  // because the system status bar is hidden in the companion (a canvas app owns its top edge)
  const [renaming, setRenaming] = useState<string | null>(null);
  const holdT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillsRef = useRef<HTMLDivElement | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [dict, setDict] = useState<{ startedAt: number } | null>(null);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  const [batt, setBatt] = useState<{ level: number; charging: boolean } | null>(null);
  const [, setTick] = useState(0);
  const dictRef = useRef(false);
  useEffect(() => {
    // keep the active pill in view — with six arrangements the row scrolls, and a tab you
    // just switched to must never sit clipped off the edge
    const id = requestAnimationFrame(() => {
      pillsRef.current?.querySelector<HTMLElement>("[data-tab-active=\"1\"]")?.scrollIntoView({ inline: "nearest", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
    // `dict` too: the capture pill takes the tabs' place while listening, and the row came
    // back scrolled to the start with the active pill off-view
     
  }, [activeTab, dict]);
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      // the capture pill's elapsed label rides the same tick — no second state update
      setTick((n) => (dictRef.current ? n + 1 : n));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // the companion posts battery level; in a plain browser the glyph simply never appears
    const onBatt = (ev: Event) => {
      const d = (ev as CustomEvent<{ level?: number; charging?: boolean }>).detail;
      if (d && typeof d.level === "number") setBatt({ level: d.level, charging: Boolean(d.charging) });
    };
    window.addEventListener("pitaya-battery", onBatt);
    return () => window.removeEventListener("pitaya-battery", onBatt);
  }, []);
  const deskRef = useRef<HTMLDivElement | null>(null);
  const flip = useRef(false);

  useEffect(() => setContext(context), [context, setContext]);
  // the remembered preset per context
  useEffect(() => {
    const saved = prefs.layouts[context]?.tabs as DeskTab[] | undefined;
    if (saved && saved.length && !tabsLoaded.current) {
      tabsLoaded.current = true;
      canPersist.current = true; // his tabs are in hand — safe to write back from here on
      setTabs(saved);
      setActiveTab(prefs.layouts[context]?.activeTab ?? saved[0].id);
    }
    setNbFrac(prefs.layouts[context]?.nbFrac ?? 0.535);
    setStackFrac(prefs.layouts[context]?.stackFrac ?? 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, prefs.layouts[context]?.tabs]);
  // persist the tab set whenever it changes (after the first paint)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest tabs/activeTab, readable from a cleanup that closed over older ones.
  const latest = useRef({ tabs, activeTab });
  latest.current = { tabs, activeTab };
  /**
   * Nothing is written back until we know what was saved. `tabs` starts as the DEFAULT set
   * (prefs are still the module default at first render and arrive a beat later), so a write
   * in that window persists the defaults over his real tabs — and the restore then reads them
   * back and they are gone. The grace period covers the case where there was genuinely nothing
   * saved and the restore therefore never fires.
   */
  const canPersist = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { canPersist.current = true; }, 2500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    if (!canPersist.current) return;
    persistTimer.current = setTimeout(() => { saveLayout({ tabs, activeTab }); persistTimer.current = null; }, 600);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTab]);
  /**
   * Flush on UNMOUNT ONLY — its own effect with empty deps, which is the whole point.
   * Clearing the timer above without flushing dropped any position change made in the last
   * 600 ms before he navigated away. But flushing from THAT effect's cleanup fires on every
   * deps change, and the first one lands before the saved tabs have loaded — which writes the
   * DEFAULT tabs over his real ones and then loses them for good. (Caught in smoke, 2026-08-30,
   * after it ate a custom tab.) The window between mount and restore is exactly why this must
   * not run early.
   */
  useEffect(() => () => {
    if (!persistTimer.current) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = null;
    if (tabsLoaded.current) saveLayout(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // A deep link (?q=) retargets the ACTIVE tab, not every tab. Guarded on there actually
    // being one: without the guard this fires on every mount and stamps the shell's default
    // passage over a tab that already knew where he was reading.
    if (!props.mainQ && !props.refQ) return;
    updateTab(() => ({ mainQ: props.mainQ, refQ: props.refQ ?? props.mainQ }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mainQ, props.refQ]);

  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
    // activeTab is in the deps because the desk div is keyed on it: after a tab switch the
    // old node is detached and the observer was watching a corpse, so rotating the iPad no
    // longer flipped the desk into portrait until a full reload.
     
  }, [activeTab]);

  useDeskEvent((e) => {
    if (e.type === "open-source") {
      setSourceKey(e.key);
      // a Source pane appears where the reference/teaching doc was, if none is open
      setLayout((l) => (l.text.includes("source") ? l : { preset: "custom", writing: l.writing, text: l.text.length > 1 ? [l.text[0], "source"] : [...l.text, "source"] }));
    }
    if (e.type === "open-main") {
      setMainQ(e.q);
      // no Bible on the desk (Study opens Notebook | Teaching): the Bible stacks in over the text doc
      setLayout((l) => (l.text.includes("bible") ? l : { preset: "custom", writing: l.writing, text: ["bible", ...l.text.filter((k) => k !== "bible")].slice(0, 2) as DocKind[] }));
    }
    if (e.type === "open-reference" && !layout.text.includes("reference")) {
      // no reference pane: the main follows
      setMainQ(e.q);
    }
    if (e.type === "dictate-state") {
      dictRef.current = e.on;
      setDict(e.on ? { startedAt: e.startedAt ?? Date.now() } : null);
    }
    if (e.type === "send-to-notes") {
      // "drag a verse to any notebook from anywhere" (his 2026-08-30 ask). A notebook pane on
      // screen answers this itself; when the tab has none the drop used to land nowhere, so
      // the shell opens one and the pane picks the event up as it mounts.
      const hasNotebook = [...layout.writing, ...layout.text].includes("notebook");
      if (!hasNotebook) {
        setLayout((l) => ({ preset: "custom", writing: ["notebook"], text: l.text.length ? l.text : l.writing }));
        setPendingNote({ ...e, seq: noteSeq.current++ });
        toast(`Opened your notebook — ${e.label} dropped in`);
      }
    }
    if (e.type === "jump-reference-pane") {
      // The panes handle this themselves when one is open. The case only the SHELL can fix is
      // a tab with no Bible at all — Study is Notebook | Teaching — where the tap used to fire
      // into an empty room and look broken.
      // BOTH columns — a Bible living in the writing slot is still a Bible, and splicing a
      // second one in would double-handle the tap
      const hasBible = [...layout.writing, ...layout.text].some((k) => k === "bible" || k === "reference");
      if (hasBible) return;
      const p = refParts(e.refStart);
      const book = BOOKS[p.book - 1];
      if (!book) return; // never ask for the chapter "undefined 4"
      setMainQ(`${book} ${p.chapter}`);
      setLayout((l) => ({ preset: "custom", writing: l.writing, text: ["bible", ...l.text.filter((k) => k !== "bible")].slice(0, 2) as DocKind[] }));
      setJump((j) => ({ refStart: e.refStart, refEnd: e.refEnd ?? null, seq: (j?.seq ?? 0) + 1, to: "main" }));
      toast(`Opened ${book} ${p.chapter}`);
      haptic("selection");
    }
  }, [layout]);

  const saveLayout = useCallback(
    (next: Partial<{ preset: string; nbFrac: number; stackFrac: number; tabs: DeskTab[]; activeTab: string }>) => {
      updatePrefs((p) => ({ ...p, layouts: { ...p.layouts, [context]: { ...p.layouts[context], ...next } } }));
    },
    [context, updatePrefs],
  );
  const pickPreset = (k: "study" | "sermon" | "free" | "source") => {
    setLayout(PRESETS[k]);
    saveLayout({ preset: k });
    setPopover(null);
  };
  const addTab = (tplKey: string) => {
    const tpl = TAB_TEMPLATES.find((x) => x.key === tplKey);
    if (!tpl) return;
    const id = newTabId();
    setTabs((ts) => [...ts, { id, label: tpl.label, ...tpl.make() }]);
    setActiveTab(id);
    setPopover(null);
    haptic("medium");
  };
  const removeTab = (id: string) => {
    setTabs((ts) => {
      if (ts.length <= 1) return ts;
      const next = ts.filter((t) => t.id !== id);
      if (activeTab === id) setActiveTab(next[Math.max(0, ts.findIndex((t) => t.id === id) - 1)].id);
      return next;
    });
    setTabMenu(null);
  };
  // V2: renaming happens IN the band — the title slot becomes the field, DONE commits.
  // Reached from the tab menu or by holding a tab pill (the layout menu says so).
  const renameTab = (id: string) => {
    const cur = tabs.find((t) => t.id === id);
    setTabMenu(null);
    setRenaming(id);
    setRenameVal(cur?.label ?? "");
  };
  const commitRename = () => {
    const id = renaming;
    setRenaming(null);
    const name = renameVal.trim();
    if (id && name) setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, label: name } : t)));
  };
  const stepTab = (dir: 1 | -1) => {
    const i = tabs.findIndex((t) => t.id === activeTab);
    const n = tabs[(i + dir + tabs.length) % tabs.length];
    if (n) {
      setActiveTab(n.id);
      haptic("selection");
    }
  };
  // finger swipe on the tab strip → previous / next tab
  const swipe = useRef<{ x: number; t: number } | null>(null);
  const onStripDown = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") return;
    swipe.current = { x: e.clientX, t: Date.now() };
  };
  const onStripUp = (e: React.PointerEvent) => {
    const sw = swipe.current;
    swipe.current = null;
    if (!sw || e.pointerType === "pen") return;
    const dx = e.clientX - sw.x;
    if (Math.abs(dx) > 60 && Date.now() - sw.t < 700) stepTab(dx < 0 ? 1 : -1);
  };
  const doFlip = () => {
    haptic("medium");
    flip.current = !flip.current;
    updatePrefs((p) => ({ ...p, handedness: p.handedness === "left" ? "right" : "left" }));
  };

  // seams — finger only, snap on release
  const startDrag = (axis: "v" | "h") => (e: React.PointerEvent) => {
    if (e.pointerType === "pen") return;
    e.preventDefault();
    const el = deskRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDragging(axis);
    const stops = axis === "v" ? SEAM_STOPS_V : SEAM_STOPS_H;
    const writingLeft = hand === "left";
    const mv = (ev: PointerEvent) => {
      let f: number;
      if (axis === "v") {
        f = (ev.clientX - r.left) / r.width;
        if (!writingLeft) f = 1 - f;
        setNbFrac(Math.max(stops[0] - 0.05, Math.min(stops[2] + 0.05, f)));
      } else {
        f = (ev.clientY - r.top) / r.height;
        setStackFrac(Math.max(stops[0] - 0.05, Math.min(stops[2] + 0.05, f)));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      setDragging(null);
      haptic("rigid");
      if (axis === "v") setNbFrac((f) => { const s = nearestStop(f, stops); saveLayout({ nbFrac: s }); return s; });
      else setStackFrac((f) => { const s = nearestStop(f, stops); saveLayout({ stackFrac: s }); return s; });
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const portrait = size.h > size.w * 1.02;
  const writingLeft = hand === "left";
  const railSide: "left" | "right" = writingLeft ? "right" : "left"; // the rail rides the seam edge
  const notebookPageLayerContext = layerContext;

  const renderDoc = (kind: DocKind, col: "writing" | "text", index: number): ReactNode => {
    const kicker = () => setSlotMenu((m) => (m && m.col === col && m.index === index ? null : { col, index }));
    switch (kind) {
      case "notebook":
        return <NotebookPane railSide={portrait ? (writingLeft ? "right" : "left") : railSide} showRail={portrait || textEmpty} context={context} initialPageId={pageId ?? null} dayId={dayId ?? null} pendingNote={pendingNote} onNoteConsumed={() => setPendingNote(null)} onKicker={kicker} />;
      case "bible":
        return <BiblePane role="main" query={mainQ} onQueryChange={setMainQ} placeKey={placeKey} pendingJump={jump?.to === "main" ? jump : null} onJumpConsumed={clearJump} free={free} dayId={dayId ?? null} layerContext={notebookPageLayerContext} onKicker={kicker} />;
      case "reference":
        return <BiblePane role="reference" query={refQ} onQueryChange={setRefQ} free layerContext={notebookPageLayerContext} onKicker={kicker} />;
      case "teaching":
        return <TeachingPane onKicker={kicker} onStep={(s, t) => setStepInfo({ step: s, total: t })} />;
      case "source":
        return <SourcePane onKicker={kicker} initialKey={sourceKey} />;
      case "sunday":
        return <SundayPane onKicker={kicker} onTakeNotes={onTakeNotes} />;
    }
  };
  const slotMenuEl = (col: "writing" | "text", index: number) =>
    slotMenu && slotMenu.col === col && slotMenu.index === index ? (
      <Popover width={220} onClose={() => setSlotMenu(null)} style={{ left: 12, top: 44 }}>
        <Kicker>THIS PANE SHOWS</Kicker>
        {(["bible", "reference", "teaching", "notebook", "source", "sunday"] as DocKind[]).map((k) => (
          <button key={k} type="button" onClick={() => { setLayout((l) => { const next = { ...l, preset: "custom" as const, [col]: l[col].map((d, i) => (i === index ? k : d)) }; return next; }); saveLayout({ preset: "custom" }); setSlotMenu(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 4, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#232227", background: layout[col][index] === k ? "#F6E3EB" : "transparent", border: 0, cursor: "pointer" }}>
            {DOC_LABEL[k]}
          </button>
        ))}
      </Popover>
    ) : null;

  const paneBox: React.CSSProperties = { background: "#FFFFFF", borderRadius: 16, boxShadow: "0 2px 12px rgba(35,34,39,0.06)", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" };
  const textEmpty = layout.text.length === 0;
  const cols = Boolean(layout.cols) && layout.text.length > 1 && !portrait;
  // KEYS, and they are load-bearing. Portrait and landscape render these two columns in
  // opposite order inside an unkeyed fragment, so React reconciled them BY INDEX: rotating the
  // iPad swapped the notebook and the Bible into each other's host divs, unmounting and
  // remounting both. That is why rotating lost his chapter, his scroll position and his
  // selection, and re-fired the auto-scroll to today's assignment verse. (His report,
  // 2026-08-30: "when the screen changes orientation it doesn't stay on the same book chapter
  // nor verse.") A stable key makes the reorder a move instead of a teardown.
  const writingCol = layout.writing.length ? (
    <div key="writing-col" style={{ ...paneBox, flex: textEmpty ? 1 : "none", width: textEmpty || portrait ? "auto" : `calc(${(nbFrac * (cols ? 0.72 : 1) * 100).toFixed(2)}% - 24px)`, transition: dragging === "v" ? "none" : "width .36s cubic-bezier(.25,1.15,.3,1)", height: portrait && !textEmpty ? `calc(${((1 - stackFrac) * 100).toFixed(2)}% - 7px)` : undefined }}>
      {renderDoc(layout.writing[0], "writing", 0)}
      {slotMenuEl("writing", 0)}
    </div>
  ) : null;
  const textCol = textEmpty ? null : (
    <div key="text-col" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: cols ? "row" : "column", height: portrait && writingCol ? `calc(${(stackFrac * 100).toFixed(2)}% - 7px)` : undefined }}>
      {layout.text.map((d, i) => (
        <div key={`${d}-${i}`} style={{ display: "contents" }}>
          {i > 0 && !cols && (
            <div onPointerDown={startDrag("h")} style={{ height: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "row-resize", touchAction: "none" }}>
              <span style={{ width: 34, height: 4, borderRadius: 99, background: dragging === "h" ? "#A63D63" : "#C9C7CD" }} />
            </div>
          )}
          {i > 0 && cols && <div style={{ width: 14, flex: "none" }} />}
          <div style={{ ...paneBox, flex: cols ? 1 : layout.text.length > 1 ? (i === 0 ? `0 0 calc(${(stackFrac * 100).toFixed(2)}% - 7px)` : 1) : 1, transition: dragging === "h" ? "none" : "flex-basis .36s cubic-bezier(.25,1.15,.3,1)" }}>
            {renderDoc(d, "text", i)}
            {slotMenuEl("text", i)}
          </div>
        </div>
      ))}
    </div>
  );
  // V2: the vertical seam IS the toolbar — see seam-rail.tsx and the design's own note:
  // "the 14pt gutter between the panes was already dead space and the 54pt rail sat right
  // beside it. V2 merges them into one 40pt seam that is both the toolbar and the resize
  // handle." Resizing is untouched: startDrag("v"), finger-only, snaps at thirds.
  const seamV = writingCol && !textEmpty ? (
    <SeamRail key="seam-v" onSeamDown={startDrag("v")} dragging={dragging === "v"} writingLeft={writingLeft} />
  ) : null;
  const seamH = writingCol && !textEmpty ? (
    <div key="seam-h" onPointerDown={startDrag("h")} style={{ height: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "row-resize", touchAction: "none" }}>
      <span style={{ width: 34, height: 4, borderRadius: 99, background: dragging === "h" ? "#A63D63" : "#C9C7CD" }} />
    </div>
  ) : null;

  const toolIcon = () => {
    const c = "#454349";
    switch (pen.tool) {
      case "gpen": return <GPenIcon size={13} color={c} strokeWidth={2} />;
      case "highlighter": return <HighlighterIcon size={13} color={c} strokeWidth={2} />;
      case "pencil": return <PencilIcon size={13} color={c} strokeWidth={2} />;
      case "marker": return <MarkerIcon size={13} color={c} strokeWidth={2} />;
      case "eraser": return <EraserIcon size={13} color={c} strokeWidth={2} />;
      case "lasso": return <LassoIcon size={13} color={c} strokeWidth={2} />;
      default: return <PenIcon size={13} color={c} strokeWidth={2} />;
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#F2F1F2", fontFamily: "var(--font-body)", overflow: "hidden", ["--desk-top" as string]: "env(safe-area-inset-top, 0px)" }}>
      {/* THE BAND — V2: two horizontal bands became one, locked at 36pt. In the companion
          the system status bar is hidden (a canvas app owns its top edge), so the band
          carries the clock — and the battery, when the shell reports it. Ported from
          `Pitaya iPad 01 - Sermon Desk.dc.html`. */}
      <div style={{ position: "absolute", top: "var(--desk-top)", left: 0, right: 0, height: 36, display: "flex", alignItems: "center", gap: 7, padding: "0 12px", boxSizing: "border-box", zIndex: 20, animation: "deskFadeIn .3s ease both" }}>
        <Link href="/home" title="Home" style={{ width: 28, height: 28, flex: "none", borderRadius: 9, background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          <span style={{ fontSize: 14, color: "#8C2F51", lineHeight: 1 }}>‹</span>
        </Link>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ flex: "none", marginLeft: 1 }}><rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" /></svg>

        {renaming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none", background: "#FFFFFF", borderRadius: 9, boxShadow: "inset 0 0 0 1.5px #A63D63", padding: "0 6px 0 9px", height: 28, boxSizing: "border-box" }}>
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
              style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: "#232227", border: 0, outline: "none", background: "transparent", width: Math.max(80, renameVal.length * 8 + 16), padding: 0 }}
            />
            <button type="button" onClick={commitRename} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "3px 10px", cursor: "pointer", border: 0 }}>DONE</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: "none", maxWidth: "26%" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            {chip && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap" }}>{chip}</span>}
            {stepInfo && context === "study" && <span style={{ fontSize: 10, color: "#96949B", whiteSpace: "nowrap" }}>step {stepInfo.step} of {stepInfo.total}</span>}
          </div>
        )}

        <span style={{ flex: 1 }} />

        {dict ? (
          /* the capture pill takes the tabs' room while listening — dictation lands at the caret */
          <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "none", background: "#FFFFFF", borderRadius: 99, boxShadow: "inset 0 0 0 1.5px #C24040", padding: "0 6px 0 12px", height: 26, boxSizing: "border-box" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C24040", animation: "deskPulse 1.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, color: "#8E3232" }}>LISTENING</span>
            <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 12 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 2.5, background: "#C24040", borderRadius: 2, height: "100%", transformOrigin: "bottom", animation: `deskVu .7s ease-in-out infinite ${i * 0.1}s` }} />)}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#232227", fontVariantNumeric: "tabular-nums" }}>{(() => { const s = Math.max(0, Math.floor((Date.now() - dict.startedAt) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; })()}</span>
            <span style={{ fontSize: 10, color: "#96949B" }}>→ lands at the caret</span>
            <button type="button" onClick={() => desk.emit({ type: "capture-voice" })} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#FFFFFF", background: "#232227", borderRadius: 99, padding: "3.5px 11px", cursor: "pointer", border: 0 }}>STOP</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 1 auto", minWidth: 0 }}>
            <div ref={pillsRef} onPointerDown={onStripDown} onPointerUp={onStripUp} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflowX: "auto", scrollbarWidth: "none", touchAction: "pan-x" }}>
            {tabs.map((t) => {
              const on = t.id === activeTab;
              return (
                <div key={t.id} style={{ position: "relative", flex: "none" }}>
                  <button
                    type="button"
                    onClick={() => { if (on) setTabMenu(tabMenu === t.id ? null : t.id); else { setActiveTab(t.id); haptic("selection"); } }}
                    onPointerDown={(e) => { if (e.pointerType === "pen") return; const id = t.id; holdT.current = setTimeout(() => renameTab(id), 480); }}
                    onPointerUp={() => { if (holdT.current) clearTimeout(holdT.current); }}
                    onPointerLeave={() => { if (holdT.current) clearTimeout(holdT.current); }}
                    data-tab-active={on ? "1" : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 6, height: 26, boxSizing: "border-box", padding: "0 11px", borderRadius: 99, background: on ? "#FFFFFF" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", border: 0, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    <TabThumb writing={t.writing.length} text={t.text.length} cols={Boolean(t.cols)} active={on} />
                    <span style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? "#8C2F51" : "#66646C" }}>{t.label}</span>
                  </button>
                  {tabMenu === t.id && (
                    <Popover width={200} onClose={() => setTabMenu(null)} style={{ left: 0, top: 32 }}>
                      <Kicker>THIS TAB</Kicker>
                      <button type="button" onClick={() => renameTab(t.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 6, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#232227", background: "transparent", border: 0, cursor: "pointer" }}>Rename</button>
                      <button type="button" onClick={() => { setTabs((ts) => { const i = ts.findIndex((x) => x.id === t.id); const copy = { ...t, id: newTabId(), label: `${t.label} 2` }; const next = ts.slice(); next.splice(i + 1, 0, copy); return next; }); setTabMenu(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 2, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#232227", background: "transparent", border: 0, cursor: "pointer" }}>Duplicate</button>
                      {tabs.length > 1 && <button type="button" onClick={() => removeTab(t.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 2, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#B4533F", background: "transparent", border: 0, cursor: "pointer" }}>Close tab</button>}
                    </Popover>
                  )}
                </div>
              );
            })}
            </div>
            {/* the + lives OUTSIDE the scroller — however many tabs there are, it is always
                reachable. His report: the row cut off and "there's no way to add plus". */}
            <button type="button" title="New arrangement — hold a tab to rename" onClick={() => setPopover(popover === "layout" ? null : "layout")} style={{ flex: "none", width: 28, height: 28, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#96949B", background: "transparent", border: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>
            </button>
          </div>
        )}

        <span style={{ flex: 1 }} />

        {portrait && (
          /* portrait has no seam to carry the tools yet — the pen chip stays until portrait V2 */
          <div style={{ position: "relative", flex: "none" }}>
            <BandBtn title="Pen" active={popover === "pen"} onClick={() => setPopover(popover === "pen" ? null : "pen")}>{toolIcon()}</BandBtn>
            {popover === "pen" && <PenPopover style={{ right: 0, top: 34 }} onClose={() => setPopover(null)} />}
          </div>
        )}
        <div style={{ position: "relative", flex: "none" }}>
          <BandBtn title="Layouts" active={popover === "layout"} onClick={() => setPopover(popover === "layout" ? null : "layout")}>
            <svg width="14" height="14" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1.4" fill="none" stroke={popover === "layout" ? "#8C2F51" : "#454349"} strokeWidth="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.4" fill="none" stroke={popover === "layout" ? "#8C2F51" : "#454349"} strokeWidth="1.5" /><rect x="1" y="9" width="6" height="6" rx="1.4" fill="none" stroke={popover === "layout" ? "#8C2F51" : "#454349"} strokeWidth="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.4" fill="none" stroke={popover === "layout" ? "#8C2F51" : "#454349"} strokeWidth="1.5" /></svg>
          </BandBtn>
          {popover === "layout" && (
            <Popover width={324} onClose={() => setPopover(null)} style={{ right: 0, top: 34, maxHeight: "calc(100vh - 90px)", overflowY: "auto" }}>
              <Kicker>NEW TAB · PICK AN ARRANGEMENT</Kicker>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 5, marginTop: 10 }}>
                {TAB_TEMPLATES.map((tpl) => {
                  const l = tpl.make();
                  const thumb = (
                    <div style={{ width: 54, height: 36, flex: "none", border: "1px solid #E4E2E6", borderRadius: 6, display: "flex", gap: 2, padding: 3, boxSizing: "border-box", background: "#FAF9FA", flexDirection: writingLeft ? "row" : "row-reverse" }}>
                      {l.writing.length > 0 && <span style={{ flex: 1.15, background: "#F0D3E0", borderRadius: 3 }} />}
                      {l.text.length > 0 && (l.cols && l.text.length > 1 ? l.text.map((d, i) => <span key={i} style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} />) : l.text.length > 1 ? (
                        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ flex: 1.3, background: "#E4E2E6", borderRadius: 3 }} />
                          <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} />
                        </span>
                      ) : <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} />)}
                    </div>
                  );
                  return (
                    <button key={tpl.key} type="button" onClick={() => addTab(tpl.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 10, cursor: "pointer", background: "transparent", border: "1px solid #EDEBEE", textAlign: "left", minWidth: 0, overflow: "hidden" }}>
                      {thumb}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tpl.label}</div>
                        <div style={{ fontSize: 9.5, color: "#96949B" }}>{tpl.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "1px solid #EDEBEE", paddingTop: 9 }}>
                <button type="button" onClick={() => pickPreset(context === "free" ? "free" : context === "sermon" ? "sermon" : "study")} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", border: 0, borderRadius: 99, padding: "5px 11px", cursor: "pointer" }}>Reset this tab to the {context} desk</button>
              </div>
              <div style={{ fontSize: 10, color: "#96949B", lineHeight: 1.55, marginTop: 9 }}>⇄ Flip swaps sides · seams snap to thirds, finger-only. Thumbnails follow your handedness. Hold a tab in the band to rename it.</div>
            </Popover>
          )}
        </div>
        <BandBtn title="Flip — swap sides" onClick={doFlip}><FlipIcon /></BandBtn>
        {layout.writing.includes("notebook") && (
          <>
            <BandBtn title="Photo — add to this page" onClick={() => desk.emit({ type: "capture-photo" })}><PhotoIcon size={14} color="#454349" /></BandBtn>
            <BandBtn title="Dictate into the page" active={Boolean(dict)} onClick={() => desk.emit({ type: "capture-voice" })}><MicIcon size={14} color={dict ? "#8C2F51" : "#454349"} /></BandBtn>
          </>
        )}
        <span style={{ width: 1, height: 15, background: "#DEDCE0", flex: "none", margin: "0 3px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "none" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#66646C", fontVariantNumeric: "tabular-nums" }}>{clock}</span>
          {batt && (
            <svg width="21" height="11" viewBox="0 0 25 12">
              <rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="#B4B2B8" />
              <rect x="2" y="2" width={Math.max(1.5, 18 * batt.level)} height="8" rx="1.6" fill={batt.charging ? "#5E9B72" : batt.level < 0.2 ? "#C24040" : "#66646C"} />
              <path d="M23.5 4v4a2 2 0 0 0 0-4Z" fill="#B4B2B8" />
            </svg>
          )}
        </div>
      </div>

      {/* the desk */}
      <div ref={deskRef} key={activeTab} className="desk-page-in" style={{ position: "absolute", top: "calc(36px + var(--desk-top))", left: 12, right: 12, bottom: 12, display: "flex", flexDirection: portrait ? "column" : writingLeft ? "row" : "row-reverse", userSelect: dragging ? "none" : "auto" }}>
        {portrait ? [textCol, seamH, writingCol] : [writingCol, seamV, textCol]}
      </div>
    </div>
  );
}
