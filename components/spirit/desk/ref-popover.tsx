"use client";

// The reference popover (7b): the verse, in one tap. It opens FULL — the
// original peek→full two-stage design carried the literal caption "tap again
// for the verse", which is precisely the multi-clicking he reported from his
// Bible study ("I should just click once and it'll pop up the verse"). The
// peek stage is gone; `full` is kept on the state shape for callers but no
// longer gates anything.

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

export function RefPopover({ state, onClose, onOpenReference, onRemove }: { state: RefPopoverState; onClose: () => void; onOpenReference: (q: string, label: string) => void; /** shown for reference cards: take the card off the page (undoable by the caller) */ onRemove?: () => void }) {
  const [loaded, setLoaded] = useState<{ q: string; text: string } | null>(null);
  const text = loaded && loaded.q === state.q ? loaded.text : "…";
  const setText = useCallback((t: string) => setLoaded({ q: state.q, text: t }), [state.q]);
  useEffect(() => {
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
  }, [state.q, setText]);
  const left = Math.min(Math.max(8, state.x - 120), (typeof window !== "undefined" ? window.innerWidth : 1180) - 340);
  const top = Math.min(state.y + 14, (typeof window !== "undefined" ? window.innerHeight : 820) - 220);
  return (
    <>
      <div onClick={onClose} onPointerDown={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: "fixed", left, top, zIndex: 61, width: 330, background: "#FAF9FA", border: "1px solid #E4E2E6", borderRadius: 13, padding: "12px 14px", boxShadow: "0 10px 30px rgba(20,15,18,0.12)", animation: "fadeUp .2s ease both" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#A63D63" }}>{state.kind}</span>
          <span style={{ fontSize: 9, color: "#A9A7AE" }}>{state.meta ?? ""}</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#232227", marginTop: 4 }}>{state.label}</div>
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: "#454349", lineHeight: 1.65, marginTop: 6 }}>{text ? `“${text}”` : "…"}</div>
        <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReference(state.q, state.label);
              onClose();
            }}
            style={{ fontFamily: DISPLAY, fontSize: 10.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "6px 13px", cursor: "pointer", border: 0 }}
          >
            Open in the Bible →
          </button>
          <a href={logosUrl(state.refStart, state.label)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontFamily: DISPLAY, fontSize: 10.5, fontWeight: 600, color: "#66646C", border: "1px solid #E4E2E6", borderRadius: 99, padding: "6px 11px", background: "#FFFFFF", textDecoration: "none" }}>
            Logos ›
          </a>
          <span style={{ flex: 1 }} />
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
                onClose();
              }}
              style={{ fontFamily: DISPLAY, fontSize: 10.5, fontWeight: 600, color: "#B4533F", background: "#FFFFFF", border: "1px solid #EAD9D3", borderRadius: 99, padding: "6px 12px", cursor: "pointer" }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
