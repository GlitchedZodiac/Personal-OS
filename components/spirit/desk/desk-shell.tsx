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
import { Popover, Kicker, IconButton, DISPLAY } from "./ui";
import { Diamond, FlipIcon, LayoutGridIcon, PenIcon, GPenIcon, HighlighterIcon, PencilIcon, MarkerIcon, EraserIcon, LassoIcon, MicIcon, PhotoIcon } from "./desk-icons";
import { SEAM_STOPS_H, SEAM_STOPS_V, nearestStop, type DeskContext } from "@/lib/desk-prefs";
import { hlColor } from "./desk-state";
import { askPrompt } from "./dialog";
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
  const setLayout = (next: Layout | ((l: Layout) => Layout)) => {
    setTabs((ts) => ts.map((t) => (t.id === (activeTab ?? ts[0].id) ? { ...t, ...(typeof next === "function" ? next(t) : next) } : t)));
  };
  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const tabsLoaded = useRef(false);
  const [nbFrac, setNbFrac] = useState(prefs.layouts[context]?.nbFrac ?? 0.535);
  const [stackFrac, setStackFrac] = useState(prefs.layouts[context]?.stackFrac ?? 0.6);
  const [mainQ, setMainQ] = useState<string | null>(props.mainQ);
  // a verse the shell asked a Bible pane to show. `seq` re-arms it so tapping the same
  // reference card twice jumps twice.
  const [jump, setJump] = useState<{ refStart: number; refEnd: number | null; seq: number; to: "main" | "reference" } | null>(null);
  const clearJump = useCallback((seq: number) => setJump((j) => (j && j.seq === seq ? null : j)), []);
  const [refQ, setRefQ] = useState<string | null>(props.refQ ?? props.mainQ);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState<"v" | "h" | null>(null);
  const [size, setSize] = useState({ w: 1180, h: 820 });
  const [slotMenu, setSlotMenu] = useState<{ col: "writing" | "text"; index: number } | null>(null);
  const [stepInfo, setStepInfo] = useState<{ step: number; total: number } | null>(null);
  const deskRef = useRef<HTMLDivElement | null>(null);
  const flip = useRef(false);

  useEffect(() => setContext(context), [context, setContext]);
  // the remembered preset per context
  useEffect(() => {
    const saved = prefs.layouts[context]?.tabs as DeskTab[] | undefined;
    if (saved && saved.length && !tabsLoaded.current) {
      tabsLoaded.current = true;
      setTabs(saved);
      setActiveTab(prefs.layouts[context]?.activeTab ?? saved[0].id);
    }
    setNbFrac(prefs.layouts[context]?.nbFrac ?? 0.535);
    setStackFrac(prefs.layouts[context]?.stackFrac ?? 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, prefs.layouts[context]?.tabs]);
  // persist the tab set whenever it changes (after the first paint)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => saveLayout({ tabs, activeTab }), 600);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTab]);
  useEffect(() => {
    setMainQ(props.mainQ);
    setRefQ(props.refQ ?? props.mainQ);
  }, [props.mainQ, props.refQ]);

  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

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
  const renameTab = async (id: string) => {
    const cur = tabs.find((t) => t.id === id);
    setTabMenu(null);
    const name = await askPrompt({ title: "Name this tab", value: cur?.label ?? "", placeholder: "e.g. Sunday · three texts" });
    if (name) setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, label: name } : t)));
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
        return <NotebookPane railSide={portrait ? (writingLeft ? "right" : "left") : railSide} context={context} initialPageId={pageId ?? null} dayId={dayId ?? null} onKicker={kicker} />;
      case "bible":
        return <BiblePane role="main" query={mainQ} onQueryChange={setMainQ} pendingJump={jump?.to === "main" ? jump : null} onJumpConsumed={clearJump} free={free} dayId={dayId ?? null} layerContext={notebookPageLayerContext} onKicker={kicker} />;
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
  const writingCol = layout.writing.length ? (
    <div style={{ ...paneBox, flex: textEmpty ? 1 : "none", width: textEmpty || portrait ? "auto" : `calc(${(nbFrac * (cols ? 0.72 : 1) * 100).toFixed(2)}% - 7px)`, transition: dragging === "v" ? "none" : "width .36s cubic-bezier(.25,1.15,.3,1)", height: portrait && !textEmpty ? `calc(${((1 - stackFrac) * 100).toFixed(2)}% - 7px)` : undefined }}>
      {renderDoc(layout.writing[0], "writing", 0)}
      {slotMenuEl("writing", 0)}
    </div>
  ) : null;
  const textCol = textEmpty ? null : (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: cols ? "row" : "column", height: portrait && writingCol ? `calc(${(stackFrac * 100).toFixed(2)}% - 7px)` : undefined }}>
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
  const seamV = writingCol && !textEmpty ? (
    <div onPointerDown={startDrag("v")} style={{ width: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "col-resize", touchAction: "none", position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: dragging === "v" ? "#A63D63" : "#C9C7CD" }} />)}
      </div>
      {dragging === "v" && <span style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 9, fontWeight: 600, color: "#FFFFFF", background: "rgba(35,34,39,0.82)", borderRadius: 99, padding: "3px 9px", zIndex: 6 }}>snaps at ⅓ · ½ · ⅔ — finger only</span>}
    </div>
  ) : null;
  const seamH = writingCol && !textEmpty ? (
    <div onPointerDown={startDrag("h")} style={{ height: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "row-resize", touchAction: "none" }}>
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
  const toolName = pen.tool === "fountain" ? "Fountain" : pen.tool === "gpen" ? "G-pen" : pen.tool === "highlighter" ? "Highlighter" : pen.tool === "pencil" ? "Pencil" : pen.tool === "marker" ? "Marker" : pen.tool === "eraser" ? "Eraser" : pen.tool === "lasso" ? "Lasso" : "Text";
  const inkDot = pen.tool === "highlighter" ? hlColor(pen.hlCategory) : pen.color;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#F2F1F2", fontFamily: "var(--font-body)", overflow: "hidden", ["--desk-top" as string]: "env(safe-area-inset-top, 0px)" }}>
      {/* the desk bar — below the iPad's status bar */}
      <div style={{ position: "absolute", top: "var(--desk-top)", left: 0, right: 0, height: 50, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", boxSizing: "border-box", zIndex: 20, animation: "deskFadeIn .3s ease both" }}>
        <Link href="/home" style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E2E6", borderRadius: 99, padding: "6px 13px 6px 10px", textDecoration: "none" }}>
          <span style={{ fontSize: 14, color: "#8C2F51", lineHeight: 1 }}>‹</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#454349" }}>Home</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, minWidth: 0 }}>
          <Diamond />
          <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {chip && <span style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "3px 9px", whiteSpace: "nowrap" }}>{chip}</span>}
          {stepInfo && context === "study" && <span style={{ fontSize: 10, color: "#96949B", whiteSpace: "nowrap" }}>step {stepInfo.step} of {stepInfo.total}</span>}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setPopover(popover === "pen" ? null : "pen")} style={{ display: "flex", alignItems: "center", gap: 7, background: popover === "pen" ? "#F6E3EB" : "#FFFFFF", border: `1px solid ${popover === "pen" ? "#A63D63" : "#E4E2E6"}`, borderRadius: 99, padding: "6px 12px", cursor: "pointer" }}>
            {toolIcon()}
            <span style={{ fontSize: 11, fontWeight: 600, color: "#454349" }}>{toolName}</span>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: inkDot, transition: "background .2s" }} />
            <span style={{ fontSize: 9, color: "#A9A7AE" }}>⌄</span>
          </button>
          {popover === "pen" && <PenPopover style={{ right: 0, top: 40 }} onClose={() => setPopover(null)} />}
        </div>
        <div style={{ position: "relative" }}>
          <IconButton title="Layouts" active={popover === "layout"} onClick={() => setPopover(popover === "layout" ? null : "layout")}>
            <LayoutGridIcon color={popover === "layout" ? "#8C2F51" : "#454349"} />
          </IconButton>
          {popover === "layout" && (
            <Popover width={324} onClose={() => setPopover(null)} style={{ right: 0, top: 40, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
              <Kicker>NEW TAB · PICK AN ARRANGEMENT</Kicker>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 5, marginTop: 10 }}>
                {TAB_TEMPLATES.map((t) => {
                  const l = t.make();
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
                    <button key={t.key} type="button" onClick={() => addTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 10, cursor: "pointer", background: "transparent", border: "1px solid #EDEBEE", textAlign: "left", minWidth: 0, overflow: "hidden" }}>
                      {thumb}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</div>
                        <div style={{ fontSize: 9.5, color: "#96949B" }}>{t.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "1px solid #EDEBEE", paddingTop: 9 }}>
                <button type="button" onClick={() => pickPreset(context === "free" ? "free" : context === "sermon" ? "sermon" : "study")} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", border: 0, borderRadius: 99, padding: "5px 11px", cursor: "pointer" }}>Reset this tab to the {context} desk</button>
              </div>
              <div style={{ fontSize: 10, color: "#96949B", lineHeight: 1.55, marginTop: 9 }}>Tabs are yours: swipe the strip with a finger, tap a pane&apos;s kicker to swap what it shows, ⇄ flips sides. Seams snap to thirds, finger-only.</div>
            </Popover>
          )}
        </div>
        {/* capture lives up here now, not in the writing rail — a photo and a voice note are
            things he ADDS to the page, not things the pen does with it */}
        {layout.writing.includes("notebook") && (
          <>
            <IconButton title="Photo — add to this page" onClick={() => desk.emit({ type: "capture-photo" })}><PhotoIcon size={16} color="#454349" /></IconButton>
            <IconButton title="Speak — dictate into this page" onClick={() => desk.emit({ type: "capture-voice" })}><MicIcon size={16} color="#454349" /></IconButton>
          </>
        )}
        <IconButton title="Flip — swap sides" onClick={doFlip}><FlipIcon /></IconButton>
      </div>

      {/* the tab strip — Logos-style arrangements; finger-swipe or tap */}
      <div onPointerDown={onStripDown} onPointerUp={onStripUp} style={{ position: "absolute", top: "calc(50px + var(--desk-top))", left: 12, right: 12, height: 32, display: "flex", alignItems: "center", gap: 6, zIndex: 19, overflowX: "auto", scrollbarWidth: "none", touchAction: "pan-x" }}>
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <div key={t.id} style={{ position: "relative", flex: "none" }}>
              <button type="button" onClick={() => { if (on) setTabMenu(tabMenu === t.id ? null : t.id); else { setActiveTab(t.id); haptic("selection"); } }} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: on ? "#FFFFFF" : "#66646C", background: on ? "#232227" : "#FFFFFF", border: `1px solid ${on ? "#232227" : "#E4E2E6"}`, borderRadius: 99, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                {t.label}
                {on && <span style={{ fontSize: 9, opacity: 0.7 }}>⌄</span>}
              </button>
              {tabMenu === t.id && (
                <Popover width={200} onClose={() => setTabMenu(null)} style={{ left: 0, top: 34 }}>
                  <Kicker>THIS TAB</Kicker>
                  <button type="button" onClick={() => renameTab(t.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 6, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#232227", background: "transparent", border: 0, cursor: "pointer" }}>Rename</button>
                  <button type="button" onClick={() => { setTabs((ts) => { const i = ts.findIndex((x) => x.id === t.id); const copy = { ...t, id: newTabId(), label: `${t.label} 2` }; const next = ts.slice(); next.splice(i + 1, 0, copy); return next; }); setTabMenu(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 2, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#232227", background: "transparent", border: 0, cursor: "pointer" }}>Duplicate</button>
                  {tabs.length > 1 && <button type="button" onClick={() => removeTab(t.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 9px", marginTop: 2, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "#B4533F", background: "transparent", border: 0, cursor: "pointer" }}>Close tab</button>}
                </Popover>
              )}
            </div>
          );
        })}
        <button type="button" title="New tab" onClick={() => setPopover(popover === "layout" ? null : "layout")} style={{ flex: "none", width: 26, height: 26, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", color: "#8C2F51", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>+</button>
        <span style={{ flex: 1 }} />
        {size.w > 900 && <span style={{ flex: "none", fontSize: 9.5, color: "#A9A7AE", whiteSpace: "nowrap" }}>swipe the strip · tap a pane&apos;s kicker to change it</span>}
      </div>

      {/* the desk */}
      <div ref={deskRef} key={activeTab} className="desk-page-in" style={{ position: "absolute", top: "calc(88px + var(--desk-top))", left: 12, right: 12, bottom: 12, display: "flex", flexDirection: portrait ? "column" : writingLeft ? "row" : "row-reverse", userSelect: dragging ? "none" : "auto" }}>
        {portrait ? (
          <>
            {textCol}
            {seamH}
            {writingCol}
          </>
        ) : (
          <>
            {writingCol}
            {seamV}
            {textCol}
          </>
        )}
      </div>
    </div>
  );
}
