"use client";

import { useEffect, useState } from "react";
import { penTrace } from "@/lib/pen-trace";

/**
 * The pen readout. Appears only on ?pendebug=1.
 *
 * It answers one question on the device where the answer matters: is the Apple Pencil's input
 * reaching the ink engine intact, or is something upstream delaying and cancelling it?
 * "cancelled" above zero while writing means a native gesture recogniser is stealing contacts.
 * A large "down→move" means the touch was withheld before the page ever saw it.
 */
export function PenDebug() {
  const [, bump] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    penTrace.init();
    return penTrace.subscribe(() => bump((n) => n + 1));
  }, []);

  if (!penTrace.enabled) return null;
  const c = penTrace.counts;
  const recent = penTrace.rows.slice(-9).reverse();

  return (
    <div
      style={{
        position: "fixed", right: 10, bottom: 10, zIndex: 999,
        width: open ? 330 : 190, maxHeight: "52vh", overflow: "auto",
        background: "rgba(20,15,18,0.93)", color: "#F6F4F5",
        borderRadius: 12, padding: "9px 11px", fontSize: 10.5, lineHeight: 1.45,
        fontFamily: "var(--font-mono, ui-monospace), monospace",
        boxShadow: "0 12px 34px rgba(0,0,0,0.4)", pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 10, letterSpacing: 0.6 }}>
          PEN TRACE <span style={{ opacity: 0.55, fontWeight: 400 }}>build {process.env.NEXT_PUBLIC_BUILD}</span>
        </strong>
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={() => penTrace.reset()} style={btn}>reset</button>
          <button onClick={() => setOpen((o) => !o)} style={btn}>{open ? "hide" : "show"}</button>
        </span>
      </div>

      <div style={{ marginTop: 6, color: c.cancel > 0 ? "#FF9E8A" : "#9BE8B4" }}>{penTrace.verdict()}</div>

      {open && (
        <>
          <div style={{ marginTop: 6, color: "#B9B6BC" }}>
            down {c.down} · up {c.up} · <span style={{ color: c.cancel ? "#FF9E8A" : undefined }}>cancel {c.cancel}</span>
            {" · "}lostcap {c.lostcapture} · kept {c.committed}
            {c.dropped > 0 && <span style={{ color: "#FF9E8A" }}> · dropped {c.dropped}</span>}
          </div>
          <table style={{ marginTop: 7, width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i} style={{ color: r.kind === "cancel" || r.dropped ? "#FF9E8A" : "#D6D3D8" }}>
                  <td style={td}>{r.kind}</td>
                  <td style={td}>{r.pointerType.slice(0, 3)}</td>
                  <td style={td}>{r.sinceLastUp !== null ? `gap ${r.sinceLastUp}` : ""}</td>
                  <td style={td}>{r.downToFirstMove !== null ? `d→m ${r.downToFirstMove}` : ""}</td>
                  <td style={td}>{r.coalesced ? `×${r.coalesced}` : ""}</td>
                  <td style={td}>{r.points ? `${r.points}pt` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.some((r) => r.dropped) && (
            <div style={{ marginTop: 6, color: "#FF9E8A" }}>{recent.find((r) => r.dropped)?.dropped}</div>
          )}
          <button
            onClick={() => navigator.clipboard?.writeText(JSON.stringify({ counts: c, rows: penTrace.rows }, null, 1))}
            style={{ ...btn, marginTop: 8, width: "100%" }}
          >
            copy full trace
          </button>
        </>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "rgba(255,255,255,0.14)", color: "#F6F4F5", border: "none",
  borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer",
};
const td: React.CSSProperties = { padding: "1px 4px 1px 0", whiteSpace: "nowrap" };
