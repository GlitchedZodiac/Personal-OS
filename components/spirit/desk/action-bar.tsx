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
  marked,
  onUnmark,
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
}) {
  // rises beside the tip on the free-hand side so the palm never covers it
  const left = hand === "left" ? x + 16 : x - 290;
  const top = Math.max(8, y - 52);
  return (
    <div style={{ position: "fixed", left: Math.max(8, Math.min(left, (typeof window !== "undefined" ? window.innerWidth : 1180) - 300)), top, zIndex: 55, animation: "deskPopIn .26s cubic-bezier(.2,.9,.3,1.2) both" }}>
      <DarkPill>
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
}

export function ActionBarB({ onAction, onHighlight, showChips, marked, onUnmark }: { onAction: (a: BarAction) => void; onHighlight: (category: string) => void; showChips: boolean; marked?: string[]; onUnmark?: () => void }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#232227", borderRadius: 13, padding: "6px 9px", animation: "fadeUp .2s ease both" }}>
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
