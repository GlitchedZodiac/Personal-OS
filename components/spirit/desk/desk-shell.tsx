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
import { Diamond, FlipIcon, LayoutGridIcon, PenIcon, GPenIcon, HighlighterIcon, PencilIcon, MarkerIcon, EraserIcon, LassoIcon } from "./desk-icons";
import { SEAM_STOPS_H, SEAM_STOPS_V, nearestStop, type DeskContext } from "@/lib/desk-prefs";
import { hlColor } from "./desk-state";

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
  writing: DocKind[]; // the writing column (usually [notebook])
  text: DocKind[]; // the text column, 1–2 stacked
}
const PRESETS: Record<"study" | "sermon" | "free" | "source", Layout> = {
  study: { preset: "study", writing: ["notebook"], text: ["teaching"] },
  sermon: { preset: "sermon", writing: ["notebook"], text: ["bible", "reference"] },
  free: { preset: "free", writing: [], text: ["bible"] },
  source: { preset: "source", writing: ["notebook"], text: ["bible", "source"] },
};
const PRESET_LABEL: Record<string, { name: string; sub: string }> = {
  study: { name: "Study", sub: "Teaching | Notebook" },
  sermon: { name: "Sermon", sub: "Notebook | Bible over Reference" },
  free: { name: "Free reading", sub: "One text, margins wide" },
  source: { name: "Source", sub: "Notebook | Bible over Source" },
};
const DOC_LABEL: Record<DocKind, string> = { bible: "Bible", reference: "Reference Bible", teaching: "Teaching", notebook: "Notebook", source: "Source", sunday: "Sunday" };

