"use client";

// 06c — the recordings library: the list, and one open (player, the ES
// transcript with the current line washed, the linked page alongside;
// rename · label · delete — deleting audio keeps the page and its text
// layer; replay degrades to the transcript).

import Link from "next/link";
import { useEffect, useState } from "react";
import { DISPLAY, cardShadow } from "@/components/spirit/desk/ui";
import { ReplayBar, type SegmentMeta, type TranscriptLine } from "@/components/spirit/desk/recording-control";
import { PlayIcon, RecDot } from "@/components/spirit/desk/desk-icons";
import { fmtSeconds, drawStrokes, type Stroke } from "@/lib/ink";
import { useRef } from "react";

interface Row { id: string; title: string; label: string; preacher: string | null; passageRef: string | null; startedAt: string; durationSec: number; status: string; lineCount: number; pageId: string | null; page: { id: string; title: string } | null }
interface Open { recording: Row & { transcript: TranscriptLine[]; lang: string }; segments: SegmentMeta[]; page: { id: string; title: string; subtitle: string | null; strokes: Stroke[]; objects: unknown[] } | null }

function PageThumb({ strokes }: { strokes: Stroke[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(c.width / 800, c.width / 800);
    drawStrokes(ctx, strokes);
  }, [strokes]);
  return <canvas ref={ref} width={300} height={220} style={{ width: "100%", height: 160, display: "block" }} />;
}

