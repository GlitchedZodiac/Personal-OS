"use client";

// The Bible pane's action bar in its two options (7a): A — pen-positioned,
// icons only, rises beside the tip on the free-hand side; B — fixed in the
// pane header, labelled. Same contents: Highlight (six) · Note · Send ·
// Link · Memorize · Ask · ⋯. He picks one after living with both.

import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { DarkPill, PillItem } from "./ui";
import { HL_CATEGORIES } from "./desk-state";

/** the dark action pill's rendered height (measured: 41px) — used to keep it on screen */
const BAR_H = 41;

/** the grip: press and drag the selected verses onto a notebook */
function DragGrip({ onDragStart }: { onDragStart?: (e: ReactPointerEvent) => void }) {
  if (!onDragStart) return null;
  return (
    <button
      type="button"
      title="Drag this onto a notebook"
      onPointerDown={onDragStart}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.10)", border: 0, cursor: "grab", color: "#F2F1F2", touchAction: "none", marginRight: 2 }}
    >
      <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor" aria-hidden>
        <circle cx="3" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" />
        <circle cx="3" cy="6.5" r="1.3" /><circle cx="8" cy="6.5" r="1.3" />
        <circle cx="3" cy="11" r="1.3" /><circle cx="8" cy="11" r="1.3" />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600 }}>Drag</span>
    </button>
  );
}

export type BarAction = "hl" | "note" | "send" | "link" | "mem" | "ask" | "more";

