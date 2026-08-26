"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";
import type { SequenceStep } from "@/lib/sequences";

// EMOM runner — the protocol-true live session for kind="emom" routines
// (deferred-items "training block", REMAINING web half). Ported from the
// watch design's live sequence screens (docs/design/pitaya-watch.dc.html,
// screens 05/08): dark canvas, DC74A0 minute ring draining on the :60,
// ROUND X/Y micro-label, :SS countdown, raspberry movement line, "next ·"
// preview. Phone adaptations (no web design comp exists — surfaced
// deviation): a 3-2-1 get-ready intro, pause/mute/end controls, and a
// save panel at the end. No manual set logging — finishing the clock IS
// the log; the page derives sets from rounds completed. A session is
// never discarded silently: ending early always offers Finish & save.

const COUNTDOWN_MS = 3000;
const INTERVAL_MS = 60_000; // EMOM = every minute on the minute

// ── Audio: shared context unlocked inside the launch tap (iOS rule) ──

let runnerAudioCtx: AudioContext | null = null;

export function unlockRunnerAudio() {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return;
    if (!runnerAudioCtx) runnerAudioCtx = new Ctor();
    if (runnerAudioCtx.state === "suspended") void runnerAudioCtx.resume();
    const buffer = runnerAudioCtx.createBuffer(1, 1, 22050);
    const source = runnerAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(runnerAudioCtx.destination);
    source.start(0);
    if ("speechSynthesis" in window) {
      const warm = new SpeechSynthesisUtterance("");
      warm.volume = 0;
      window.speechSynthesis.speak(warm);
    }
  } catch {
    // audio is a cue, not a dependency — the clock runs without it
  }
}

function tone(freq: number, durationMs: number, delayS = 0, gain = 0.14) {
  const ctx = runnerAudioCtx;
  if (!ctx || ctx.state !== "running") return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + delayS;
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.05);
  } catch {
    // ignore
  }
}

export const runnerCues = {
  tick: () => tone(880, 160),
  roundStart: () => {
    tone(1318, 240);
    tone(1318, 180, 0.08, 0.08);
  },
  finish: () => {
    tone(523, 200);
    tone(659, 200, 0.18);
    tone(784, 220, 0.36);
    tone(1047, 420, 0.54);
  },
};

