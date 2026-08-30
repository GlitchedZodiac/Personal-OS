"use client";

// The reference card — a page object (01/03/08). Tap → the reference Bible
// jumps; the DROPPED chip shows the second it landed during a recording.

import { DISPLAY, SERIF } from "./ui";
import { OpenExternalIcon } from "./desk-icons";
import { fmtSeconds } from "@/lib/ink";

export interface RefCardData {
  refStart: number;
  refEnd: number;
  label: string;
  text: string;
  droppedAt?: number | null; // seconds into the recording
  fresh?: boolean;
}

export function RefCard({ data, width = 196, fresh, selected }: { data: RefCardData; width?: number; fresh?: boolean; selected?: boolean }) {
  return (
    <div
      style={{
        width,
        background: "#FFFFFF",
        border: fresh ? "none" : "1px solid #E4E2E6",
        borderRadius: 12,
        padding: "9px 11px",
        boxShadow: fresh
          ? "0 6px 18px rgba(166,61,99,0.18), inset 0 0 0 1.5px #A63D63"
          : selected
            ? "0 1px 6px rgba(35,34,39,0.05), inset 0 0 0 1.5px #A63D63"
            : "0 1px 6px rgba(35,34,39,0.05)",
        position: "relative",
        transform: fresh ? "rotate(-1.3deg)" : undefined,
        boxSizing: "border-box",
      }}
    >
      {fresh && typeof data.droppedAt === "number" && (
        <span style={{ position: "absolute", top: -9, right: 8, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "2.5px 8px" }}>
          DROPPED · {fmtSeconds(data.droppedAt)}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 700, color: "#8C2F51" }}>{data.label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 7, flex: "none" }}>
          <OpenExternalIcon />
          {/* Remove. Drawn, not hidden behind a gesture, because a wrong reference on a page is
              something he needs to be able to undo at a glance. The tap is caught by the ink
              canvas's hit-test (notebook-pane onTap) against this same corner, since page
              objects sit under the canvas and never receive DOM events themselves. */}
          {!fresh && <span data-ref-remove style={{ fontSize: 12, lineHeight: 1, color: "#C9C7CD", fontWeight: 600 }}>✕</span>}
        </span>
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 11, color: "#66646C", lineHeight: 1.5, marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
        “{data.text}”
      </div>
    </div>
  );
}

/** The ghost that follows the pen across the seam (01: "REF CARD, JUST DROPPED"). */
export function RefCardGhost({ label, text, x, y }: { label: string; text: string; x: number; y: number }) {
  return (
    <div style={{ position: "fixed", left: x + 10, top: y - 30, zIndex: 90, pointerEvents: "none", transform: "rotate(-1.3deg)", opacity: 0.96 }}>
      <RefCard data={{ refStart: 0, refEnd: 0, label, text }} width={174} fresh />
    </div>
  );
}
