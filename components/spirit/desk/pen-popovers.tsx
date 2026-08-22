"use client";

// Three popovers from the design: the pen settings (02c / 04 — Pencil
// squeeze opens it; tools, color, width, BIBLE MODE toggle, gesture hints,
// "All pen settings →"), the brush library (3b) and the free palette (3c).

import Link from "next/link";
import { BRUSHES, type InkTool } from "@/lib/ink";
import { INK_NAMES } from "@/lib/desk-prefs";
import { useDesk, HL_CATEGORIES } from "./desk-state";
import { Popover, Kicker, Segmented } from "./ui";
import { EraserIcon, HighlighterIcon, LassoIcon, MarkerIcon, PenIcon, PencilIcon } from "./desk-icons";

const TOOLS: { key: "fountain" | "highlighter" | "pencil" | "marker" | "eraser" | "lasso"; name: string; desc: string }[] = [
  { key: "fountain", name: "Fountain", desc: "Fountain pen — pressure shapes the line" },
  { key: "highlighter", name: "Highlighter", desc: "Highlighter — the six categories" },
  { key: "pencil", name: "Pencil", desc: "Pencil — soft, tilt shades" },
  { key: "marker", name: "Marker", desc: "Marker — flat, opaque" },
  { key: "eraser", name: "Eraser", desc: "Eraser — stroke or pixel" },
  { key: "lasso", name: "Lasso", desc: "Lasso — select ink" },
];

