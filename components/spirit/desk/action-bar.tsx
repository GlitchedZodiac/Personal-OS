"use client";

// The Bible pane's action bar in its two options (7a): A — pen-positioned,
// icons only, rises beside the tip on the free-hand side; B — fixed in the
// pane header, labelled. Same contents: Highlight (six) · Note · Send ·
// Link · Memorize · Ask · ⋯. He picks one after living with both.

import { DarkPill, PillItem } from "./ui";
import { HL_CATEGORIES } from "./desk-state";

export type BarAction = "hl" | "note" | "send" | "link" | "mem" | "ask" | "more";

export function ActionBarA({
  x,
  y,
  hand,
  onAction,
  onHighlight,
  showChips,
}: {
  x: number;
  y: number;
  hand: "left" | "right";
  onAction: (a: BarAction) => void;
  onHighlight: (category: string) => void;
  showChips: boolean;
}) {
  // rises beside the tip on the free-hand side so the palm never covers it
  const left = hand === "left" ? x + 16 : x - 290;
  const top = Math.max(8, y - 52);
  return (
    <div style={{ position: "fixed", left: Math.max(8, Math.min(left, (typeof window !== "undefined" ? window.innerWidth : 1180) - 300)), top, zIndex: 55, animation: "fadeUp .2s ease both" }}>
      <DarkPill>
        <PillItem title="Highlight — six categories" onClick={() => onAction("hl")}>
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D9A23E" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4C7DBF" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7B5EA7" }} />
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
        <div style={{ marginTop: 6, display: "flex", gap: 4, background: "#232227", borderRadius: 12, padding: 6 }}>
          {HL_CATEGORIES.map((c) => (
            <button key={c.name} type="button" onClick={() => onHighlight(c.name)} title={c.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: 0, cursor: "pointer", padding: "3px 6px", borderRadius: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.color }} />
              <span style={{ fontSize: 8, fontWeight: 600, color: "#F2F1F2" }}>{c.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionBarB({ onAction, onHighlight, showChips }: { onAction: (a: BarAction) => void; onHighlight: (category: string) => void; showChips: boolean }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#232227", borderRadius: 11, padding: "4px 6px", animation: "fadeUp .2s ease both" }}>
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
          {HL_CATEGORIES.map((c) => (
            <button key={c.name} type="button" onClick={() => onHighlight(c.name)} title={c.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: 0, cursor: "pointer", padding: "3px 6px", borderRadius: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.color }} />
              <span style={{ fontSize: 8, fontWeight: 600, color: "#F2F1F2", whiteSpace: "nowrap" }}>{c.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
