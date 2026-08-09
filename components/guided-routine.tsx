"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Pause,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Loader2,
  Check,
  Flame,
  Clock,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateCaloriesBurned } from "@/components/active-workout";

// ─── Types ──────────────────────────────────────────────────────────

export interface RoutineExercise {
  name: string;
  reps?: string | number;
  targetWeightKg?: number;
}

interface GuidedRoutineProps {
  title: string;
  exercises: RoutineExercise[];
  /** Total session length. Rounds = totalMinutes * 60 / intervalSeconds. */
  totalMinutes: number;
  /** EMOM = 60. Other interval schemes (E2MOM etc.) welcome. */
  intervalSeconds?: number;
  workoutType?: string;
  units?: "metric" | "imperial";
  /**
   * Log the finished session. Return true on success — the overlay stays
   * open with a retry button until the log succeeds or the user explicitly
   * discards, so a session is never silently lost.
   */
  onFinish: (data: {
    durationMinutes: number;
    caloriesBurned: number;
    roundsCompleted: number;
    totalRounds: number;
  }) => Promise<boolean>;
  onExit: () => void;
}

// ─── Audio: shared context, unlocked from the launch tap ────────────
// iOS only allows audio started from a user gesture. Call unlockGuidedAudio()
// synchronously inside the click handler that opens this component.

let sharedAudioCtx: AudioContext | null = null;

export function unlockGuidedAudio() {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
    if (sharedAudioCtx.state === "suspended") void sharedAudioCtx.resume();
    // Play a silent tick so iOS considers the context "used" by the gesture
    const buffer = sharedAudioCtx.createBuffer(1, 1, 22050);
    const source = sharedAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(sharedAudioCtx.destination);
    source.start(0);
    // Warm speech synthesis inside the same gesture for round announcements
    if ("speechSynthesis" in window) {
      const warm = new SpeechSynthesisUtterance("");
      warm.volume = 0;
      window.speechSynthesis.speak(warm);
    }
  } catch {
    // Audio is a nice-to-have — the timer works without it
  }
}