export function ActionBarA({
  x,
  y,
  hand,
  onAction,
  onHighlight,
  showChips,
  marked,
  onUnmark,
  onDragStart,
}: {
  x: number;
  y: number;
  hand: "left" | "right";
  onAction: (a: BarAction) => void;
  onHighlight: (category: string) => void;
  showChips: boolean;
  /** categories already on this selection — the chips read ON and a ⌫ appears */
  marked?: string[];
  onUnmark?: () => void;
  /** press-and-drag the selection onto a notebook */
  onDragStart?: (e: ReactPointerEvent) => void;
}) {
  // rises beside the tip on the free-hand side so the palm never covers it
  const vw = typeof window !== "undefined" ? window.innerWidth : 1180;
  const vh = typeof window !== "undefined" ? window.innerHeight : 820;
  const left = Math.max(8, Math.min(hand === "left" ? x + 16 : x - 290, vw - 380));
  // Clamp the TOP as well as the left. It only had a lower bound, so a selection anchored below
  // the fold — extending a selection down the chapter, or a verse restored from a saved place —
  // put the bar off the bottom of the screen entirely. Measured at 1194px in an 1180px-tall
  // portrait viewport on 2026-08-30, which is exactly what "I can't see it" looks like.
  const top = Math.max(8, Math.min(y - 52, vh - BAR_H - 8));
  /**
   * PORTALLED TO <body>, and that is the whole point. `position: fixed` resolves against the
   * nearest ancestor carrying a transform, and the desk's own entrance animation
   * (`.desk-page-in`) sets one — so the bar was positioned relative to the desk rather than the
   * viewport, and a clamp computed against the screen put it off the bottom anyway. Measured on
   * 2026-08-30: style top 1131px rendering at y 1184 in an 1180px-tall viewport. Popover was
   * portalled for exactly this reason; this never was.
   */
  const bar = (
    <div style={{ position: "fixed", left, top, zIndex: 55, animation: "deskPopIn .26s cubic-bezier(.2,.9,.3,1.2) both" }}>
      <DarkPill>
        <DragGrip onDragStart={onDragStart} />
        <PillItem title="Highlight — six categories" onClick={() => onAction("hl")}>
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#D9A23E" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4C7DBF" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#7B5EA7" }} />
          </span>
        </PillItem>
        <PillItem title="Note" onClick={() => onAction("note")}><span style={{ fontSize: 11 }}>✎</span></PillItem>
        <PillItem title="Send to notes" onClick={() => onAction("send")}><span style={{ fontSize: 11 }}>→</span></PillItem>
        <PillItem title="Link" onClick={() => onAction("link")}><span style={{ fontSize: 11 }}>⇄</span></PillItem>
        <PillItem title="Memorize" onClick={() => onAction("mem")}><span style={{ fontSize: 11 }}>◇</span></PillItem>
        <PillItem title="Ask" onClick={() => onAction("ask")}><span style={{ fontSize: 11 }}>?</span></PillItem>
        <PillItem title="copy with attribution · open in Logos" onClick={() => onAction("more")} muted><span style={{ fontSize: 11 }}>⋯</span></PillItem>
      </DarkPill>
      {showChips && (
        <div style={{ marginTop: 7, display: "flex", gap: 5, background: "#232227", borderRadius: 14, padding: 8 }}>
          {HL_CATEGORIES.map((c) => {
            const on = marked?.includes(c.name);
            return (
              <button key={c.name} type="button" onClick={() => onHighlight(c.name)} title={on ? `${c.name} — tap to take it off` : c.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: on ? "rgba(255,255,255,0.14)" : "transparent", border: 0, cursor: "pointer", padding: "5px 9px", borderRadius: 9 }}>
                <span style={{ width: 15, height: 15, borderRadius: "50%", background: c.color, boxShadow: on ? "0 0 0 2px #FFFFFF" : "none" }} />
                <span style={{ fontSize: 8, fontWeight: 600, color: "#F2F1F2" }}>{on ? "on" : c.short}</span>
              </button>
            );
          })}
          {marked && marked.length > 0 && (
            <button type="button" onClick={() => onUnmark?.()} title="Remove the highlight from this verse" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: 0, cursor: "pointer", padding: "5px 11px", borderRadius: 9, borderLeft: "1px solid #3A3239" }}>
              <span style={{ fontSize: 12, color: "#F2F1F2", lineHeight: "12px" }}>⌫</span>
              <span style={{ fontSize: 8, fontWeight: 600, color: "#DCA8BE" }}>unmark</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(bar, document.body) : bar;
}

export function ActionBarB({ onAction, onHighlight, showChips, marked, onUnmark, onDragStart }: { onAction: (a: BarAction) => void; onHighlight: (category: string) => void; showChips: boolean; marked?: string[]; onUnmark?: () => void; onDragStart?: (e: ReactPointerEvent) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#232227", borderRadius: 13, padding: "6px 9px", animation: "fadeUp .2s ease both" }}>
        <DragGrip onDragStart={onDragStart} />
        <PillItem title="Highlight" onClick={() => onAction("hl")} style={{ padding: "5px 8px" }}>
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4C7DBF" }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7B5EA7" }} />
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 600 }}>Highlight</span>
        </PillItem>
        <PillItem onClick={() => onAction("note")} style={{ padding: "5px 8px", fontSize: 9.5 }}>✎ Note</PillItem>
        <PillItem onClick={() => onAction("send")} style={{ padding: "5px 8px", fontSize: 9.5 }}>→ Send</PillItem>
        <PillItem onClick={() => onAction("link")} style={{ padding: "5px 8px", fontSize: 9.5 }}>⇄ Link</PillItem>
        <PillItem onClick={() => onAction("mem")} style={{ padding: "5px 8px", fontSize: 9.5 }}>Memorize</PillItem>
        <PillItem onClick={() => onAction("ask")} style={{ padding: "5px 8px", fontSize: 9.5 }}>? Ask</PillItem>
        <PillItem onClick={() => onAction("more")} muted style={{ padding: "5px 7px", fontSize: 9.5, fontWeight: 700 }}>⋯</PillItem>
      </div>
      {showChips && (
        <div style={{ position: "absolute", right: 0, top: 34, display: "flex", gap: 4, background: "#232227", borderRadius: 12, padding: 6, zIndex: 50 }}>
          {HL_CATEGORIES.map((c) => {
            const on = marked?.includes(c.name);
            return (
              <button key={c.name} type="button" onClick={() => onHighlight(c.name)} title={on ? `${c.name} — tap to take it off` : c.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: on ? "rgba(255,255,255,0.14)" : "transparent", border: 0, cursor: "pointer", padding: "5px 9px", borderRadius: 9 }}>
                <span style={{ width: 15, height: 15, borderRadius: "50%", background: c.color, boxShadow: on ? "0 0 0 2px #FFFFFF" : "none" }} />
                <span style={{ fontSize: 8, fontWeight: 600, color: "#F2F1F2", whiteSpace: "nowrap" }}>{on ? "on" : c.short}</span>
              </button>
            );
          })}
          {marked && marked.length > 0 && (
            <button type="button" onClick={() => onUnmark?.()} title="Remove the highlight from this verse" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: 0, cursor: "pointer", padding: "5px 11px", borderRadius: 9, borderLeft: "1px solid #3A3239" }}>
              <span style={{ fontSize: 12, color: "#F2F1F2", lineHeight: "12px" }}>⌫</span>
              <span style={{ fontSize: 8, fontWeight: 600, color: "#DCA8BE", whiteSpace: "nowrap" }}>unmark</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
