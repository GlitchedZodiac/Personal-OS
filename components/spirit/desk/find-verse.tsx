"use client";

// FIND A VERSE — ported from `Pitaya iPad 01 - Sermon Desk.dc.html` (V2,
// 2026-08-28). "No typing — book, chapter, then drag the range." A pencil-first
// picker: tap a book, tap a chapter, then drag ACROSS the verse grid to take a
// range, and drop the card on the page. The peek line under the footer is the
// real opening of the selected verse, fetched from the passage the reader
// itself uses, so what you drop is what you saw.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BOOKS, BOOK_ABBREV, CHAPTERS, refInt } from "@/lib/bible-refs";

interface Verse { refInt: number; text?: string; lines?: string[] }

export function FindVersePopover({ initialBook, onClose, onDrop, style }: {
  /** 1-based book number to open on (the page's own passage when it has one) */
  initialBook?: number | null;
  onClose: () => void;
  onDrop: (refStart: number, refEnd: number, label: string, peek: string) => void;
  style?: CSSProperties;
}) {
  const [book, setBook] = useState<number>(() => Math.min(66, Math.max(1, initialBook ?? 43)));
  const [ch, setCh] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [v0, setV0] = useState(1);
  const [v1, setV1] = useState(1);
  const ranging = useRef(false);
  const bookList = useRef<HTMLDivElement | null>(null);

  // the chapter's verses — count for the grid, text for the peek
  useEffect(() => {
    let dead = false;
    setLoading(true);
    fetch(`/api/spirit/passage?q=${encodeURIComponent(`${BOOKS[book - 1]} ${ch}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead) return;
        const vs = ((d?.verses ?? []) as Verse[]);
        setVerses(vs);
        setV0((x) => Math.min(x, Math.max(1, vs.length)));
        setV1((x) => Math.min(x, Math.max(1, vs.length)));
      })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [book, ch]);

  // keep the chosen book in view when the list first paints
  useEffect(() => {
    const el = bookList.current?.querySelector<HTMLElement>(`[data-book="${book}"]`);
    el?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
  const count = verses.length || 1;
  const peekOf = (v?: Verse) => (v ? (v.lines ? v.lines.join(" ") : v.text ?? "") : "");
  const peek = peekOf(verses[lo - 1]);
  const label = `${BOOK_ABBREV[book - 1]} ${ch}${count > 0 ? `:${lo === hi ? lo : `${lo}–${hi}`}` : ""}`;

  const startRange = (e: ReactPointerEvent, n: number) => {
    e.preventDefault();
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* fine */ }
    setV0(n); setV1(n);
    ranging.current = true;
    const mv = (ev: globalThis.PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el?.closest?.("[data-v]");
      if (!cell) return;
      const k = parseInt(cell.getAttribute("data-v") ?? "", 10);
      if (k) setV1(k);
    };
    const up = () => { ranging.current = false; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const chaptersOf = useMemo(() => Array.from({ length: CHAPTERS[book - 1] ?? 1 }, (_, i) => i + 1), [book]);

  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 8 }} />
      <div style={{ position: "absolute", zIndex: 9, width: 436, maxWidth: "calc(100% - 24px)", background: "#FFFFFF", borderRadius: 15, boxShadow: "0 20px 56px rgba(20,15,18,0.32)", padding: 13, animation: "deskFadeIn .2s ease both", ...style }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 9, letterSpacing: "0.13em", fontWeight: 700, color: "#96949B" }}>FIND A VERSE</span>
          <span style={{ fontSize: 10, color: "#A9A7AE" }}>no typing — book, chapter, then drag the range</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ fontSize: 11, color: "#96949B", cursor: "pointer", padding: "2px 6px", background: "none", border: 0 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
          <div style={{ width: 118, flex: "none" }}>
            <div style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#B4B2B8", marginBottom: 5 }}>BOOK</div>
            <div ref={bookList} style={{ height: 196, overflowY: "auto", borderRadius: 10, background: "#FAF9FA", padding: 4, scrollbarWidth: "none" }}>
              {BOOKS.map((n, i) => {
                const on = i + 1 === book;
                return (
                  <button key={n} type="button" data-book={i + 1} onClick={() => { setBook(i + 1); setCh(1); setV0(1); setV1(1); }} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12, fontWeight: on ? 700 : 500, color: on ? "#8C2F51" : "#454349", background: on ? "#F6E3EB" : "transparent", borderRadius: 7, padding: "5.5px 9px", cursor: "pointer", whiteSpace: "nowrap", border: 0 }}>{n}</button>
                );
              })}
            </div>
          </div>
          <div style={{ width: 96, flex: "none" }}>
            <div style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#B4B2B8", marginBottom: 5 }}>CHAPTER</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, maxHeight: 196, overflowY: "auto", scrollbarWidth: "none" }}>
              {chaptersOf.map((n) => {
                const on = n === ch;
                return (
                  <button key={n} type="button" onClick={() => { setCh(n); setV0(1); setV1(1); }} style={{ height: 29, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: on ? 700 : 500, color: on ? "#FFFFFF" : "#454349", background: on ? "#A63D63" : "#FAF9FA", cursor: "pointer", fontVariantNumeric: "tabular-nums", border: 0 }}>{n}</button>
                );
              })}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#B4B2B8" }}>VERSES</span>
              <span style={{ fontSize: 9.5, color: "#A9A7AE" }}>{loading ? "loading…" : "drag across to take a range"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, touchAction: "none", maxHeight: 196, overflowY: "auto", scrollbarWidth: "none", opacity: loading ? 0.45 : 1 }}>
              {Array.from({ length: count }, (_, k) => k + 1).map((n) => {
                const inR = n >= lo && n <= hi;
                const first = n === lo, last = n === hi;
                const radius = first && last ? "8px" : first ? "8px 3px 3px 8px" : last ? "3px 8px 8px 3px" : "3px";
                return (
                  <div key={n} data-v={n} onPointerDown={(e) => startRange(e, n)} onPointerEnter={() => { if (ranging.current) setV1(n); }} style={{ height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: inR ? 700 : 500, color: inR ? (first || last ? "#FFFFFF" : "#8C2F51") : "#66646C", background: inR ? (first || last ? "#A63D63" : "#F0D3E0") : "#FAF9FA", borderRadius: radius, cursor: "pointer", fontVariantNumeric: "tabular-nums", userSelect: "none", touchAction: "none" }}>{n}</div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, borderTop: "1px solid #EDEBEE", marginTop: 11, paddingTop: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "#232227", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-serif, Literata, serif)", fontStyle: "italic", fontSize: 11, color: "#96949B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{peek ? `“${peek.slice(0, 90)}…”` : ""}</span>
          <button type="button" disabled={loading || !verses.length} onClick={() => onDrop(refInt(book, ch, lo), refInt(book, ch, hi), label, peek)} style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", background: loading || !verses.length ? "#D9B9C8" : "#A63D63", borderRadius: 99, padding: "7px 15px", cursor: "pointer", whiteSpace: "nowrap", border: 0 }}>Drop on the page</button>
        </div>
      </div>
    </>
  );
}