function vibrate(pattern: number | number[]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

// ── Display helpers ──

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

function clock(totalSeconds: number) {
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(Math.floor(totalSeconds % 60))}`;
}

function movementLabel(step: SequenceStep) {
  // A to-failure step reads AFTER the movement ("Bicep Curl — to failure"),
  // not before it, because "to failure Bicep Curl" is nonsense. Rep and
  // second doses keep their leading position ("10 Swings").
  const weight = step.weightKg ? ` · ${step.weightKg} kg` : "";
  if (step.toFailure) return `${step.exerciseName} — to failure${weight}`;
  const dose = step.reps ? `${step.reps}` : step.seconds ? `${step.seconds}s` : "";
  return `${dose ? dose + " " : ""}${step.exerciseName}${weight}`;
}

// ── Component ──

interface EmomRunnerProps {
  routineName: string;
  durationMinutes: number;
  steps: SequenceStep[];
  saving: boolean;
  /** Log the session. Resolve true on success; false keeps the save panel
   *  up with a retry so the session is never lost to a network blip. */
  onFinish: (result: {
    roundsCompleted: number;
    totalRounds: number;
    elapsedSeconds: number;
  }) => Promise<boolean>;
  onExit: () => void;
}

export function EmomRunner({
  routineName,
  durationMinutes,
  steps,
  saving,
  onFinish,
  onExit,
}: EmomRunnerProps) {
  const totalRounds = Math.max(1, Math.round(durationMinutes));
  const totalMs = totalRounds * INTERVAL_MS;

  // One timeline: negative elapsed = the 3-2-1 intro, then the session.
  const [elapsedMs, setElapsedMs] = useState(-COUNTDOWN_MS);
  const [phase, setPhase] = useState<"active" | "done">("active");
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [doneStats, setDoneStats] = useState<{
    elapsedMs: number;
    rounds: number;
  } | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("emom-runner-muted") === "1";
  });

  const startRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const lastCueRef = useRef<number | null>(null);
  const lastRoundRef = useRef(-1);
  const finishedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("emom-runner-muted", next ? "1" : "0");
        if (next) window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      return next;
    });
  };

  // A timer you can't see is useless — hold a screen wake lock.
  useEffect(() => {
    let cancelled = false;
    const request = async () => {
      try {
        type WakeLockNavigator = Navigator & {
          wakeLock?: {
            request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
          };
        };
        const wl = (navigator as WakeLockNavigator).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request("screen");
        if (cancelled) void sentinel.release();
        else wakeLockRef.current = sentinel;
      } catch {
        // low-power mode etc. — not fatal
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLockRef.current?.release().catch(() => {});
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  const finishSession = useCallback(
    (finalElapsedMs: number, rounds: number, fanfare: boolean) => {
      // The 100ms interval can fire once more before teardown — finish once.
      if (finishedRef.current) return;
      finishedRef.current = true;
      setDoneStats({
        elapsedMs: Math.max(0, Math.min(finalElapsedMs, totalMs)),
        rounds: Math.max(0, Math.min(rounds, totalRounds)),
      });
      setPhase("done");
      if (fanfare) {
        vibrate([120, 80, 120, 80, 240]);
        if (!muted) {
          runnerCues.finish();
          speak("Congratulations. E-mom complete.");
        }
      }
    },
    [totalMs, totalRounds, muted]
  );

  // Wall-clock engine — phone timer throttling can't drift it.
  useEffect(() => {
    if (phase !== "active" || paused) return;
    if (startRef.current === null) startRef.current = Date.now() + COUNTDOWN_MS;
    const startedAt = startRef.current;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= totalMs) {
        finishSession(totalMs, totalRounds, true);
        return;
      }
      const inSession = elapsed >= 0;
      const round = inSession ? Math.floor(elapsed / INTERVAL_MS) : -1;
      const msIntoRound = inSession ? elapsed - round * INTERVAL_MS : 0;
      const secLeft = inSession
        ? Math.ceil((INTERVAL_MS - msIntoRound) / 1000)
        : Math.ceil(-elapsed / 1000);

      const cueKey = round * 1000 + secLeft;
      if (cueKey !== lastCueRef.current) {
        lastCueRef.current = cueKey;
        if (secLeft <= 3 && secLeft >= 1) {
          if (!muted) runnerCues.tick();
          vibrate(60);
        }
      }
      if (inSession && round !== lastRoundRef.current) {
        lastRoundRef.current = round;
        vibrate([90, 60, 90]);
        if (!muted) {
          runnerCues.roundStart();
          const step = steps[round % steps.length];
          if (step) speak(`Round ${round + 1}. ${movementLabel(step)}`);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [phase, paused, muted, steps, totalMs, totalRounds, finishSession]);

  const togglePause = () => {
    if (phase !== "active") return;
    if (!paused) {
      pausedAtRef.current = Date.now();
      setPaused(true);
    } else {
      if (pausedAtRef.current && startRef.current !== null) {
        startRef.current += Date.now() - pausedAtRef.current;
      }
      pausedAtRef.current = null;
      setPaused(false);
    }
  };

  const handleSave = async () => {
    if (!doneStats || saving) return;
    setSaveFailed(false);
    const ok = await onFinish({
      roundsCompleted: doneStats.rounds,
      totalRounds,
      elapsedSeconds: Math.round(doneStats.elapsedMs / 1000),
    });
    if (!ok) setSaveFailed(true);
  };

  // Derived display values
  const inCountdown = elapsedMs < 0;
  const clamped = Math.max(0, Math.min(elapsedMs, totalMs));
  const roundIdx = Math.min(Math.floor(clamped / INTERVAL_MS), totalRounds - 1);
  const msLeftInRound = INTERVAL_MS - (clamped - roundIdx * INTERVAL_MS);
  const secLeftInRound = Math.ceil(msLeftInRound / 1000);
  const fracLeft = inCountdown ? 1 : msLeftInRound / INTERVAL_MS;
  const countdownNum = Math.max(1, Math.ceil(-elapsedMs / 1000));
  const step = steps[roundIdx % steps.length];
  const next = steps[(roundIdx + 1) % steps.length];
  const finalRound = roundIdx === totalRounds - 1;

  // Minute ring — design geometry: dasharray C, offset grows as the
  // minute drains (pitaya-watch screen 08).
  const R = 150;
  const C = 2 * Math.PI * R;

  return (
    <SheetPortal>
      <div className="fixed inset-0 z-[90] flex flex-col bg-[#131216] text-[#F2F1F2]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-[max(env(safe-area-inset-top),20px)]">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold tracking-[0.18em] text-[#96949B]">
              EMOM · {totalRounds} MIN
            </p>
            <p
              className="truncate text-[17px] font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {routineName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMuted}
              aria-label={muted ? "Unmute cues" : "Mute cues"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#3A393E] text-[15px]"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {phase === "active" && (
              <button
                onClick={() => {
                  setConfirmEnd(true);
                  if (!paused) togglePause();
                }}
                aria-label="End session"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#3A393E] text-[16px] leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {phase === "done" && doneStats ? (
          /* ── Done: congratulations + save (never a silent discard) ── */
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect
                x="7"
                y="0"
                width="9.9"
                height="9.9"
                transform="rotate(45 7 2)"
                fill="#DC74A0"
              />
            </svg>
            <p
              className="mt-4 text-[30px] font-bold leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {doneStats.rounds >= totalRounds ? "Congratulations." : "Nice work."}
            </p>
            <p className="mt-1.5 text-[13px] text-[#96949B]">
              {doneStats.rounds >= totalRounds
                ? "Every minute, on the minute. All of them."
                : `${doneStats.rounds} of ${totalRounds} rounds in the bank.`}
            </p>
            <div className="mt-8 flex items-end gap-10">
              <div>
                <p
                  className="text-[38px] font-bold tabular-nums leading-none"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {clock(Math.round(doneStats.elapsedMs / 1000))}
                </p>
                <p className="mt-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#96949B]">
                  TIME
                </p>
              </div>
              <div>
                <p
                  className="text-[38px] font-bold tabular-nums leading-none text-[#DC74A0]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  R{doneStats.rounds}
                  <span className="text-[24px] text-[#66646C]">/{totalRounds}</span>
                </p>
                <p className="mt-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#96949B]">
                  ROUNDS
                </p>
              </div>
            </div>
            <div className="mt-10 w-full max-w-xs">
              {doneStats.rounds > 0 ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full rounded-full bg-[#A63D63] py-[13px] text-sm font-semibold text-white disabled:opacity-60"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {saving
                      ? "Saving…"
                      : saveFailed
                        ? "Retry save"
                        : "Save session"}
                  </button>
                  {saveFailed && (
                    <p className="mt-2 text-[11.5px] text-[#E06060]">
                      Couldn&apos;t reach the server — your rounds are still
                      here. Tap again.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[12px] text-[#96949B]">
                  No full rounds yet — nothing to save.
                </p>
              )}
              <button
                onClick={onExit}
                disabled={saving}
                className="mt-3 w-full py-2 text-[12.5px] font-semibold text-[#96949B]"
              >
                {doneStats.rounds > 0 ? "Discard session" : "Close"}
              </button>
            </div>
          </div>
        ) : (
          /* ── Active: intro countdown + work minutes ── */
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="relative">
              <svg width={340} height={340} viewBox="0 0 340 340">
                <circle
                  cx={170}
                  cy={170}
                  r={R}
                  fill="none"
                  stroke="#2A1420"
                  strokeWidth={12}
                />
                <circle
                  cx={170}
                  cy={170}
                  r={R}
                  fill="none"
                  stroke="#DC74A0"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - fracLeft)}
                  transform="rotate(-90 170 170)"
                  className="transition-[stroke-dashoffset] duration-200 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {inCountdown ? (
                  <>
                    <p className="text-[12px] font-bold tracking-[0.18em] text-[#96949B]">
                      GET READY
                    </p>
                    <p
                      key={countdownNum}
                      className="mt-1 text-[96px] font-bold leading-none text-[#DC74A0] tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {countdownNum}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-bold tracking-[0.18em] text-[#96949B]">
                      ROUND {roundIdx + 1} / {totalRounds}
                    </p>
                    <p
                      className="mt-1 text-[84px] font-bold leading-none tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      :{pad(secLeftInRound)}
                    </p>
                    <p className="mt-2 text-[12px] tabular-nums text-[#66646C]">
                      {clock(Math.floor(clamped / 1000))} /{" "}
                      {clock(totalRounds * 60)}
                    </p>
                  </>
                )}
              </div>
              {paused && !confirmEnd && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#131216]/75">
                  <p
                    className="text-[20px] font-bold tracking-[0.22em]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    PAUSED
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-[74px] text-center">
              <p
                className="text-[24px] font-bold uppercase leading-tight text-[#DC74A0]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {inCountdown && step
                  ? `First · ${movementLabel(step)}`
                  : step
                    ? movementLabel(step)
                    : routineName}
              </p>
              {!inCountdown && !finalRound && next && (
                <p className="mt-1.5 text-[13.5px] lowercase text-[#96949B]">
                  next · {movementLabel(next)}
                </p>
              )}
              {!inCountdown && finalRound && (
                <p className="mt-1.5 text-[13.5px] text-[#DCA8BE]">
                  final round — empty the tank
                </p>
              )}
            </div>

            <button
              onClick={togglePause}
              className="mt-6 rounded-full border border-[#3A393E] px-8 py-[11px] text-[13px] font-semibold text-[#F2F1F2]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}

        {/* End-early confirm */}
        {confirmEnd && phase === "active" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131216]/85 px-8">
            <div className="w-full max-w-xs rounded-[18px] border border-[#3A393E] bg-[#1C1B1F] p-5 text-center">
              <p
                className="text-[17px] font-bold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                End the EMOM?
              </p>
              <p className="mt-1 text-[12px] text-[#96949B]">
                {roundIdx} full round{roundIdx === 1 ? "" : "s"} done so far.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  onClick={() => {
                    setConfirmEnd(false);
                    finishSession(clamped, roundIdx, false);
                  }}
                  className="rounded-full bg-[#A63D63] py-[11px] text-[13px] font-semibold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Finish &amp; save
                </button>
                <button
                  onClick={() => {
                    setConfirmEnd(false);
                    togglePause();
                  }}
                  className="rounded-full border border-[#3A393E] py-[11px] text-[13px] font-semibold text-[#F2F1F2]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Keep going
                </button>
                <button
                  onClick={onExit}
                  className="py-1.5 text-[12px] font-semibold text-[#96949B]"
                >
                  Discard session
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SheetPortal>
  );
}
