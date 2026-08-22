"use client";

// The sermon recorder (01/06): MediaRecorder in ~2-minute segments — each
// a standalone playable file, uploaded as it completes, so a dropped
// connection never loses more than two minutes and a crash keeps what was
// already sent. Strokes timestamp against `elapsedSeconds()`.

import { getOrCreateMicrophoneStream, deactivateMicrophoneStream } from "@/lib/microphone";

export const SEGMENT_SECONDS = 120;

export interface RecorderEvents {
  onSegment?: (index: number, uploaded: boolean, error?: string) => void;
  onLevel?: (rms: number) => void;
  onStateChange?: (state: RecorderState) => void;
}

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export class SermonRecorder {
  recordingId: string;
  state: RecorderState = "idle";
  startEpoch = 0;
  private mime: string;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private segIndex = 0;
  private segStartSec = 0;
  private segStartedAt = 0;
  private pausedAccum = 0;
  private pausedSince: number | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private analyser: AnalyserNode | null = null;
  private levelRaf: number | null = null;
  private audioCtx: AudioContext | null = null;
  events: RecorderEvents;
  pendingUploads = 0;

  constructor(recordingId: string, events: RecorderEvents = {}) {
    this.recordingId = recordingId;
    this.events = events;
    this.mime = SermonRecorder.bestMime();
  }

  static bestMime(): string {
    if (typeof MediaRecorder === "undefined") return "audio/mp4";
    for (const m of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return "audio/mp4";
  }

  get mimeType() {
    return this.mime.split(";")[0];
  }

  elapsedSeconds(): number {
    if (!this.startEpoch) return 0;
    const paused = this.pausedAccum + (this.pausedSince ? Date.now() - this.pausedSince : 0);
    return Math.max(0, (Date.now() - this.startEpoch - paused) / 1000);
  }

  async start() {
    this.stream = await getOrCreateMicrophoneStream();
    this.startEpoch = Date.now();
    this.state = "recording";
    this.events.onStateChange?.(this.state);
    this.startLevelMeter();
    this.startSegment();
  }

  private startLevelMeter() {
    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream!);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      const buf = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser || this.state === "stopped") return;
        this.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        this.events.onLevel?.(Math.sqrt(sum / buf.length));
        this.levelRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // no meter — recording still works
    }
  }

  private startSegment() {
    if (!this.stream) return;
    this.chunks = [];
    this.segStartSec = this.elapsedSeconds();
    this.segStartedAt = Date.now();
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime, audioBitsPerSecond: 64_000 });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mimeType });
      const index = this.segIndex++;
      const duration = (Date.now() - this.segStartedAt) / 1000;
      void this.upload(index, this.segStartSec, duration, blob);
      if (this.state === "recording") this.startSegment();
    };
    rec.start();
    this.rec = rec;
    this.timer = setTimeout(() => {
      if (this.rec && this.rec.state === "recording") this.rec.stop();
    }, SEGMENT_SECONDS * 1000);
  }

  private async upload(index: number, startSec: number, durationSec: number, blob: Blob, attempt = 0): Promise<void> {
    if (blob.size < 200) return;
    this.pendingUploads++;
    try {
      const res = await fetch(`/api/spirit/recordings/${this.recordingId}/segments`, {
        method: "POST",
        headers: {
          "Content-Type": this.mimeType,
          "x-seg-index": String(index),
          "x-seg-start": String(startSec),
          "x-seg-duration": String(durationSec),
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      this.events.onSegment?.(index, true);
    } catch (err) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        this.pendingUploads--;
        return this.upload(index, startSec, durationSec, blob, attempt + 1);
      }
      this.events.onSegment?.(index, false, (err as Error).message);
    } finally {
      this.pendingUploads--;
    }
  }

  pause() {
    if (this.state !== "recording") return;
    this.state = "paused";
    this.pausedSince = Date.now();
    if (this.timer) clearTimeout(this.timer);
    if (this.rec && this.rec.state === "recording") this.rec.stop(); // closes the segment
    this.events.onStateChange?.(this.state);
  }

  resume() {
    if (this.state !== "paused") return;
    if (this.pausedSince) this.pausedAccum += Date.now() - this.pausedSince;
    this.pausedSince = null;
    this.state = "recording";
    this.events.onStateChange?.(this.state);
    this.startSegment();
  }

  async stop(): Promise<number> {
    if (this.state === "stopped") return this.elapsedSeconds();
    const total = this.elapsedSeconds();
    this.state = "stopped";
    if (this.timer) clearTimeout(this.timer);
    if (this.rec && this.rec.state === "recording") {
      await new Promise<void>((resolve) => {
        const r = this.rec!;
        const prev = r.onstop;
        r.onstop = (ev) => {
          prev?.call(r, ev);
          resolve();
        };
        r.stop();
      });
    }
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    this.audioCtx?.close().catch(() => {});
    deactivateMicrophoneStream();
    this.events.onStateChange?.(this.state);
    // let the last upload start
    await new Promise((r) => setTimeout(r, 50));
    return total;
  }
}