export function DeskShell(props: DeskShellProps) {
  const { context, title, chip, free, dayId, pageId, layerContext, onTakeNotes } = props;
  const desk = useDesk();
  const { hand, pen, prefs, updatePrefs, popover, setPopover, setContext } = desk;
  const [layout, setLayout] = useState<Layout>(PRESETS[context === "free" ? "free" : context === "sermon" ? "sermon" : "study"]);
  const [nbFrac, setNbFrac] = useState(prefs.layouts[context]?.nbFrac ?? 0.535);
  const [stackFrac, setStackFrac] = useState(prefs.layouts[context]?.stackFrac ?? 0.6);
  const [mainQ, setMainQ] = useState<string | null>(props.mainQ);
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
    const p = prefs.layouts[context]?.preset as Layout["preset"] | undefined;
    if (p && p !== "custom" && PRESETS[p]) setLayout(PRESETS[p]);
    setNbFrac(prefs.layouts[context]?.nbFrac ?? 0.535);
    setStackFrac(prefs.layouts[context]?.stackFrac ?? 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, prefs.layouts[context]?.preset]);
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
  }, [layout]);

  const saveLayout = useCallback(
    (next: Partial<{ preset: string; nbFrac: number; stackFrac: number }>) => {
      updatePrefs((p) => ({ ...p, layouts: { ...p.layouts, [context]: { ...p.layouts[context], ...next } } }));
    },
    [context, updatePrefs],
  );
  const pickPreset = (k: "study" | "sermon" | "free" | "source") => {
    setLayout(PRESETS[k]);
    saveLayout({ preset: k });
    setPopover(null);
  };
  const doFlip = () => {
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
        return <BiblePane role="main" query={mainQ} onQueryChange={setMainQ} free={free} dayId={dayId ?? null} layerContext={notebookPageLayerContext} onKicker={kicker} />;
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
  const writingCol = layout.writing.length ? (
    <div style={{ ...paneBox, flex: "none", width: portrait ? "auto" : `calc(${(nbFrac * 100).toFixed(2)}% - 7px)`, transition: dragging === "v" ? "none" : "width .28s cubic-bezier(.3,.9,.3,1)", height: portrait ? `calc(${((1 - stackFrac) * 100).toFixed(2)}% - 7px)` : undefined }}>
      {renderDoc(layout.writing[0], "writing", 0)}
      {slotMenuEl("writing", 0)}
    </div>
  ) : null;
  const textCol = (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", height: portrait ? `calc(${(stackFrac * 100).toFixed(2)}% - 7px)` : undefined }}>
      {layout.text.map((d, i) => (
        <div key={`${d}-${i}`} style={{ display: "contents" }}>
          {i > 0 && (
            <div onPointerDown={startDrag("h")} style={{ height: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "row-resize", touchAction: "none" }}>
              <span style={{ width: 34, height: 4, borderRadius: 99, background: dragging === "h" ? "#A63D63" : "#C9C7CD" }} />
            </div>
          )}
          <div style={{ ...paneBox, flex: layout.text.length > 1 ? (i === 0 ? `0 0 calc(${(stackFrac * 100).toFixed(2)}% - 7px)` : 1) : 1, transition: dragging === "h" ? "none" : "flex-basis .28s cubic-bezier(.3,.9,.3,1)" }}>
            {renderDoc(d, "text", i)}
            {slotMenuEl("text", i)}
          </div>
        </div>
      ))}
    </div>
  );
  const seamV = writingCol ? (
    <div onPointerDown={startDrag("v")} style={{ width: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "col-resize", touchAction: "none", position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: dragging === "v" ? "#A63D63" : "#C9C7CD" }} />)}
      </div>
      {dragging === "v" && <span style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 9, fontWeight: 600, color: "#FFFFFF", background: "rgba(35,34,39,0.82)", borderRadius: 99, padding: "3px 9px", zIndex: 6 }}>snaps at ⅓ · ½ · ⅔ — finger only</span>}
    </div>
  ) : null;
  const seamH = writingCol ? (
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
    <div style={{ position: "absolute", inset: 0, background: "#F2F1F2", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      {/* the desk bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", boxSizing: "border-box", zIndex: 20 }}>
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
            <Popover width={272} onClose={() => setPopover(null)} style={{ right: 0, top: 40 }}>
              <Kicker>LAYOUTS · REMEMBERED PER CONTEXT</Kicker>
              {(["study", "sermon", "free", "source"] as const).map((k, i) => {
                const on = layout.preset === k;
                const thumb = (
                  <div style={{ width: 62, height: 42, flex: "none", border: `1px solid ${on ? "#E9CFDC" : "#E4E2E6"}`, borderRadius: 7, display: "flex", gap: 2, padding: 3, boxSizing: "border-box", background: on ? "#FFFFFF" : "#FAF9FA", flexDirection: writingLeft ? "row" : "row-reverse" }}>
                    {k === "free" ? <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /> : (
                      <>
                        <span style={{ flex: 1.2, background: "#F0D3E0", borderRadius: 3 }} />
                        {k === "study" ? <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /> : (
                          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ flex: 1.3, background: "#E4E2E6", borderRadius: 3 }} />
                            <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
                return (
                  <button key={k} type="button" onClick={() => pickPreset(k)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, marginTop: i === 0 ? 11 : 4, padding: 8, borderRadius: 11, cursor: "pointer", background: on ? "#F6E3EB" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", border: 0, textAlign: "left" }}>
                    {thumb}
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: on ? "#8C2F51" : "#232227" }}>{PRESET_LABEL[k].name}</div>
                      <div style={{ fontSize: 10.5, color: on ? "#B07A93" : "#96949B" }}>{PRESET_LABEL[k].sub}</div>
                    </div>
                    {on && <span style={{ marginLeft: "auto", color: "#A63D63", fontSize: 12 }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ fontSize: 10, color: "#96949B", lineHeight: 1.55, marginTop: 10, borderTop: "1px solid #EDEBEE", paddingTop: 9 }}>⇄ Flip swaps sides · seams snap to thirds, finger-only. Thumbnails follow your handedness.</div>
            </Popover>
          )}
        </div>
        <IconButton title="Flip — swap sides" onClick={doFlip}><FlipIcon /></IconButton>
      </div>

      {/* the desk */}
      <div ref={deskRef} style={{ position: "absolute", top: 54, left: 12, right: 12, bottom: 12, display: "flex", flexDirection: portrait ? "column" : writingLeft ? "row" : "row-reverse", userSelect: dragging ? "none" : "auto" }}>
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
