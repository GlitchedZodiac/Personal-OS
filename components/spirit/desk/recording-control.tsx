"use client";

// Recording in the corner (01) and the replay bar (06a): start · level ·
// elapsed · pause while he writes; afterwards play/pause, the waveform with
// the played portion and playhead, time / total, stop, and the transcript
// line for that second (ES, EN gloss under it). Audio plays segment by
// segment from Postgres; replay degrades to the transcript when audio is
// gone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtSeconds } from "@/lib/ink";
import { PauseIcon, PlayIcon, RecDot, VuBars, MicFilledIcon } from "./desk-icons";
import { DISPLAY } from "./ui";

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
  gloss?: string | null;
}
export interface SegmentMeta {
  index: number;
  startSec: number;
  durationSec: number;
}

export function RecordingChip({
  state,
  elapsed,
  level,
  onToggle,
  onStart,
  onStop,
  consent,
  uploading,
}: {
  state: "idle" | "recording" | "paused" | "stopped";
  elapsed: number;
  level: number;
  onToggle: () => void;
  onStart: () => void;
  onStop: () => void;
  consent: boolean;
  uploading?: number;
}) {
  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={onStart}
        title={consent ? "Record the sermon — timestamps every stroke" : "Recording is off in Settings — strokes timestamp against the clock"}
        style={{ display: "flex", alignItems: "center", gap: 7, background: consent ? "#FAF9FA" : "#F2F1F2", border: "1px solid #EDEBEE", borderRadius: 99, padding: "4px 11px 4px 9px", cursor: "pointer" }}
      >
        <MicFilledIcon size={11} color={consent ? "#C24040" : "#A9A7AE"} />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: consent ? "#232227" : "#96949B" }}>{consent ? "Record" : "Recording off"}</span>
      </button>
    );
  }
  const live = state === "recording";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 99, padding: "4px 6px 4px 11px" }}>
      <RecDot live={live} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#232227", fontVariantNumeric: "tabular-nums" }}>{state === "paused" ? "‖ " : ""}{fmtSeconds(elapsed)}</span>
      {live && (level > 0.01 ? <VuBars /> : <VuBars color="#E4E2E6" />)}
      {state !== "stopped" && (
        <button type="button" onClick={onToggle} title={live ? "Pause" : "Resume"} style={{ width: 22, height: 22, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          {live ? <PauseIcon size={8} color="#454349" /> : <PlayIcon size={8} color="#8C2F51" />}
        </button>
      )}
      {state !== "stopped" && (
        <button type="button" onClick={onStop} title="Stop — transcribe" style={{ height: 22, borderRadius: 99, background: "#232227", color: "#FFFFFF", border: 0, fontSize: 9.5, fontWeight: 700, padding: "0 9px", cursor: "pointer" }}>
          stop
        </button>
      )}
      {uploading ? <span style={{ fontSize: 9, color: "#A9A7AE" }}>↑{uploading}</span> : null}
    </div>
  );
}

export interface ReplayHandle {
  playFrom: (sec: number) => void;
}

