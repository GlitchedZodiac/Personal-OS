"use client";

// Lasso → the menu (8b): Move / resize · Convert to text · Make this a note
// · Copy as image — plus the anchor hint for "make this a note".

import { DarkPill, PillItem } from "./ui";

export function LassoMenu({
  x,
  y,
  count,
  anchorLabel,
  onMove,
  onConvert,
  onNote,
  onCopy,
  onDelete,
  busy,
}: {
  x: number;
  y: number;
  count: number;
  anchorLabel?: string | null;
  onMove: () => void;
  onConvert: () => void;
  onNote: () => void;
  onCopy: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const left = Math.max(8, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1180) - 420));
  const top = Math.max(8, y - 56);
  return (
    <div style={{ position: "fixed", left, top, zIndex: 56, animation: "fadeUp .2s ease both" }}>
      <DarkPill>
        <PillItem onClick={onMove}>Move / resize</PillItem>
        <PillItem onClick={onConvert}>{busy ? "Reading…" : "Convert to text"}</PillItem>
        <PillItem onClick={onNote}>Make this a note</PillItem>
        <PillItem onClick={onCopy}>Copy as image</PillItem>
        <PillItem onClick={onDelete} muted title="delete the ink">✕</PillItem>
      </DarkPill>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, background: "#FFFFFF", border: "1px solid #EDEBEE", borderRadius: 10, padding: "7px 11px", maxWidth: 380, boxShadow: "0 6px 18px rgba(35,34,39,0.08)" }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: "#96949B", flex: "none" }}>MAKE THIS A NOTE →</span>
        <span style={{ fontSize: 10.5, color: "#66646C" }}>
          {count} stroke{count === 1 ? "" : "s"} · anchor: <span style={{ fontWeight: 700, color: "#8C2F51" }}>{anchorLabel ?? "this page's passage"}</span>
        </span>
      </div>
    </div>
  );
}
