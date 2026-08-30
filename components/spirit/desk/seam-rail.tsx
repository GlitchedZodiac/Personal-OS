"use client";

// The seam — V2's toolbar. Ported from `Pitaya iPad 01 - Sermon Desk.dc.html`
// (Claude Design, 2026-08-28): "the rail dissolved into the seam." The 14pt
// gutter between the panes and the 54pt tool rail merge into one 40pt strip
// that is BOTH the toolbar and the resize handle: tools at the top where the
// free hand reaches, the finger-drag grip at the bottom, 28pt of width
// returned to the page.
//
// Tap a tool to select it; tap the tool that is ALREADY selected and its
// sheet opens, anchored to the seam, over the paper and never over scripture.
// The sheet only shows what the tool has: the brush gets nibs, colour, width
// and opacity; the highlighter drops the nibs; the eraser is width alone; the
// hand has no sheet at all. The colour dot is its own target — one tap cycles
// the four inks.
//
// Dragging the seam resizes the panes exactly as the old 14pt seam did:
// finger only, snaps at ⅓ · ½ · ⅔ on release. Only the seam's own background
// (and its decorative dots) start a drag — every control is a child element,
// so the `e.target === e.currentTarget` guard keeps taps and drags apart.

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useDesk, HL_CATEGORIES, hlColor, type PenTool } from "./desk-state";
import { PalettePopover } from "./pen-popovers";
import { PenIcon, GPenIcon, PencilIcon, HighlighterIcon, EraserIcon, HandIcon } from "./desk-icons";
import type { InkTool } from "@/lib/ink";
import { haptic } from "@/lib/haptics";

/** the four inks of the design's colour cycle — already the desk's own palette */
const INKS = ["#5F4B8B", "#B85C8A", "#5E7FA6", "#232227"];
/** the width presets, each a 32pt target showing its own nib at true size */
const PRESETS = [0.5, 0.7, 0.9, 1.2];
const WRITING: InkTool[] = ["fountain", "gpen", "pencil", "marker"];

/**
 * The pen case — his 2026-08-29 call: "only 3 pens really — ballpoint,
 * brush/G-pen, sketch pencil" (highlighter and eraser are tools, not pens).
 * The design's nib row said PEN · MARKER · BRUSH; it predates that message,
 * so the case carries HIS three. The marker brush remains reachable for old
 * pages but is no longer a nib. Deviation surfaced in docs/state.md.
 */
const NIBS: { brush: InkTool; label: string; note: string }[] = [
  { brush: "gpen", label: "BALLPOINT", note: "Ballpoint — one width the whole stroke, pressure ignored. For lettering that has to stay legible small." },
  { brush: "pencil", label: "PENCIL", note: "Sketch pencil — grain and shading follow pressure, never fully opaque." },
  { brush: "fountain", label: "BRUSH", note: "Brush — width follows pressure and tilt. Every stroke tapers at both ends." },
];

function NibStroke({ brush, color }: { brush: InkTool; color: string }) {
  if (brush === "gpen") return <svg width="46" height="6" viewBox="0 0 46 6"><path d="M2 3h42" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>;
  if (brush === "pencil") return <svg width="46" height="9" viewBox="0 0 46 9"><path d="M2 5.5C10 4 16 6.5 24 4.5S38 5.5 44 4" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeDasharray="2.5 1.6" opacity="0.85" /></svg>;
  return <svg width="46" height="9" viewBox="0 0 46 9"><path d="M2 6.5C9 6.5 12 2 20 2s14 5 24 2.2" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" /><path d="M2 6.5C9 6.5 12 2 20 2s14 5 24 2.2" stroke={color} strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.5" transform="translate(0,1)" /></svg>;
}