function playTone(freq: number, durationMs: number, delayS = 0, gain = 0.14) {
  const ctx = sharedAudioCtx;
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

const cueSounds = {
  tick: () => playTone(880, 160),
  roundStart: () => {
    playTone(1318, 240);
    playTone(1318, 180, 0.08, 0.08);
  },
  finish: () => {
    playTone(523, 200);
    playTone(659, 200, 0.18);
    playTone(784, 220, 0.36);
    playTone(1047, 420, 0.54);
  },
};

function vibrate(pattern: number | number[]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

function announce(text: string, muted: boolean) {
  if (muted) return;
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

const COUNTDOWN_MS = 3000;

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function prescription(ex: RoutineExercise, units: "metric" | "imperial") {
  const reps =
    ex.reps !== undefined && ex.reps !== null && `${ex.reps}`.trim() !== ""
      ? `${ex.reps} × `
      : "";
  let weight = "";
  if (ex.targetWeightKg && ex.targetWeightKg > 0) {
    weight =
      units === "imperial"
        ? ` @ ${Math.round(ex.targetWeightKg * 2.205)} lbs`
        : ` @ ${ex.targetWeightKg} kg`;
  }
  return `${reps}${ex.name}${weight}`;
}

// ─── Component ──────────────────────────────────────────────────────

export function GuidedRoutine({
  title,
  exercises,
  totalMinutes,
  intervalSeconds = 60,
  workoutType = "hiit",
  units = "metric",
  onFinish,
  onExit,
}: GuidedRoutineProps) {
  const totalRounds = Math.max(
    1,
    Math.floor((totalMinutes * 60) / intervalSeconds)
  );
  const totalSessionMs = totalRounds * intervalSeconds * 1000;

  // Single timeline: negative elapsed = 3-2-1 countdown, then the session.
  const [elapsedMs, setElapsedMs] = useState(-COUNTDOWN_MS);
  const [phase, setPhase] = useState<"active" | "done">("active");
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("guided-routine-muted") === "1";
  });
  const [confirmExit, setConfirmExit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [doneStats, setDoneStats] = useState<{
    elapsedMs: number;
    rounds: number;
  } | null>(null);

  const startRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const lastCueSecondRef = useRef<number | null>(null);
  const lastRoundRef = useRef<number>(-1);
  const finishedRef = useRef(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("guided-routine-muted", next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next) {
        try {
          window.speechSynthesis?.cancel();
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  // ─── Screen wake lock — a timer you can't see is useless ────────
  useEffect(() => {
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        type WakeLockNavigator = Navigator & {
          wakeLock?: {
            request: (type: "screen") => Promise<{
              release: () => Promise<void>;
            }>;
          };
        };
        const wakeLock = (navigator as WakeLockNavigator).wakeLock;
        if (!wakeLock) return;
        const sentinel = await wakeLock.request("screen");
        if (cancelled) void sentinel.release();
        else wakeLockRef.current = sentinel;
      } catch {
        // Not fatal — user may have low battery mode on
      }
    };
    requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") requestWakeLock();
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

  // ─── Finish (natural or early) ──────────────────────────────────
  const finishSession = useCallback(
    (finalElapsedMs: number, completedRounds: number, playFanfare: boolean) => {
      // The 100ms interval can fire again before teardown — finish only once
      if (finishedRef.current) return;
      finishedRef.current = true;
      setDoneStats({
        elapsedMs: Math.max(0, Math.min(finalElapsedMs, totalSessionMs)),
        rounds: Math.max(0, Math.min(completedRounds, totalRounds)),
      });
      setPhase("done");
      if (playFanfare) {
        vibrate([120, 80, 120, 80, 240]);
        if (!muted) {
          cueSounds.finish();
          announce("Congratulations! Routine complete.", muted);
        }
      }
    },
    [totalSessionMs, totalRounds, muted]
  );

  // ─── The clock: wall-time based so phone throttling can't drift it ──
  useEffect(() => {
    if (phase !== "active" || isPaused) return;
    // Clock starts on mount (refs can't call Date.now() during render)
    if (startRef.current === null) startRef.current = Date.now() + COUNTDOWN_MS;
    const startedAt = startRef.current;
    const tick = () => {
      const now = Date.now();
      const elapsed = now - startedAt;
      setElapsedMs(elapsed);

      if (elapsed >= totalSessionMs) {
        finishSession(totalSessionMs, totalRounds, true);
        return;
      }

      // Sound cues keyed off whole-second transitions
      const inSession = elapsed >= 0;
      const roundIndex = inSession
        ? Math.floor(elapsed / (intervalSeconds * 1000))
        : -1;
      const msIntoRound = inSession
        ? elapsed - roundIndex * intervalSeconds * 1000
        : elapsed + COUNTDOWN_MS;
      const secondsLeft = inSession
        ? Math.ceil((intervalSeconds * 1000 - msIntoRound) / 1000)
        : Math.ceil(-elapsed / 1000);

      const cueKey = roundIndex * 1000 + secondsLeft;
      if (cueKey !== lastCueSecondRef.current) {
        lastCueSecondRef.current = cueKey;
        if (secondsLeft <= 3 && secondsLeft >= 1) {
          if (!muted) cueSounds.tick();
          vibrate(60);
        }
      }

      if (inSession && roundIndex !== lastRoundRef.current) {
        lastRoundRef.current = roundIndex;
        vibrate([90, 60, 90]);
        if (!muted) {
          cueSounds.roundStart();
          const ex = exercises[roundIndex % exercises.length];
          if (ex) {
            announce(`Round ${roundIndex + 1}. ${prescription(ex, units)}`, muted);
          }
        }
      }
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [
    phase,
    isPaused,
    muted,
    intervalSeconds,
    totalSessionMs,
    totalRounds,
    exercises,
    units,
    finishSession,
  ]);

  const togglePause = () => {
    if (phase !== "active") return;
    if (!isPaused) {
      pausedAtRef.current = Date.now();
      setIsPaused(true);
    } else {
      if (pausedAtRef.current && startRef.current !== null) {
        startRef.current += Date.now() - pausedAtRef.current;
      }
      pausedAtRef.current = null;
      setIsPaused(false);
    }
  };

  const handleLog = async () => {
    const stats = doneStats;
    if (!stats || saving || saved) return;
    setSaving(true);
    setSaveFailed(false);
    const durationMinutes = Math.max(1, Math.round(stats.elapsedMs / 60000));
    const ok = await onFinish({
      durationMinutes,
      caloriesBurned: estimateCaloriesBurned(workoutType, durationMinutes),
      roundsCompleted: stats.rounds,
      totalRounds,
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(onExit, 1200);
    } else {
      setSaveFailed(true);
    }
  };

  // ─── Derived display values ─────────────────────────────────────
  const inCountdown = elapsedMs < 0;
  const clampedElapsed = Math.max(0, Math.min(elapsedMs, totalSessionMs));
  const roundIndex = Math.min(
    Math.floor(clampedElapsed / (intervalSeconds * 1000)),
    totalRounds - 1
  );
  const msIntoRound = clampedElapsed - roundIndex * intervalSeconds * 1000;
  const roundProgress = inCountdown ? 0 : msIntoRound / (intervalSeconds * 1000);
  const secondsLeftInRound = Math.ceil(
    (intervalSeconds * 1000 - msIntoRound) / 1000
  );
  const countdownNumber = Math.max(1, Math.ceil(-elapsedMs / 1000));
  const currentExercise = exercises[roundIndex % exercises.length];
  const nextExercise = exercises[(roundIndex + 1) % exercises.length];
  const isFinalRound = roundIndex === totalRounds - 1;
  const urgent = !inCountdown && secondsLeftInRound <= 3;

  // Ring geometry
  const R = 118;
  const CIRC = 2 * Math.PI * R;

  const stats = doneStats;

  // Portal to <body> so ancestor CSS transforms can't trap the fixed overlay
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-background flex flex-col safe-area-top safe-area-bottom">
      {/* Ambient glow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-colors duration-500",
          urgent
            ? "bg-pitaya-deep/10"
            : phase === "done"
            ? "bg-pitaya/10"
            : "bg-pitaya/5"
        )}
      />

      {/* ─── Header ─── */}
      <div className="relative flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold truncate">{title}</h2>
          <p className="text-[11px] text-muted-foreground">
            {intervalSeconds === 60
              ? "EMOM"
              : `Every ${intervalSeconds}s`}{" "}
            • {totalRounds} rounds • {formatClock(totalRounds * intervalSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={toggleMuted}
            aria-label={muted ? "Unmute cues" : "Mute cues"}
          >
            {muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          {phase === "active" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => {
                setConfirmExit(true);
                if (!isPaused) togglePause();
              }}
              aria-label="End routine"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Done: congratulations + log ─── */}
      {phase === "done" && stats ? (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-pitaya/15 flex items-center justify-center">
            <Trophy className="h-12 w-12 text-pitaya" />
          </div>
          <div>
            <h3 className="text-2xl font-bold">
              {stats.rounds >= totalRounds
                ? "Congratulations! 🎉"
                : "Nice work! 💪"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.rounds >= totalRounds
                ? "Full routine complete."
                : `You finished ${stats.rounds} of ${totalRounds} rounds.`}
            </p>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <span className="flex flex-col items-center gap-1">
              <Clock className="h-4 w-4 text-pitaya-deep" />
              <span className="font-mono font-bold">
                {formatClock(Math.round(stats.elapsedMs / 1000))}
              </span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <RotateCw className="h-4 w-4 text-pitaya-deep" />
              <span className="font-mono font-bold">
                {stats.rounds}/{totalRounds}
              </span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <Flame className="h-4 w-4 text-pitaya" />
              <span className="font-mono font-bold">
                ~
                {estimateCaloriesBurned(
                  workoutType,
                  Math.max(1, Math.round(stats.elapsedMs / 60000))
                )}{" "}
                cal
              </span>
            </span>
          </div>

          <div className="w-full max-w-xs space-y-2">
            <Button
              className="w-full gap-2 h-12 text-base"
              onClick={handleLog}
              disabled={saving || saved}
            >
              {saved ? (
                <>
                  <Check className="h-5 w-5" /> Logged!
                </>
              ) : saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Logging…
                </>
              ) : saveFailed ? (
                <>Retry log</>
              ) : (
                <>Log workout</>
              )}
            </Button>
            {saveFailed && (
              <p className="text-xs text-destructive">
                Couldn&apos;t save — check your connection and tap again.
              </p>
            )}
            {!saved && (
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={onExit}
                disabled={saving}
              >
                Discard session
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* ─── Active: countdown + rounds ─── */
        <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-6">
          {/* Progress wheel */}
          <div className="relative">
            <svg
              width={280}
              height={280}
              viewBox="0 0 280 280"
              className="-rotate-90"
            >
              <circle
                cx={140}
                cy={140}
                r={R}
                fill="none"
                strokeWidth={10}
                className="stroke-secondary"
              />
              <circle
                cx={140}
                cy={140}
                r={R}
                fill="none"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - roundProgress)}
                className={cn(
                  "transition-[stroke-dashoffset] duration-100 ease-linear",
                  urgent ? "stroke-pitaya-deep" : "stroke-pitaya"
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              {inCountdown ? (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Get ready
                  </p>
                  <p
                    key={countdownNumber}
                    className="text-8xl font-bold font-mono text-pitaya count-up"
                  >
                    {countdownNumber}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Round {roundIndex + 1} of {totalRounds}
                  </p>
                  <p
                    className={cn(
                      "text-7xl font-bold font-mono tabular-nums",
                      urgent && "text-pitaya-deep"
                    )}
                  >
                    {secondsLeftInRound}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {formatClock(Math.floor(clampedElapsed / 1000))} /{" "}
                    {formatClock(totalRounds * intervalSeconds)}
                  </p>
                </>
              )}
            </div>
            {isPaused && !confirmExit && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-sm">
                <p className="text-lg font-bold uppercase tracking-widest">
                  Paused
                </p>
              </div>
            )}
          </div>

          {/* Current + next exercise */}
          <div className="text-center space-y-3 min-h-[5.5rem]">
            <p className="text-2xl font-bold leading-tight">
              {inCountdown
                ? currentExercise
                  ? `First: ${prescription(currentExercise, units)}`
                  : title
                : currentExercise
                ? prescription(currentExercise, units)
                : title}
            </p>
            {!inCountdown && !isFinalRound && nextExercise && (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 rounded-full px-3 py-1.5">
                Next · {prescription(nextExercise, units)}
              </p>
            )}
            {!inCountdown && isFinalRound && (
              <p className="inline-flex items-center gap-1.5 text-xs text-pitaya-deep bg-pitaya/10 rounded-full px-3 py-1.5">
                Final round — empty the tank 🔥
              </p>
            )}
          </div>

          {/* Overall round progress */}
          <div className="w-full max-w-xs">
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-pitaya rounded-full transition-all duration-500"
                style={{
                  width: `${
                    inCountdown ? 0 : ((roundIndex + roundProgress) / totalRounds) * 100
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Controls */}
          <Button
            variant="outline"
            size="icon"
            className="h-14 w-14 rounded-full"
            onClick={togglePause}
            aria-label={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? (
              <Play className="h-6 w-6" />
            ) : (
              <Pause className="h-6 w-6" />
            )}
          </Button>
        </div>
      )}

      {/* ─── End-early confirm ─── */}
      {confirmExit && phase === "active" && (
        <div className="absolute inset-0 z-10 bg-background/85 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-xs bg-card border border-border rounded-2xl p-5 space-y-3 text-center">
            <h3 className="font-bold">End routine?</h3>
            <p className="text-xs text-muted-foreground">
              You&apos;re {Math.max(0, roundIndex + (inCountdown ? 0 : 1))} of{" "}
              {totalRounds} rounds in.
            </p>
            <div className="space-y-2 pt-1">
              <Button
                className="w-full"
                onClick={() => {
                  setConfirmExit(false);
                  finishSession(clampedElapsed, roundIndex, false);
                }}
              >
                Finish & log
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setConfirmExit(false);
                  togglePause();
                }}
              >
                Keep going
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={onExit}
              >
                Discard session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
