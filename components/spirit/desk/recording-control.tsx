"use client";

// Recording in the corner (01) and the replay bar (06a): start · level ·
// elapsed · pause while he writes; afterwards play/pause, the waveform with
// the played portion and playhead, time / total, stop, and the transcript
// line for that second (ES, EN gloss under it). Audio plays segment by
// segment from Postgres; replay degrades to the transcript when audio is
// gone.

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [segIdx, setSegIdx] = useState<number | null>(null);
  const pendingSeek = useRef<number | null>(null);

  const segFor = (sec: number) => segments.find((s) => sec >= s.startSec && sec < s.startSec + s.durationSec + 0.05) ?? segments[segments.length - 1] ?? null;

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
    if (segIdx !== seg.index) {
      setSegIdx(seg.index);
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
    if (el && pendingSeek.current !== null) {
      el.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
  };
  const onTick = () => {
    const el = audioRef.current;
    if (!el || segIdx === null) return;
    const seg = segments.find((s) => s.index === segIdx);
    const sec = (seg?.startSec ?? 0) + el.currentTime;
    setT(sec);
    onTime?.(sec);
  };
  const onEnded = () => {
    if (segIdx === null) return;
    const next = segments.find((s) => s.index === segIdx + 1);
    if (next) load(next.startSec, true);
    else setPlaying(false);
  };
  const toggle = () => {
    const el = audioRef.current;
    if (!el || audioGone) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else if (segIdx === null) load(t, true);
    else el.play().then(() => setPlaying(true)).catch(() => {});
  };
  const stop = () => {
    const el = audioRef.current;
    el?.pause();
    setPlaying(false);
    setT(0);
    onTime?.(0);
  };

  const line = useMemo(() => {
    let best: TranscriptLine | null = null;
    for (const l of transcript) {
      if (l.start <= t + 0.2) best = l;
      else break;
    }
    return best;
  }, [transcript, t]);

  const total = Math.max(duration, 1);
  const bars = 66;
  const frac = Math.min(1, t / total);
  return (
    <div style={{ flex: "none", borderTop: "1px solid #EDEBEE", background: "#FCFBFC", padding: "12px 16px 14px" }}>
      <audio ref={audioRef} onLoadedMetadata={onLoaded} onTimeUpdate={onTick} onEnded={onEnded} onPause={() => setPlaying(false)} style={{ display: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={toggle} disabled={audioGone} title={audioGone ? "audio deleted — transcript only" : playing ? "pause" : "play"} style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: audioGone ? "#D9D7DC" : "#A63D63", display: "flex", alignItems: "center", justifyContent: "center", cursor: audioGone ? "default" : "pointer", border: 0 }}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div
          style={{ flex: 1, position: "relative", height: 34, cursor: "pointer", touchAction: "none" }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            load(f * total, playing || true);
          }}
        >
          <svg width="100%" height="34" viewBox={`0 0 ${bars * 6 + 4} 34`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
            {Array.from({ length: bars }).map((_, i) => {
              const h = 7 + ((i * 7919) % 17);
              const played = i / bars < frac;
              return <rect key={i} x={2 + i * 6} y={17 - h / 2} width="3" height={h} rx="1.5" fill={played ? "#A63D63" : "#DDD9DF"} />;
            })}
          </svg>
          <span style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "#232227", borderRadius: 2, left: `${frac * 100}%`, transition: "left .2s" }} />
        </div>
        <span style={{ flex: "none", fontSize: 11, fontWeight: 600, color: "#454349", fontVariantNumeric: "tabular-nums" }}>{fmtSeconds(t)} / {fmtSeconds(total)}</span>
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