/** one 16pt-track slider the pen drives — pointer capture, no steps */
function SheetSlider({ label, value, display, onChange }: { label: string; value: number; display: string; onChange: (f: number) => void }) {
  const track = useRef<HTMLDivElement | null>(null);
  const drive = (e: ReactPointerEvent) => {
    const el = track.current;
    if (!el) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const apply = (clientX: number) => {
      const r = el.getBoundingClientRect();
      onChange(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
    };
    apply(e.clientX);
    const mv = (ev: globalThis.PointerEvent) => apply(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const pct = `${Math.round(value * 100)}%`;
  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#96949B" }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#8C2F51", fontVariantNumeric: "tabular-nums" }}>{display}</span>
      </div>
      <div ref={track} onPointerDown={drive} style={{ height: 16, borderRadius: 99, background: "#EDEBEE", position: "relative", marginTop: 6, touchAction: "none", cursor: "pointer" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct, borderRadius: 99, background: "#E9CFDC", transition: "width .24s cubic-bezier(.3,.9,.3,1)" }} />
        <span style={{ position: "absolute", top: "50%", left: pct, transform: "translate(-50%,-50%)", width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 2px 9px rgba(35,34,39,0.24), inset 0 0 0 1.5px #D9D7DC", transition: "left .24s cubic-bezier(.3,.9,.3,1)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

export function SeamRail({ onSeamDown, dragging, writingLeft }: {
  /** the desk shell's finger-only, snap-on-release resize — unchanged from the 14pt seam */
  onSeamDown: (e: ReactPointerEvent) => void;
  dragging: boolean;
  writingLeft: boolean;
}) {
  const { pen, setPen, popover, setPopover } = useDesk();
  const [sheet, setSheet] = useState(false);

  const activeSlot: 0 | 1 | 2 | 3 | null =
    WRITING.includes(pen.tool as InkTool) ? 0
    : pen.tool === "highlighter" ? 1
    : pen.tool === "eraser" ? 2
    : pen.tool === "hand" ? 3
    : null; // text / lasso — no seam slot lights up
  const brushIcon = pen.brush === "gpen" ? GPenIcon : pen.brush === "pencil" ? PencilIcon : PenIcon;

  const slotTap = (slot: 0 | 1 | 2 | 3) => {
    const tool: PenTool = slot === 0 ? (WRITING.includes(pen.brush) ? pen.brush : "gpen") : slot === 1 ? "highlighter" : slot === 2 ? "eraser" : "hand";
    if (activeSlot === slot) {
      // tap the tool that is already up → its sheet (the hand has none)
      if (slot !== 3) setSheet((s) => !s);
    } else {
      setPen({ tool });
      setSheet(false);
      haptic("selection");
    }
  };

  const cycleInk = () => {
    const i = INKS.indexOf(pen.color);
    setPen({ color: INKS[(i + 1) % INKS.length] });
    haptic("light");
  };

  const slotStyle = (on: boolean): CSSProperties => ({
    width: 32, height: 32, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", background: on ? "#F6E3EB" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", border: 0, padding: 0,
  });
  const inkColor = (on: boolean) => (on ? "#8C2F51" : "#66646C");

  const showNibs = activeSlot === 0;
  const showCols = activeSlot === 0;
  const showHlCats = activeSlot === 1;
  const showOpac = activeSlot !== 2;
  const sheetTitle = activeSlot === 0 ? "BRUSH" : activeSlot === 1 ? "HIGHLIGHTER" : "ERASER";
  const nibNote = NIBS.find((n) => n.brush === pen.brush)?.note ?? NIBS[0].note;
  // width slider: fine control across 0.5–1.6, the presets riding the same scale
  const wToF = (w: number) => (w - 0.5) / 1.1;
  const fToW = (f: number) => Math.round((0.5 + f * 1.1) * 100) / 100;
  const opToF = (o: number) => (o - 0.15) / 0.85;
  const fToOp = (f: number) => Math.round((0.15 + f * 0.85) * 100) / 100;

  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSeamDown(e); }}
      style={{ width: 40, flex: "none", margin: "0 4px", borderRadius: 13, background: "#FCFBFC", boxShadow: "inset 0 0 0 1px #EDEBEE", display: "flex", flexDirection: "column", alignItems: "center", padding: "5px 0 7px", cursor: "col-resize", touchAction: "none", position: "relative", zIndex: 5 }}
    >
      <button type="button" onClick={() => slotTap(0)} title="Brush — tap to select, tap again for settings" style={slotStyle(activeSlot === 0)}>
        {brushIcon({ size: 17, color: inkColor(activeSlot === 0) })}
      </button>
      <button type="button" onClick={() => slotTap(1)} title="Highlighter" style={{ ...slotStyle(activeSlot === 1), marginTop: 3 }}>
        <HighlighterIcon size={17} color={inkColor(activeSlot === 1)} />
      </button>
      <button type="button" onClick={() => slotTap(2)} title="Eraser — cuts a stroke, never deletes it whole" style={{ ...slotStyle(activeSlot === 2), marginTop: 3 }}>
        <EraserIcon size={17} color={inkColor(activeSlot === 2)} />
      </button>
      <button type="button" onClick={() => slotTap(3)} title="Hand — pan the page, drag a verse" style={{ ...slotStyle(activeSlot === 3), marginTop: 3 }}>
        <HandIcon size={17} color={inkColor(activeSlot === 3)} />
      </button>

      <span style={{ width: 20, height: 1, background: "#E4E2E6", margin: "6px 0 5px", pointerEvents: "none" }} />

      <button type="button" onClick={cycleInk} title="Tap to cycle the four inks" style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", background: pen.tool === "highlighter" ? hlColor(pen.hlCategory) : pen.color, boxShadow: "inset 0 0 0 2.5px #FFFFFF, 0 0 0 1.5px #D9D7DC", cursor: "pointer", border: 0, padding: 0 }} />

      <span style={{ flex: 1, pointerEvents: "none" }} />

      <span style={{ width: 20, height: 1, background: "#E4E2E6", margin: "5px 0 4px", pointerEvents: "none" }} />

      {PRESETS.map((w, i) => {
        const on = Math.abs((pen.widthMul ?? 0.7) - w) < 0.01;
        return (
          <button key={w} type="button" onClick={() => { setPen({ widthMul: w }); haptic("light"); }} title={`${w.toFixed(1)} pt`} style={{ width: 32, height: 29, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: on ? "#F6E3EB" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", border: 0, padding: 0 }}>
            <span style={{ width: 5 + i * 3.4, height: 5 + i * 3.4, borderRadius: "50%", background: on ? (pen.tool === "highlighter" ? hlColor(pen.hlCategory) : pen.color) : "#B4B2B8", transition: "width .2s ease, height .2s ease" }} />
          </button>
        );
      })}

      <span style={{ flex: "none", height: 9, pointerEvents: "none" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "none", pointerEvents: "none" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: dragging ? "#A63D63" : "#C9C7CD" }} />)}
      </div>

      {dragging && <span style={{ position: "absolute", bottom: 34, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 9, fontWeight: 600, color: "#FFFFFF", background: "rgba(35,34,39,0.86)", borderRadius: 99, padding: "3px 9px", zIndex: 9, pointerEvents: "none" }}>snaps at ⅓ · ½ · ⅔ — finger only</span>}

      {sheet && activeSlot !== null && activeSlot !== 3 && (
        <div style={{ position: "absolute", top: 2, [writingLeft ? "right" : "left"]: 46, width: 230, zIndex: 10, background: "#FFFFFF", borderRadius: 14, boxShadow: "0 16px 46px rgba(20,15,18,0.3)", padding: 12, animation: "deskFadeIn .18s ease both", cursor: "default" }} onPointerDown={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.13em", fontWeight: 700, color: "#96949B" }}>{sheetTitle}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setSheet(false)} style={{ fontSize: 11, color: "#96949B", cursor: "pointer", padding: "2px 6px", background: "none", border: 0 }}>✕</button>
          </div>

          {showNibs && (
            <>
              <div style={{ display: "flex", gap: 5, marginTop: 9 }}>
                {NIBS.map((n) => {
                  const on = pen.brush === n.brush;
                  return (
                    <button key={n.brush} type="button" onClick={() => { setPen({ tool: n.brush, brush: n.brush }); haptic("selection"); }} style={{ flex: 1, borderRadius: 9, background: on ? "#F6E3EB" : "#FAF9FA", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", padding: "7px 0 5px", cursor: "pointer", border: 0 }}>
                      <div style={{ height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}><NibStroke brush={n.brush} color={on ? "#8C2F51" : "#96949B"} /></div>
                      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", color: on ? "#8C2F51" : "#96949B", textAlign: "center" }}>{n.label}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 9.5, color: "#96949B", lineHeight: 1.45, marginTop: 6 }}>{nibNote}</div>
            </>
          )}

          {showCols && (
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              {INKS.map((c) => (
                <button key={c} type="button" onClick={() => setPen({ color: c })} style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer", border: 0, padding: 0, boxShadow: pen.color === c ? "inset 0 0 0 2.5px #FFFFFF, 0 0 0 2px #A63D63" : "0 0 0 1px #E4E2E6" }} />
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setPopover(popover === "palette" ? null : "palette")} title="The full palette" style={{ width: 30, height: 30, borderRadius: "50%", background: "#FAF9FA", boxShadow: "inset 0 0 0 1.5px #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#96949B", cursor: "pointer", border: 0, padding: 0 }}>+</button>
            </div>
          )}

          {showHlCats && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {HL_CATEGORIES.map((c) => (
                <button key={c.name} type="button" onClick={() => { setPen({ hlCategory: c.name }); haptic("selection"); }} title={c.name} style={{ width: 28, height: 28, borderRadius: "50%", background: c.color, cursor: "pointer", border: 0, padding: 0, boxShadow: pen.hlCategory === c.name ? "inset 0 0 0 2.5px #FFFFFF, 0 0 0 2px #A63D63" : "0 0 0 1px #E4E2E6" }} />
              ))}
            </div>
          )}

          <SheetSlider label="WIDTH" value={wToF(Math.max(0.5, Math.min(1.6, pen.widthMul ?? 0.7)))} display={`${(pen.widthMul ?? 0.7).toFixed(1)} pt`} onChange={(f) => setPen({ widthMul: fToW(f) })} />
          <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
            {PRESETS.map((w) => {
              const on = Math.abs((pen.widthMul ?? 0.7) - w) < 0.01;
              return (
                <button key={w} type="button" onClick={() => setPen({ widthMul: w })} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums", borderRadius: 8, padding: "6px 0", cursor: "pointer", border: 0, color: on ? "#8C2F51" : "#96949B", background: on ? "#F6E3EB" : "#FAF9FA", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none" }}>{w.toFixed(1)}</button>
              );
            })}
          </div>

          {showOpac && (
            <SheetSlider label="OPACITY" value={opToF(Math.max(0.15, Math.min(1, pen.opacity)))} display={`${Math.round(pen.opacity * 100)}%`} onChange={(f) => setPen({ opacity: fToOp(f) })} />
          )}

          {activeSlot === 2 && (
            <div style={{ fontSize: 9.5, color: "#96949B", lineHeight: 1.5, borderTop: "1px solid #EDEBEE", marginTop: 11, paddingTop: 8 }}>Width alone — the eraser has no colour and no opacity. It cuts the stroke it crosses and leaves the rest of it alive.</div>
          )}
        </div>
      )}

      {popover === "palette" && <PalettePopover style={{ [writingLeft ? "right" : "left"]: 46, top: 40 }} onClose={() => setPopover(null)} />}
    </div>
  );
}
