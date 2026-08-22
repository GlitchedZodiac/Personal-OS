"use client";

// 11 — Settings, iPad additions: six cards in the Spirit settings grammar.
// Handedness (the desk mirrors) · Bible defaults (mode + overlay) · Pen
// defaults + saved palettes · Recognition per notebook · Recording consent
// + storage · Layouts (the desk remembers).

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_DESK_PREFS, mergeDeskPrefs, writeLocalDeskPrefs, type DeskPrefs } from "@/lib/desk-prefs";
import { DISPLAY, cardShadow } from "@/components/spirit/desk/ui";
import { PenIcon } from "@/components/spirit/desk/desk-icons";

interface Nb { id: string; title: string; kind: string; inkLang: string; audioLang: string }

const pill = (on: boolean): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 600, color: on ? "#FFFFFF" : "#66646C", border: on ? "none" : "1px solid #E4E2E6", background: on ? "#A63D63" : "#FFFFFF", borderRadius: 99, padding: "4px 12px", cursor: "pointer" });

export default function DeskSettingsPage() {
  const [prefs, setPrefs] = useState<DeskPrefs>(DEFAULT_DESK_PREFS);
  const [nbs, setNbs] = useState<Nb[]>([]);
  useEffect(() => {
    fetch("/api/spirit/desk-prefs").then((r) => (r.ok ? r.json() : null)).then((d) => d?.prefs && setPrefs(mergeDeskPrefs(d.prefs))).catch(() => {});
    fetch("/api/spirit/notebooks").then((r) => (r.ok ? r.json() : null)).then((d) => setNbs(d?.notebooks ?? [])).catch(() => {});
  }, []);
  const save = async (patch: Partial<DeskPrefs> | Record<string, unknown>) => {
    const next = mergeDeskPrefs({ ...prefs, ...patch });
    setPrefs(next);
    writeLocalDeskPrefs(next);
    const r = await fetch("/api/spirit/desk-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) toast.error("Couldn't save.");
  };
  const setNbLang = async (id: string, patch: { inkLang?: string; audioLang?: string }) => {
    await fetch(`/api/spirit/notebooks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setNbs((xs) => xs.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };
  const L = prefs.handedness === "left";
  const card: React.CSSProperties = { background: "#FFFFFF", borderRadius: 16, padding: "16px 18px", boxShadow: cardShadow };
  const head = (t: string, right?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 10, letterSpacing: "0.16em", fontWeight: 700, color: "#96949B" }}>{t}</span>
      {right}
    </div>
  );
  const row = (label: string, children: React.ReactNode, mt = 9) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: mt, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#454349", width: 104 }}>{label}</span>
      {children}
    </div>
  );
  const langCycle = (v: string) => (v === "en" ? "es" : "en");
  const langName = (v: string) => (v === "es" ? "español" : "english");
  const retention = prefs.recording.retention;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "calc(40px + env(safe-area-inset-top, 0px)) 36px 24px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/home" style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}><span style={{ fontSize: 17, color: "#232227", lineHeight: 1, marginTop: -2 }}>‹</span></Link>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "#96949B" }}>SPIRIT · THE DESK&apos;S SETTINGS</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: "#232227", letterSpacing: "-0.02em" }}>Settings — iPad</div>
          </div>
          <span style={{ flex: 1 }} />
          <Link href="/spirit/settings" style={{ fontSize: 11, fontWeight: 600, color: "#8C2F51", textDecoration: "none" }}>the phone&apos;s Spirit settings ›</Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 22 }}>
          <div style={card}>
            {head("HANDEDNESS — THE DESK MIRRORS")}
            <div style={{ display: "flex", gap: 10, marginTop: 11 }}>
              {(["left", "right"] as const).map((h) => {
                const on = prefs.handedness === h;
                return (
                  <button key={h} type="button" onClick={() => save({ handedness: h })} style={{ flex: 1, borderRadius: 12, padding: "11px 12px", cursor: "pointer", background: on ? "#F6E3EB" : "#FAF9FA", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "inset 0 0 0 1px #EDEBEE", border: 0, textAlign: "left" }}>
                    <div style={{ width: 64, height: 40, border: "1px solid #E4E2E6", borderRadius: 7, display: "flex", gap: 2, padding: 3, boxSizing: "border-box", background: "#FFFFFF", flexDirection: h === "left" ? "row" : "row-reverse" }}><span style={{ flex: 1.2, background: "#F0D3E0", borderRadius: 3 }} /><span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /></div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#232227", marginTop: 7 }}>{h === "left" ? "Left-handed" : "Right-handed"} {on ? (h === "left" ? "· his default" : "· active") : ""}</div>
                    <div style={{ fontSize: 10, color: "#96949B", marginTop: 1 }}>{h === "left" ? "notebook left · rail by the seam · Bible margin left" : "everything mirrors — never hardcoded"}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 10 }}>Flips the desk, the tool rail, the overlay&apos;s writing margin and the pen-positioned action bar. He may share the app one day.</div>
          </div>

          <div style={card}>
            {head("BIBLE DEFAULTS — MODE & OVERLAY")}
            {row("Default mode", <div style={{ display: "flex", background: "#FAF9FA", border: "1px solid #E4E2E6", borderRadius: 99, padding: 2.5 }}>{(["study", "scratch"] as const).map((m) => <button key={m} type="button" onClick={() => save({ bibleMode: m })} style={{ fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, color: prefs.bibleMode === m ? "#FFFFFF" : "#96949B", background: prefs.bibleMode === m ? "#A63D63" : "transparent", borderRadius: 99, padding: "4px 14px", border: 0, cursor: "pointer" }}>{m.toUpperCase()}</button>)}</div>, 11)}
            {row("Overlay margin", <div style={{ display: "flex", gap: 5 }}>{(["none", "wide", "wider"] as const).map((m, i) => <button key={m} type="button" onClick={() => save({ overlay: { ...prefs.overlay, margin: i as 0 | 1 | 2 } })} style={pill(prefs.overlay.margin === i)}>{m}</button>)}</div>)}
            {row("Overlay opens", <div style={{ display: "flex", gap: 5 }}>{(["show", "dim", "hide"] as const).map((v) => <button key={v} type="button" onClick={() => save({ overlay: { ...prefs.overlay, visibility: v } })} style={pill(prefs.overlay.visibility === v)}>{v === "show" ? "shown" : v === "dim" ? "dimmed" : "hidden"}</button>)}</div>)}
            {row("Default layer", <><button type="button" onClick={() => save({ overlay: { ...prefs.overlay, defaultLayer: prefs.overlay.defaultLayer === "my" ? "context" : "my" } })} style={{ fontSize: 11, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "4px 12px", border: 0, cursor: "pointer" }}>{prefs.overlay.defaultLayer === "my" ? "My layer" : "The context's layer"} ⌄</button><span style={{ fontSize: 10, color: "#96949B" }}>study/sermon layers arm themselves in context</span></>)}
            {row("Action bar", <div style={{ display: "flex", gap: 5 }}>{(["A", "B"] as const).map((a) => <button key={a} type="button" onClick={() => save({ actionBar: a })} style={pill(prefs.actionBar === a)}>{a === "A" ? "A · pen-positioned" : "B · fixed upper-right"}</button>)}</div>)}
          </div>

          <div style={card}>
            {head("PEN — DEFAULTS & SAVED PALETTES", <Link href="/spirit/desk?ctx=free" style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", textDecoration: "none" }}>edit in the rail ›</Link>)}
            {row("Default brush", <><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#232227", border: "1px solid #E4E2E6", borderRadius: 99, padding: "4px 12px" }}><PenIcon size={12} strokeWidth={2} />{prefs.pen.brush === "fountain" ? "Fountain" : prefs.pen.brush === "gpen" ? "G-pen" : prefs.pen.brush === "pencil" ? "Pencil" : "Marker"} · {(0.4 * (prefs.pen.widthMul ?? 1)).toFixed(2).replace(/0$/, "")} mm</span><span style={{ fontSize: 10, color: "#96949B" }}>the size and opacity sliders are continuous</span></>, 11)}
            {prefs.palettes.map((p) => (
              <div key={p.id}>{row(p.name, <><span style={{ display: "flex", gap: 5 }}>{p.colors.map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: "50%", background: c }} />)}</span><span style={{ fontSize: 10, color: "#96949B" }}>{p.id === "sketch-purples" ? "default" : ""}</span></>, 10)}</div>
            ))}
            <button type="button" onClick={() => { const nm = window.prompt("Name the palette"); if (nm) void save({ palettes: [...prefs.palettes, { id: `p-${Date.now()}`, name: nm, colors: prefs.pen.recents.slice(0, 6) }] }); }} style={{ marginTop: 8, fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer", padding: 0 }}>+ new palette</button>
          </div>

          <div style={card}>
            {head("RECOGNITION — PER NOTEBOOK")}
            {nbs.map((n, i) => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0 8px", borderBottom: i < nbs.length - 1 ? "1px solid #F2F1F2" : "none", marginTop: i === 0 ? 4 : 0 }}>
                <span style={{ fontSize: 12.5, color: "#232227", fontWeight: 600 }}>{n.title}</span>
                <span style={{ fontSize: 11, color: "#66646C" }}>
                  {n.kind === "sermons" && <>audio <button type="button" onClick={() => setNbLang(n.id, { audioLang: langCycle(n.audioLang) })} style={{ fontWeight: 700, color: "#8C2F51", background: "none", border: 0, cursor: "pointer", padding: 0 }}>{langName(n.audioLang)}</button> · </>}
                  ink <button type="button" onClick={() => setNbLang(n.id, { inkLang: langCycle(n.inkLang) })} style={{ fontWeight: 700, color: "#8C2F51", background: "none", border: 0, cursor: "pointer", padding: 0 }}>{langName(n.inkLang)}</button> ⌄
                </span>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 9 }}>Recognition writes the hidden text layer only — &quot;show text&quot; stays off by default. References he writes go live in any language he lists.</div>
          </div>

          <div style={card}>
            {head("RECORDING — CONSENT & STORAGE", (
              <button type="button" onClick={() => save({ recording: { ...prefs.recording, consent: !prefs.recording.consent, consentShownAt: new Date().toISOString() } })} aria-label="Recording consent" style={{ width: 44, height: 26, borderRadius: 99, position: "relative", cursor: "pointer", transition: "background .25s", background: prefs.recording.consent ? "#A63D63" : "#D9D7DC", border: 0 }}>
                <span style={{ position: "absolute", top: 2, width: 22, height: 22, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left .25s", left: prefs.recording.consent ? 20 : 2 }} />
              </button>
            ))}
            <div style={{ fontSize: 12, color: "#454349", lineHeight: 1.6, marginTop: 9 }}>
              {prefs.recording.consent ? "One-time note, shown once: recordings are for your own study. Where you are, one-party consent covers this — check locally if you travel. Never uploaded anywhere you haven’t chosen." : "Recording is off. The Sermon page still works — strokes timestamp against the clock instead, and replay is unavailable."}
            </div>
            {row("Keep audio", <div style={{ display: "flex", gap: 5 }}>{(["90d", "forever", "after_transcript"] as const).map((r) => <button key={r} type="button" onClick={() => save({ recording: { ...prefs.recording, retention: r } })} style={pill(retention === r)}>{r === "90d" ? "90 days" : r === "forever" ? "until I delete" : "drop after transcript"}</button>)}</div>, 10)}
            {row("Church", <><input value={prefs.sermon.church} onChange={(e) => setPrefs((p) => ({ ...p, sermon: { ...p.sermon, church: e.target.value } }))} onBlur={() => save({ sermon: prefs.sermon })} placeholder="Iglesia…" style={{ fontSize: 11.5, border: "1px solid #E4E2E6", borderRadius: 9, padding: "5px 9px", width: 170 }} /><input value={prefs.sermon.preacher} onChange={(e) => setPrefs((p) => ({ ...p, sermon: { ...p.sermon, preacher: e.target.value } }))} onBlur={() => save({ sermon: prefs.sermon })} placeholder="Pr. …" style={{ fontSize: 11.5, border: "1px solid #E4E2E6", borderRadius: 9, padding: "5px 9px", width: 130 }} /></>)}
            <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 9 }}>Stroke timestamps and the text layer survive audio deletion — replay degrades to the transcript line.</div>
          </div>

          <div style={card}>
            {head("LAYOUTS — THE DESK REMEMBERS", <span style={{ fontSize: 10.5, color: "#96949B" }}>per context, per device</span>)}
            <div style={{ display: "flex", gap: 10, marginTop: 11 }}>
              {([["study", "Study", "Notebook | Teaching"], ["sermon", "Sermon", "Notebook | Bible over Ref"], ["free", "Free reading", "one text, wide margins"]] as const).map(([k, name, sub]) => (
                <div key={k} style={{ flex: 1, border: "1px solid #E4E2E6", borderRadius: 11, padding: "9px 11px" }}>
                  <div style={{ width: 56, height: 36, border: "1px solid #E4E2E6", borderRadius: 6, display: "flex", gap: 2, padding: 3, boxSizing: "border-box", background: "#FAF9FA", flexDirection: L ? "row" : "row-reverse" }}>
                    {k === "free" ? <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /> : <><span style={{ flex: 1.2, background: "#F0D3E0", borderRadius: 3 }} />{k === "study" ? <span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /> : <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ flex: 1.3, background: "#E4E2E6", borderRadius: 3 }} /><span style={{ flex: 1, background: "#E4E2E6", borderRadius: 3 }} /></span>}</>}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#232227", marginTop: 6 }}>{name}</div>
                  <div style={{ fontSize: 9.5, color: "#96949B" }}>{sub}</div>
                  <div style={{ fontSize: 9, color: "#B8B2AB", marginTop: 3 }}>preset now: {prefs.layouts[k]?.preset ?? k}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 10 }}>Tool, color, layout and last position persist per context — opening a study page reopens the Bible at the assignment.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
