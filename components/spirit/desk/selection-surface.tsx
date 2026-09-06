"use client";

// V3 §2 — the selection surface. Opens INLINE between verses (the reader hosts
// it in a gap under the first-tapped verse, which locks and never relocates);
// this component is only the card. Two permanent rows, no overflow menu, every
// target ≥40pt. Highlight ⌄ expands the six named categories inline — one tap
// applies to the whole selection. The bare ✕ clears; verse taps outside this
// card grow/shrink the selection (the reader owns that).

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { HL_CATEGORIES } from "./desk-state";
import { DISPLAY } from "./ui";
import { formatRef } from "@/lib/bible-refs";

const BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 40,
  padding: "0 13px",
  borderRadius: 11,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: DISPLAY,
  color: "#454349",
  background: "#FFFFFF",
  border: "1px solid #E4E2E6",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export function SelectionSurface({
  sel,
  narrow,
  marked,
  onUnmark,
  onHighlight,
  onDragStart,
  onComment,
  onSend,
  onLink,
  onMem,
  onAsk,
  onLogos,
  onClear,
}: {
  sel: { start: number; end: number };
  narrow?: boolean;
  /** categories already on the selection */
  marked: string[];
  onUnmark: () => void;
  onHighlight: (category: string) => void;
  onDragStart: (e: ReactPointerEvent) => void;
  /** absent until the comments round wires it */
  onComment?: () => void;
  onSend: () => void;
  onLink: () => void;
  onMem: () => void;
  onAsk: () => void;
  onLogos: () => void;
  onClear: () => void;
}) {
  const [hlOpen, setHlOpen] = useState(false);
  const label = formatRef(sel.start, sel.end);
  return (
    <div
      data-selection-surface
      style={{
        margin: "8px 4px 10px",
        background: "#FAF9FA",
        border: "1px solid #EDEBEE",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(20,15,18,0.10)",
        padding: "9px 10px",
      }}
      // a tap on the card itself must never fall through to the verse behind it
      onClick={(e) => e.stopPropagation()}
    >
      {/* row 1 — the big four */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <button
          type="button"
          title={`Drag ${label} onto a notebook`}
          onPointerDown={onDragStart}
          style={{ ...BTN, cursor: "grab", touchAction: "none", padding: "0 10px" }}
        >
          <svg width="11" height="13" viewBox="0 0 11 13" fill="#96949B" aria-hidden>
            <circle cx="3" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" />
            <circle cx="3" cy="6.5" r="1.3" /><circle cx="8" cy="6.5" r="1.3" />
            <circle cx="3" cy="11" r="1.3" /><circle cx="8" cy="11" r="1.3" />
          </svg>
          {!narrow && "Drag"}
        </button>
        {onComment && (
          <button type="button" onClick={onComment} style={{ ...BTN, background: "#A63D63", border: "1px solid #A63D63", color: "#FFFFFF" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.9-5.6a8 8 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z" />
            </svg>
            Comment
          </button>
        )}
        <button type="button" onClick={() => setHlOpen((v) => !v)} style={{ ...BTN, background: hlOpen ? "#F6E3EB" : "#FFFFFF", borderColor: hlOpen ? "#A63D63" : "#E4E2E6" }}>
          <span style={{ display: "flex", gap: 2 }}>
            {HL_CATEGORIES.slice(0, 3).map((c) => (
              <span key={c.name} style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />
            ))}
          </span>
          Highlight
          <span style={{ fontSize: 8, color: "#96949B" }}>{hlOpen ? "⌃" : "⌄"}</span>
        </button>
        <button type="button" onClick={onSend} style={BTN}>Send to page</button>
      </div>
      {/* the six categories, NAMED, inline — the field-test critique was six unlabeled dots */}
      {hlOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid #EDEBEE" }}>
          {HL_CATEGORIES.map((c) => {
            const on = marked.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => { setHlOpen(false); onHighlight(c.name); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 12px", borderRadius: 11, fontSize: 11.5, fontWeight: 600, fontFamily: DISPLAY, cursor: "pointer", background: on ? `${c.color}22` : "#FFFFFF", border: `1px solid ${on ? c.color : "#E4E2E6"}`, color: "#454349" }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color }} />
                {c.short}
                {on && <span style={{ fontSize: 9, color: c.color }}>✓</span>}
              </button>
            );
          })}
          {marked.length > 0 && (
            <button type="button" onClick={() => { setHlOpen(false); onUnmark(); }} style={{ ...BTN, height: 40, color: "#B4533F" }}>Unmark</button>
          )}
        </div>
      )}
      {/* row 2 — the rest, and the way out */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" onClick={onLink} style={BTN}>Link to a note</button>
        <button type="button" onClick={onMem} style={BTN}>Memorize</button>
        <button type="button" onClick={onAsk} style={BTN}>Ask about this</button>
        <button type="button" onClick={onLogos} style={BTN}>Open in Logos</button>
        <span style={{ flex: 1, minWidth: 8 }} />
        {!narrow && <span style={{ fontSize: 9.5, color: "#A9A7AE" }}>tap verses to grow or shrink the selection</span>}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selection"
          title="Clear the selection"
          style={{ width: 32, height: 32, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 99, border: "1px solid #E4E2E6", background: "#FFFFFF", color: "#96949B", fontSize: 13, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
