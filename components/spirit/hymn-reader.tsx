"use client";

// V3 §9 — the hymn reader: for singing, not studying. Big Literata, stanza
// numbers in the gutter, the CORO set apart (left raspberry rule + white card,
// italic). LYRIC LINES ARE LINES — never re-wrapped into prose; when the
// longest line outgrows the pane the whole hymn SHRINKS to fit (never folds).
// Read-only this round: no ink over hymns. The "pliego" pill opens the source
// photograph one tap away.

import { useEffect, useRef, useState } from "react";
import { parseHymn } from "@/lib/hymns";

const RASP = "#A63D63";

export function HymnReader({
  title,
  body,
  photoData,
  baseSize = 19,
}: {
  title: string;
  body: string;
  photoData?: string | null;
  /** the aA size the host chose; the fit pass may shrink below it, never grow */
  baseSize?: number;
}) {
  const stanzas = parseHymn(body);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  const [photoOpen, setPhotoOpen] = useState(false);

  // long lines shrink, never fold: measure the longest line, scale the FONT
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth - 46; // gutter + padding
      if (avail <= 80) return;
      const cvs = document.createElement("canvas");
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.font = `${baseSize}px Literata, serif`;
      let maxW = 0;
      for (const st of stanzas) for (const l of st.lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      setFit(maxW > avail ? Math.max(0.62, avail / maxW) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // stanzas derives from body — body is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, baseSize]);

  const size = Math.round(baseSize * fit * 10) / 10;
  let stanzaNum = 0;

  return (
    <div ref={boxRef} style={{ padding: "6px 2px 20px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, letterSpacing: "0.01em", color: "#232227", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ minWidth: 0 }}>{title}</span>
        {photoData && (
          <button type="button" onClick={() => setPhotoOpen(true)} style={{ flex: "none", fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "3px 9px", border: 0, cursor: "pointer" }}>
            PLIEGO
          </button>
        )}
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
        {stanzas.map((st, i) => {
          const isCoro = Boolean(st.label);
          if (!isCoro) stanzaNum += 1;
          return (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <span style={{ flex: "none", width: 20, textAlign: "right", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: isCoro ? "transparent" : RASP, paddingTop: 5 }}>
                {isCoro ? "" : stanzaNum}
              </span>
              <div
                style={
                  isCoro
                    ? { flex: 1, minWidth: 0, background: "#FFFFFF", borderLeft: `3px solid ${RASP}`, borderRadius: "0 12px 12px 0", boxShadow: "0 2px 10px rgba(35,34,39,0.05)", padding: "9px 13px" }
                    : { flex: 1, minWidth: 0 }
                }
              >
                {isCoro && <div style={{ fontSize: 8.5, letterSpacing: "0.14em", fontWeight: 700, color: RASP, marginBottom: 3 }}>{st.label!.toUpperCase()}</div>}
                {st.lines.map((l, j) => (
                  <div key={j} style={{ fontFamily: "var(--font-serif)", fontSize: size, lineHeight: 1.62, color: "#232227", fontStyle: isCoro ? "italic" : "normal", whiteSpace: "nowrap" }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {photoOpen && photoData && (
        <div onClick={() => setPhotoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(20,15,18,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* the sheet he photographed — the source of truth, kept forever */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoData} alt={`${title} — pliego`} style={{ maxWidth: "94%", maxHeight: "94%", borderRadius: 10, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }} />
        </div>
      )}
    </div>
  );
}