export function PenPopover({ style, onClose, showBibleMode = true }: { style?: React.CSSProperties; onClose: () => void; showBibleMode?: boolean }) {
  const { pen, setPen, bibleMode, setBibleMode, prefs, setPopover } = useDesk();
  const activeKey = pen.tool === "gpen" ? "fountain" : pen.tool === "text" ? "fountain" : pen.tool;
  const current = TOOLS.find((t) => t.key === activeKey) ?? TOOLS[0];
  const ic = (key: string, on: boolean) => {
    const c = on ? "#8C2F51" : "#66646C";
    switch (key) {
      case "fountain":
        return <PenIcon size={16} color={c} />;
      case "highlighter":
        return <HighlighterIcon size={16} color={c} />;
      case "pencil":
        return <PencilIcon size={16} color={c} />;
      case "marker":
        return <MarkerIcon size={16} color={c} />;
      case "eraser":
        return <EraserIcon size={16} color={c} />;
      default:
        return <LassoIcon size={16} color={c} />;
    }
  };
  const inks = prefs.pen.recents.slice(0, 5);
  const widthMm = ["0.25 mm", "0.4 mm", "0.7 mm"][pen.widthStep];
  return (
    <Popover style={style} onClose={onClose} width={296}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Kicker>PEN · PENCIL PRO</Kicker>
        <span style={{ fontSize: 9, color: "#A9A7AE" }}>or squeeze to open</span>
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
        {TOOLS.map((t) => {
          const on = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              title={t.name}
              onClick={() => (t.key === "fountain" ? setPen({ tool: pen.brush === "gpen" ? "gpen" : "fountain", brush: pen.brush === "gpen" ? "gpen" : "fountain" }) : t.key === "pencil" || t.key === "marker" ? setPen({ tool: t.key, brush: t.key }) : setPen({ tool: t.key }))}
              style={{ flex: 1, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: on ? "#F6E3EB" : "#FAF9FA", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "inset 0 0 0 1px #EDEBEE", border: 0 }}
            >
              {ic(t.key, on)}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#66646C", marginTop: 5, textAlign: "center" }}>{current.desc}</div>
      {pen.tool === "highlighter" ? (
        <div style={{ display: "flex", gap: 4, marginTop: 11 }}>
          {HL_CATEGORIES.map((c) => {
            const on = pen.hlCategory === c.name;
            return (
              <button key={c.name} type="button" onClick={() => setPen({ hlCategory: c.name })} style={{ flex: 1, textAlign: "center", cursor: "pointer", borderRadius: 10, padding: "6px 0 5px", background: on ? `${c.color}26` : "#FFFFFF", boxShadow: on ? `inset 0 0 0 1.5px ${c.color}` : "inset 0 0 0 1px #EDEBEE", border: 0 }}>
                <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: c.color, margin: "0 auto" }} />
                <span style={{ display: "block", fontSize: 8.5, fontWeight: 600, color: "#454349", marginTop: 4 }}>{c.short}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
          <span style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE", width: 38 }}>COLOR</span>
          {inks.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPen({ color: c })}
              aria-label={INK_NAMES[c] ?? c}
              style={{ width: 17, height: 17, borderRadius: "50%", cursor: "pointer", background: c, border: 0, boxShadow: c === pen.color ? "0 0 0 2px #FFFFFF, 0 0 0 3.5px #A63D63" : "inset 0 0 0 1px rgba(35,34,39,0.08)" }}
            />
          ))}
          <button type="button" onClick={() => setPopover("palette")} style={{ fontSize: 11, color: "#96949B", marginLeft: 2, cursor: "pointer", background: "none", border: 0 }}>⌄ palette</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE", width: 38 }}>WIDTH</span>
        {[5, 8, 12].map((d, i) => (
          <button key={d} type="button" aria-label={`width ${i}`} onClick={() => setPen({ widthStep: i as 0 | 1 | 2 })} style={{ width: d, height: d, borderRadius: "50%", background: i === 2 && pen.widthStep !== 2 ? "#D9D7DC" : "#454349", cursor: "pointer", border: 0, padding: 0, boxShadow: pen.widthStep === i ? "0 0 0 2px #FFFFFF, 0 0 0 3px #A63D63" : "none" }} />
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#96949B" }}>{widthMm}</span>
      </div>
      {showBibleMode && (
        <>
          <div style={{ height: 1, background: "#EDEBEE", margin: "11px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE" }}>BIBLE MODE</span>
            <Segmented value={bibleMode} onChange={setBibleMode} options={[{ value: "study", label: "STUDY" }, { value: "scratch", label: "SCRATCH" }]} />
          </div>
        </>
      )}
      <div style={{ fontSize: 10, color: "#96949B", lineHeight: 1.6, marginTop: 10, background: "#FAF9FA", borderRadius: 10, padding: "9px 11px" }}>
        <span style={{ color: "#454349", fontWeight: 600 }}>Squeeze</span> — this popover · <span style={{ color: "#454349", fontWeight: 600 }}>double-tap</span> — pen ⇄ eraser · <span style={{ color: "#454349", fontWeight: 600 }}>barrel roll</span> — nib angle · <span style={{ color: "#454349", fontWeight: 600 }}>hover</span> — rail + tool chip
      </div>
      <div style={{ marginTop: 9, display: "flex", justifyContent: "flex-end" }}>
        <Link href="/spirit/desk-settings" style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51" }}>All pen settings →</Link>
      </div>
    </Popover>
  );
}

export function BrushPopover({ style, onClose }: { style?: React.CSSProperties; onClose: () => void }) {
  const { pen, setPen } = useDesk();
  const rows: { key: InkTool; sample: React.ReactNode }[] = [
    { key: "fountain", sample: <svg width="104" height="20" viewBox="0 0 104 20"><path d="M3 14 C 20 6, 34 16, 52 9 S 88 6, 101 11" fill="none" stroke={pen.color} strokeWidth="3.2" strokeLinecap="round" /><path d="M3 14 C 20 6, 34 16, 52 9" fill="none" stroke={pen.color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" transform="translate(0,2)" /></svg> },
    { key: "gpen", sample: <svg width="104" height="20" viewBox="0 0 104 20"><path d="M3 13 C 22 8, 40 14, 58 10 S 90 8, 101 11" fill="none" stroke={pen.color} strokeWidth="1.4" strokeLinecap="round" /><path d="M40 12 C 48 10, 54 12, 60 10.5" fill="none" stroke={pen.color} strokeWidth="2.6" strokeLinecap="round" /></svg> },
    { key: "pencil", sample: <svg width="104" height="20" viewBox="0 0 104 20"><path d="M3 13 C 22 9, 40 14, 58 10 S 90 9, 101 12" fill="none" stroke={pen.color} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.5 2.4" opacity="0.8" /></svg> },
    { key: "marker", sample: <svg width="104" height="20" viewBox="0 0 104 20"><path d="M4 12 C 24 9, 44 13, 62 10 S 92 9, 100 11" fill="none" stroke={pen.color} strokeWidth="9" strokeLinecap="round" opacity="0.45" /></svg> },
  ];
  return (
    <Popover style={style} onClose={onClose} width={300}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Kicker>BRUSH LIBRARY</Kicker>
        <span style={{ fontSize: 9, color: "#A9A7AE" }}>hold a tool to open</span>
      </div>
      {rows.map((r, i) => {
        const on = pen.brush === r.key && (pen.tool === r.key || (pen.tool === "highlighter" && false));
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => setPen({ brush: r.key, tool: r.key })}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, marginTop: i === 0 ? 9 : 4, padding: "8px 10px", borderRadius: 11, cursor: "pointer", background: on ? "#F6E3EB" : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "inset 0 0 0 1px #F2F1F2", border: 0, textAlign: "left" }}
          >
            {r.sample}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#232227" }}>{BRUSHES[r.key].label}</div>
              <div style={{ fontSize: 9.5, color: "#96949B" }}>{BRUSHES[r.key].sub}</div>
            </div>
          </button>
        );
      })}
      <div style={{ height: 1, background: "#EDEBEE", margin: "11px 0 9px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: "#A9A7AE", width: 64 }}>STREAMLINE</span>
        <input type="range" min={0} max={90} value={Math.round(pen.streamline * 100)} onChange={(e) => setPen({ streamline: Number(e.target.value) / 100 })} style={{ flex: 1, accentColor: "#A63D63" }} />
        <span style={{ fontSize: 10, color: "#96949B", width: 30 }}>{Math.round(pen.streamline * 100)}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: "#A9A7AE", width: 64 }}>PRESSURE</span>
        <svg width="64" height="26" viewBox="0 0 64 26"><path d="M2 24 C 18 22, 34 14, 62 2" fill="none" stroke="#A63D63" strokeWidth="1.8" strokeLinecap="round" /><path d="M2 24 H 62" stroke="#EDEBEE" strokeWidth="1" /></svg>
        <span style={{ fontSize: 10, color: "#96949B" }}>soft start</span>
      </div>
    </Popover>
  );
}

export function PalettePopover({ style, onClose }: { style?: React.CSSProperties; onClose: () => void }) {
  const { pen, setPen, prefs, updatePrefs } = useDesk();
  const name = INK_NAMES[pen.color] ?? "Custom";
  const dot = (c: string, key: string) => (
    <button
      key={key}
      type="button"
      aria-label={INK_NAMES[c] ?? c}
      onClick={() => setPen({ color: c })}
      style={{ width: 22, height: 22, borderRadius: "50%", cursor: "pointer", background: c, border: 0, boxShadow: c === pen.color ? "0 0 0 2px #FFFFFF, 0 0 0 3.5px #A63D63" : "inset 0 0 0 1px rgba(35,34,39,0.08)" }}
    />
  );
  const addPalette = () => {
    const nm = window.prompt("Name the palette", "My palette");
    if (!nm) return;
    updatePrefs((p) => ({ ...p, palettes: [...p.palettes, { id: `p-${Date.now()}`, name: nm, colors: [...p.pen.recents].slice(0, 6) }] }));
  };
  const editColor = () => {
    const input = document.createElement("input");
    input.type = "color";
    input.value = pen.color;
    input.oninput = () => setPen({ color: input.value });
    input.click();
  };
  return (
    <Popover style={style} onClose={onClose} width={300}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Kicker>PALETTE — FREE</Kicker>
        <span style={{ fontSize: 9, color: "#A9A7AE" }}>syncs with pen defaults</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: pen.color, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.5)" }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#232227" }}>{name}</div>
          <div style={{ fontSize: 9.5, color: "#96949B" }}>current · {BRUSHES[pen.brush].label.toLowerCase()}</div>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={editColor} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", cursor: "pointer", background: "none", border: 0 }}>edit</button>
      </div>
      <div style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE", marginTop: 11 }}>RECENT</div>
      <div style={{ display: "flex", gap: 7, marginTop: 6 }}>{prefs.pen.recents.slice(0, 6).map((c) => dot(c, `r-${c}`))}</div>
      {prefs.palettes.map((p) => (
        <div key={p.id}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE", marginTop: 12 }}>SAVED · {p.name.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 7, marginTop: 6, alignItems: "center" }}>
            {p.colors.map((c) => dot(c, `${p.id}-${c}`))}
          </div>
        </div>
      ))}
      <button type="button" onClick={addPalette} style={{ marginTop: 8, fontSize: 10, color: "#96949B", cursor: "pointer", background: "none", border: 0, padding: 0 }}>+ new palette</button>
      <div style={{ fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, color: "#A9A7AE", marginTop: 12 }}>CATEGORIES — AVAILABLE, NEVER IMPOSED</div>
      <div style={{ display: "flex", gap: 7, marginTop: 6, alignItems: "center" }}>{HL_CATEGORIES.map((c) => dot(c.color, `cat-${c.name}`))}</div>
      <div style={{ fontSize: 9.5, color: "#96949B", lineHeight: 1.55, marginTop: 9, borderTop: "1px solid #EDEBEE", paddingTop: 8 }}>
        Painting with a category color does <span style={{ fontWeight: 600, color: "#66646C" }}>not</span> create a highlight — only the highlighter binds meaning.
      </div>
    </Popover>
  );
}