export function ReplayBar({
  recordingId,
  duration,
  segments,
  transcript,
  audioGone,
  seekTo,
  onTime,
  status,
}: {
  recordingId: string;
  duration: number;
  segments: SegmentMeta[];
  transcript: TranscriptLine[];
  audioGone: boolean;
  seekTo: number | null; // seconds requested by a tapped stroke
  onTime?: (sec: number) => void;
  status: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  /**
   * The segment the <audio> element ACTUALLY holds, updated synchronously in load().
   * onTick used the state copy — but the element fires events before React commits,
   * so a cross-segment seek computed time against the OLD segment and snapped every
   * jump to a 2-minute boundary (transcript-line taps landed up to 2min off).
   */
  const segIdxRef = useRef<number | null>(null);
  const pendingSeek = useRef<number | null>(null);
  /** his morning note: playback speed — persisted per device, applied on every segment load */
  const [rate, setRate] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const n = Number(localStorage.getItem("spirit-replay-rate"));
    return [0.75, 1, 1.25, 1.5, 2].includes(n) ? n : 1;
  });
  /**
   * A REAL drag scrub. The old bar answered pointerdown only — a finger drag did
   * nothing until you lifted and tapped again, and every tap reloaded audio, so
   * scrubbing felt like typing. While the finger is down, the playhead, the time
   * label and the transcript line all follow it locally; the audio seeks ONCE on
   * release (a plain tap still plays from the spot, like before).
   */
  const [scrub, setScrub] = useState<number | null>(null);
  /** the live scrub value — a whole down-move-up can land inside one frame, before any re-render */
  const scrubRef = useRef<number | null>(null);
  const scrubInfo = useRef<{ wasPlaying: boolean; moved: boolean; x0: number } | null>(null);

  const segFor = (sec: number) =>
    segments.find((s) => sec >= s.startSec && sec < s.startSec + s.durationSec + 0.05)
      // an interrupted recording's timeline has holes — land where the audio RESUMES,
      // not always on the final segment
      ?? segments.find((s) => s.startSec >= sec)
      ?? segments[segments.length - 1]
      ?? null;

  const load = (sec: number, autoplay: boolean) => {
    const el = audioRef.current;
    if (!el || audioGone) {
      setT(sec);
      onTime?.(sec);
      return;
    }
    const seg = segFor(sec);
    if (!seg) return;
    const within = Math.max(0, sec - seg.startSec);
    if (segIdxRef.current !== seg.index) {
      segIdxRef.current = seg.index;
      pendingSeek.current = within;
      el.src = `/api/spirit/recordings/${recordingId}/segments/${seg.index}`;
      el.load();
      if (autoplay) el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.currentTime = within;
      if (autoplay) el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
    setT(sec);
    onTime?.(sec);
  };

  useEffect(() => {
    if (seekTo === null || seekTo === undefined) return;
    load(seekTo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo]);

  const onLoaded = () => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate; // a fresh src forgets the rate
    if (pendingSeek.current !== null) {
      el.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
  };
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
    try { localStorage.setItem("spirit-replay-rate", String(rate)); } catch { /* per-device nicety */ }
  }, [rate]);
  const cycleRate = () => {
    const RATES = [1, 1.25, 1.5, 2, 0.75];
    setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length]);
  };
  /** ±30s — clamped; segment switching is load()'s existing job */
  const skip = (delta: number) => {
    if (audioGone) return;
    const target = Math.min(Math.max(0, t + delta), Math.max(duration - 0.2, 0));
    load(target, playing);
  };
  const onTick = () => {
    const el = audioRef.current;
    if (!el || segIdxRef.current === null) return;
    if (pendingSeek.current !== null) return; // the element hasn't taken the seek yet — its tick is noise
    const seg = segments.find((s) => s.index === segIdxRef.current);
    const sec = (seg?.startSec ?? 0) + el.currentTime;
    setT(sec);
    onTime?.(sec);
  };
  const onEnded = () => {
    const cur = segIdxRef.current;
    if (cur === null) return;
    const next = segments.find((s) => s.index === cur + 1);
    if (next) load(next.startSec, true);
    else setPlaying(false);
  };
  const toggle = () => {
    const el = audioRef.current;
    if (!el || audioGone) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else if (segIdxRef.current === null) load(t, true);
    else el.play().then(() => setPlaying(true)).catch(() => {});
  };
  const stop = () => {
    const el = audioRef.current;
    el?.pause();
    setPlaying(false);
    setT(0);
    onTime?.(0);
  };

  const shown = scrub ?? t; // the finger owns the view while it is down
  const line = useMemo(() => {
    let best: TranscriptLine | null = null;
    for (const l of transcript) {
      if (l.start <= shown + 0.2) best = l;
      else break;
    }
    return best;
  }, [transcript, shown]);

  const total = Math.max(duration, 1);
  const bars = 66;
  const frac = Math.min(1, shown / total);
  /**
   * Map a pointer x to seconds against the waveform box, with a forgiving edge:
   * the first/last 2.5% snap to 0 / end. His note — "deadspace in the beginning
   * that makes it hard to go all the way back" — the leftmost pixels sat flush
   * against the play button, so reaching second 0 meant a 4px target. The strip
   * also grew 8px of real slop each side (negative margin, padding back).
   */
  const fracAt = useCallback((clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const raw = (clientX - r.left - 8) / Math.max(1, r.width - 16);
    const f = Math.min(1, Math.max(0, raw));
    if (f < 0.025) return 0;
    if (f > 0.975) return 1;
    return f;
  }, []);
  const onScrubDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (audioGone) return;
    e.preventDefault();
    // capture keeps the drag when the finger wanders off the strip; a pointer that
    // already lifted (or a synthetic one) throws NotFound — never let that kill the scrub
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* uncaptured is still draggable over the strip */ }
    scrubInfo.current = { wasPlaying: playing, moved: false, x0: e.clientX };
    scrubRef.current = fracAt(e.clientX, e.currentTarget) * total;
    setScrub(scrubRef.current);
  };
  const onScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubInfo.current) return;
    if (Math.abs(e.clientX - scrubInfo.current.x0) > 4) scrubInfo.current.moved = true;
    scrubRef.current = fracAt(e.clientX, e.currentTarget) * total;
    setScrub(scrubRef.current);
  };
  const onScrubUp = () => {
    const info = scrubInfo.current;
    const at = scrubRef.current;
    scrubInfo.current = null;
    scrubRef.current = null;
    setScrub(null);
    if (info === null || at === null) return;
    // a plain tap plays from the spot (the old manner); a drag restores what playback was doing
    load(at, info.moved ? info.wasPlaying : true);
  };
  return (
    <div style={{ flex: "none", borderTop: "1px solid #EDEBEE", background: "#FCFBFC", padding: "12px 16px 14px" }}>
      <audio ref={audioRef} onLoadedMetadata={onLoaded} onTimeUpdate={onTick} onEnded={onEnded} onPause={() => setPlaying(false)} style={{ display: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={toggle} disabled={audioGone} title={audioGone ? "audio deleted — transcript only" : playing ? "pause" : "play"} className={playing ? "desk-pulse" : undefined} style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: audioGone ? "#D9D7DC" : "#A63D63", display: "flex", alignItems: "center", justifyContent: "center", cursor: audioGone ? "default" : "pointer", border: 0 }}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" onClick={() => skip(-30)} disabled={audioGone} title="Back 30 seconds" aria-label="Back 30 seconds" style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", border: "1px solid #E4E2E6", background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: audioGone ? "default" : "pointer", padding: 0, opacity: audioGone ? 0.5 : 1 }}>
          <span style={{ fontSize: 10, lineHeight: 1, color: "#454349" }}>↺</span>
          <span style={{ fontSize: 6.5, fontWeight: 700, color: "#96949B", lineHeight: 1 }}>30</span>
        </button>
        <button type="button" onClick={() => skip(30)} disabled={audioGone} title="Forward 30 seconds" aria-label="Forward 30 seconds" style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", border: "1px solid #E4E2E6", background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: audioGone ? "default" : "pointer", padding: 0, opacity: audioGone ? 0.5 : 1 }}>
          <span style={{ fontSize: 10, lineHeight: 1, color: "#454349" }}>↻</span>
          <span style={{ fontSize: 6.5, fontWeight: 700, color: "#96949B", lineHeight: 1 }}>30</span>
        </button>
        <div
          style={{ flex: 1, position: "relative", height: 34, margin: "0 -8px", padding: "0 8px", boxSizing: "border-box", cursor: audioGone ? "default" : "pointer", touchAction: "none" }}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={() => { scrubInfo.current = null; setScrub(null); }}
        >
          <svg width="100%" height="34" viewBox={`0 0 ${bars * 6 + 4} 34`} preserveAspectRatio="none" style={{ position: "absolute", inset: "0 8px", width: "calc(100% - 16px)" }}>
            {Array.from({ length: bars }).map((_, i) => {
              const h = 7 + ((i * 7919) % 17);
              const played = i / bars < frac;
              return <rect key={i} x={2 + i * 6} y={17 - h / 2} width="3" height={h} rx="1.5" fill={played ? "#A63D63" : "#DDD9DF"} />;
            })}
          </svg>
          {/* no transition while the finger owns it — the 200ms ease is what made
              scrubbing feel like the playhead was on a rubber band */}
          <span style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "#232227", borderRadius: 2, left: `calc(8px + (100% - 16px) * ${frac.toFixed(4)})`, transition: scrub !== null ? "none" : "left .2s" }} />
        </div>
        <span style={{ flex: "none", fontSize: 11, fontWeight: 600, color: "#454349", fontVariantNumeric: "tabular-nums" }}>{fmtSeconds(shown)} / {fmtSeconds(total)}</span>
        <button type="button" onClick={cycleRate} disabled={audioGone} title="Playback speed" aria-label="Playback speed" style={{ flex: "none", height: 24, minWidth: 40, borderRadius: 99, border: "1px solid #E4E2E6", background: rate !== 1 ? "#F6E3EB" : "#FFFFFF", color: rate !== 1 ? "#8C2F51" : "#66646C", fontSize: 10, fontWeight: 700, cursor: audioGone ? "default" : "pointer", padding: "0 8px", fontVariantNumeric: "tabular-nums" }}>
          {rate}×
        </button>
        <button type="button" onClick={stop} title="stop" style={{ width: 26, height: 26, flex: "none", borderRadius: "50%", border: "1px solid #E4E2E6", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <span style={{ width: 8, height: 8, background: "#454349", borderRadius: 1.5 }} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, background: "#FFFFFF", border: "1px solid #EDEBEE", borderRadius: 10, padding: "9px 12px" }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#A63D63", flex: "none", marginTop: 2 }}>{fmtSeconds(line?.start ?? t)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#454349", lineHeight: 1.55, fontStyle: "italic" }}>
            {line ? line.text : status === "transcribing" ? "transcribing — the line arrives when the segment is read" : transcript.length ? "…" : "no transcript yet"}
          </div>
          {line?.gloss && <div style={{ fontSize: 10.5, color: "#96949B", lineHeight: 1.5, marginTop: 2 }}>{line.gloss}</div>}
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: "#A9A7AE", marginTop: 8, fontFamily: DISPLAY }}>
        {audioGone ? "audio deleted — replay degrades to the transcript line · " : "scrub the waveform with a finger · "}the transcript line follows the playhead · audio es · notes en
      </div>
    </div>
  );
}
