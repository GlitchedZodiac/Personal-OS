"use client";

// The reference popover (7b): peek (the reference line) → full (the verse
// text + "Open in the reference Bible →" + Logos). One popover, three
// triggers — crossref letter, reference card, his own recognized ink.

import { useCallback, useEffect, useState } from "react";
import { BOOKS, refParts } from "@/lib/bible-refs";
import { DISPLAY, SERIF } from "./ui";

export interface RefPopoverState {
  label: string;
  q: string; // query for /api/spirit/passage
  refStart?: number;
  refEnd?: number;
  kind: "CROSS-REFERENCE · ESV" | "REFERENCE CARD" | "FROM HIS INK · RECOGNIZED" | "REFERENCE";
  meta?: string;
  x: number; // client coords anchor
  y: number;
  full?: boolean;
}

function logosUrl(refStart?: number, label?: string) {
  if (refStart) {
    const p = refParts(refStart);
    const book = (BOOKS[p.book - 1] ?? "").replace(/\s+/g, "");
    return `https://ref.ly/${book}${p.chapter}.${p.verse || 1}`;
  }
  return `https://ref.ly/${encodeURIComponent((label ?? "").replace(/\s+/g, ""))}`;
}

export function RefPopover({ state, onClose, onOpenReference, onPeekFull }: { state: RefPopoverState; onClose: () => void; onOpenReference: (q: string, label: string) => void; onPeekFull: () => void }) {
  const [loaded, setLoaded] = useState<{ q: string; text: string } | null>(null);
  const text = loaded && loaded.q === state.q ? loaded.text : "…";
  const setText = useCallback((t: string) => setLoaded({ q: state.q, text: t }), [state.q]);
  useEffect(() => {
    if (!state.full) return;
    let alive = true;
    fetch(`/api/spirit/passage?q=${encodeURIComponent(state.q)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const vs = (d?.verses ?? []) as { text: string; lines?: string[] }[];
        const take = vs.slice(0, 3).map((v) => (v.lines ? v.lines.join(" ") : v.text)).join(" ");
        setText(take || "Couldn't fetch the verse.");
      })
      .catch(() => alive && setText("Couldn't fetch the verse."));
    return () => {
      alive = false;
    };
  }, [state.full, state.q, setText]);
  const left = Math.min(Math.max(8, state.x - 120), (typeof window !== "undefined" ? window.innerWidth : 1180) - 340);
  const top = Math.min(state.y + 14, (typeof window !== "undefined" ? window.innerHeight : 820) - 220);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!state.full) onPeekFull();
        }}
        style={{ position: "fixed", left, top, zIndex: 61, width: 330, background: "#FAF9FA", border: "1px solid #E4E2E6", borderRadius: 13, padding: "12px 14px", boxShadow: "0 10px 30px rgba(20,15,18,0.12)", animation: "fadeUp .2s ease both", cursor: state.full ? "default" : "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#A63D63" }}>{state.kind}</span>
          <span style={{ fontSize: 9, color: "#A9A7AE" }}>{state.meta ?? ""}</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#232227", marginTop: 4 }}>{state.label}</div>
        {!state.full ? (
          <div style={{ fontSize: 10, color: "#96949B", marginTop: 3 }}>tap again for the verse</div>
        ) : (
          <>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: "#454349", lineHeight: 1.65, marginTop: 6 }}>{text ? `“${text}”` : "…"}</div>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReference(state.q, state.label);
                  onClose();
                }}
                style={{ fontFamily: DISPLAY, fontSize: 10.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "5px 13px", cursor: "pointer", border: 0 }}
              >
                Open in the reference Bible →
              </button>
              <a href={logosUrl(state.refStart, state.label)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontFamily: DISPLAY, fontSize: 10.5, fontWeight: 600, color: "#66646C", border: "1px solid #E4E2E6", borderRadius: 99, padding: "5px 11px", background: "#FFFFFF", textDecoration: "none" }}>
                Logos ›
              </a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