export default function RecordingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const [t, setT] = useState(0);
  const load = () => fetch("/api/spirit/recordings").then((r) => (r.ok ? r.json() : null)).then((d) => setRows(d?.recordings ?? [])).catch(() => {});
  useEffect(() => {
    void load();
  }, []);
  const openRec = (id: string) => fetch(`/api/spirit/recordings/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setOpen({ recording: d.recording, segments: d.segments, page: d.page }); setSeek(null); setT(0); } }).catch(() => {});
  useEffect(() => {
    if (rows.length && !open) void openRec(rows[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);
  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/spirit/recordings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
    await openRec(id);
  };
  const del = async (id: string) => {
    if (!window.confirm("Delete this recording? The page and its text layer stay.")) return;
    await fetch(`/api/spirit/recordings/${id}`, { method: "DELETE" });
    setOpen(null);
    await load();
  };
  const transcribe = async (id: string) => {
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`/api/spirit/recordings/${id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxSegments: 5 }) });
      if (!r.ok) break;
      const d = await r.json();
      await load();
      if (d.finished) break;
    }
    await openRec(id);
  };
  const lineIdx = open ? open.recording.transcript.findIndex((l, i, arr) => l.start <= t + 0.2 && (i === arr.length - 1 || arr[i + 1].start > t + 0.2)) : -1;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "calc(40px + env(safe-area-inset-top, 0px)) 28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/home" style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}><span style={{ fontSize: 17, color: "#232227", lineHeight: 1, marginTop: -2 }}>‹</span></Link>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "#96949B" }}>SPIRIT · SUNDAY</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: "#232227", letterSpacing: "-0.02em" }}>Recordings</div>
          </div>
          <span style={{ fontSize: 10, color: "#96949B", marginLeft: 8 }}>consent noted in Settings</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <div style={{ width: 328, flex: "none" }}>
            <div style={{ background: "#FFFFFF", borderRadius: 14, boxShadow: cardShadow, overflow: "hidden" }}>
              {rows.length === 0 && <div style={{ padding: 14, fontSize: 11.5, color: "#96949B" }}>No recordings yet — Sunday&apos;s page records in its header.</div>}
              {rows.map((r, i) => {
                const on = open?.recording.id === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => openRec(r.id)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: on ? "#F6E3EB" : "#FFFFFF", boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none", borderTop: i > 0 ? "1px solid #F2F1F2" : "none", border: 0, cursor: "pointer", borderRadius: i === 0 ? "14px 14px 0 0" : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: on ? 700 : 600, color: on ? "#8C2F51" : "#232227" }}>{new Date(r.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {r.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: on ? "#8C2F51" : "#96949B" }}>{fmtSeconds(r.durationSec)}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: on ? "#B07A93" : "#96949B", marginTop: 2 }}>
                      {[r.preacher, r.passageRef].filter(Boolean).join(" · ")}{r.preacher || r.passageRef ? " · " : ""}
                      {r.status === "ready" ? <span style={{ fontWeight: 700, color: "#3E7A54" }}>ready ✓</span> : r.status === "transcribing" ? <span style={{ color: "#8C2F51", fontWeight: 600 }}>transcribing <RecDot size={5} /></span> : r.status === "audio_deleted" ? "audio deleted · transcript kept" : r.status}
                      {" · "}label: {r.label || "unlabeled"}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: "#96949B", marginTop: 9, padding: "0 2px", lineHeight: 1.5 }}>rename · label · delete — deleting audio keeps the page and its text layer</div>
          </div>
          <div style={{ flex: 1, background: "#FFFFFF", borderRadius: 14, boxShadow: cardShadow, padding: "14px 16px", display: "flex", flexDirection: "column", minHeight: 420 }}>
            {!open && <div style={{ fontSize: 12, color: "#96949B" }}>Pick a recording.</div>}
            {open && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setSeek(t)} style={{ width: 30, height: 30, borderRadius: "50%", background: "#A63D63", display: "flex", alignItems: "center", justifyContent: "center", border: 0, cursor: "pointer" }}><PlayIcon /></button>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: "#232227" }}>{new Date(open.recording.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {open.recording.title}</div>
                    <div style={{ fontSize: 10, color: "#96949B" }}>{fmtSeconds(t)} / {fmtSeconds(open.recording.durationSec)} · {open.recording.status}</div>
                  </div>
                  <button type="button" onClick={() => { const v = window.prompt("Rename", open.recording.title); if (v) void patch(open.recording.id, { title: v }); }} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>rename</button>
                  <button type="button" onClick={() => { const v = window.prompt("Label", open.recording.label); if (v !== null) void patch(open.recording.id, { label: v }); }} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>label</button>
                  {open.recording.status !== "ready" && open.recording.status !== "audio_deleted" && <button type="button" onClick={() => void transcribe(open.recording.id)} style={{ fontSize: 10.5, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>transcribe</button>}
                  {open.recording.status !== "audio_deleted" && <button type="button" onClick={() => { if (window.confirm("Delete the audio? The transcript and the page stay.")) void patch(open.recording.id, { deleteAudio: true }); }} style={{ fontSize: 10.5, fontWeight: 600, color: "#B4533F", background: "none", border: 0, cursor: "pointer" }}>delete audio</button>}
                  <button type="button" onClick={() => void del(open.recording.id)} style={{ fontSize: 10.5, fontWeight: 600, color: "#B4533F", background: "none", border: 0, cursor: "pointer" }}>delete</button>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, flex: 1, minHeight: 0 }}>
                  <div style={{ flex: 1.2, border: "1px solid #EDEBEE", borderRadius: 11, padding: "10px 12px", overflowY: "auto", maxHeight: 420 }}>
                    <div style={{ fontSize: 8.5, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>TRANSCRIPT · {open.recording.lang.toUpperCase()}{open.recording.transcript.some((l) => l.gloss) ? " (EN gloss)" : ""}</div>
                    {open.recording.transcript.length === 0 && <div style={{ fontSize: 11, color: "#A9A7AE", marginTop: 6 }}>{open.recording.status === "transcribing" ? "transcribing…" : "no transcript yet"}</div>}
                    {open.recording.transcript.map((l, i) => (
                      <button key={i} type="button" onClick={() => setSeek(l.start)} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, color: i === lineIdx ? "#232227" : "#96949B", lineHeight: 1.6, marginTop: 5, background: i === lineIdx ? "#F6E3EB" : "transparent", borderRadius: 7, padding: "5px 8px", border: 0, cursor: "pointer" }}>
                        <span style={{ fontWeight: 700, color: i === lineIdx ? "#8C2F51" : "#B8B2AB" }}>{fmtSeconds(l.start)}</span> — {l.text}
                        {l.gloss && <span style={{ display: "block", fontSize: 10, color: "#A9A7AE" }}>{l.gloss}</span>}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, border: "1px solid #EDEBEE", borderRadius: 11, padding: "10px 12px", background: "#FFFDF9", backgroundImage: "radial-gradient(#EBE6E1 1px, transparent 1.2px)", backgroundSize: "18px 18px" }}>
                    <div style={{ fontSize: 8.5, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>LINKED PAGE · ALONGSIDE</div>
                    {open.page ? (
                      <>
                        <div style={{ marginTop: 7, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.5)" }}><PageThumb strokes={open.page.strokes ?? []} /></div>
                        <Link href={`/spirit/desk?ctx=sermon&page=${open.page.id}`} style={{ display: "inline-block", fontSize: 9.5, fontWeight: 600, color: "#8C2F51", marginTop: 9, textDecoration: "none" }}>open the page →</Link>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "#A9A7AE", marginTop: 6 }}>no page linked</div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 10, marginLeft: -16, marginRight: -16, marginBottom: -14 }}>
                  <ReplayBar recordingId={open.recording.id} duration={open.recording.durationSec} segments={open.segments} transcript={open.recording.transcript} audioGone={open.recording.status === "audio_deleted" || open.segments.length === 0} seekTo={seek} status={open.recording.status} onTime={setT} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
