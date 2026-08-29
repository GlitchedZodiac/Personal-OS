"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDataLoggedListener } from "@/components/use-data-logged";
import { SheetPortal } from "@/components/sheet-portal";
import { TrainingWeek } from "@/components/training-week";
import {
  EmomRunner,
  runnerCues,
  unlockRunnerAudio,
} from "@/components/emom-runner";
import type { SequenceStep } from "@/lib/sequences";
import { tonnageLabel } from "@/lib/format-training";

// Pitaya Train — full port of the design's Train screen (docs/design/
// pitaya-app.dc.html, screen 3) plus its Live-workout and Routines sheets
// (screen 5 overlays). All data is real: weekly tonnage, PR banner, today's
// session with per-row PR chips, 8-week volume bars, latest trail. Surfaced
// deviations from the design demo: the live sheet has no watch-mirroring
// chip or live heart rate yet (both arrive with the watch build), and the
// trail card's elevation sparkline waits for real elevation-series data.

interface TrainData {
  date: string;
  weekNumber: number;
  weekVolumeKg: number;
  weekOverview: {
    sessions: number;
    activeMinutes: number;
    kcal: number;
    outdoorKm: number;
  };
  latestPR: {
    exerciseName: string;
    kind: string;
    value: number;
    unit: string;
    previousValue: number | null;
    achievedAt: string;
    isToday: boolean;
  } | null;
  session: {
    rows: { name: string; detail: string; isPR: boolean; workSeconds?: number }[];
    durationMinutes: number;
    startedAt: string;
    routine: { name: string; roundsCompleted: number | null } | null;
  } | null;
  weeklyVolume: { weekStart: string; label: string; volumeKg: number }[];
  pctChange: number | null;
  prWall: {
    exercise: string;
    exerciseName: string;
    valueKg: number;
    previousKg: number | null;
    achievedAt: string;
    workoutLogId: string | null;
  }[];
  movementTonnage: { key: string; name: string; totalKg: number; weeksActive: number }[];
  latestTrail: {
    id: string;
    startedAt: string;
    workoutType: string;
    description: string | null;
    distanceKm: number;
    elevationGainM: number | null;
    durationMinutes: number;
    avgHeartRateBpm: number | null;
    altitudeSpark: number[] | null;
  } | null;
  latestEffort: {
    startedAt: string;
    workoutType: string;
    description: string | null;
    durationMinutes: number;
    avgHeartRateBpm: number | null;
    timeInZones: { seconds: number[]; pct: number[]; totalSeconds: number };
    loadScore: number | null;
    relativeEffort: number | null;
  } | null;
}

interface Routine {
  id: string;
  name: string;
  kind: string;
  restSecondsDefault: number | null;
  durationMinutes: number | null;
  rounds: number | null;
  steps: SequenceStep[];
}

// Design's 8-bar color ramp, oldest → current week.
const BAR_COLORS = [
  "#EADFE5",
  "#EADFE5",
  "#EADFE5",
  "#DCA8BE",
  "#DCA8BE",
  "#C97D9C",
  "#C97D9C",
  "#A63D63",
];

const fmt = (n: number) => n.toLocaleString("en-US");

// PR copy that says what actually happened. "weight" records are the heaviest
// bell ever moved on a movement — the only PR kind that means the same thing
// for every exercise. "volume" records are session tonnage, so they get their
// own wording instead of borrowing the heaviest-bell headline.
function prHeadline(pr: NonNullable<TrainData["latestPR"]>) {
  return pr.kind === "weight"
    ? `${pr.exerciseName} — ${fmt(pr.value)} kg`
    : `${pr.exerciseName} — ${tonnageLabel(pr.value)} in a session`;
}

function prSubline(pr: NonNullable<TrainData["latestPR"]>) {
  if (pr.previousValue == null) {
    return pr.kind === "weight"
      ? "First time on record at this bell."
      : "First session on record at this tonnage.";
  }
  const delta = pr.value - pr.previousValue;
  return pr.kind === "weight"
    ? `Beat your old ${fmt(pr.previousValue)} kg by ${fmt(
        Math.round(delta * 10) / 10
      )} kg.`
    : `Beat your old best by ${tonnageLabel(delta)}.`;
}

function stepSummary(steps: SequenceStep[], durationMinutes?: number | null) {
  const names = steps
    .slice(0, 4)
    .map((s) => s.exerciseName.toLowerCase())
    .join(" · ");
  return durationMinutes ? `${durationMinutes} min — ${names}` : names;
}

// Sets-per-step: builder stores it alongside reps; timed steps run once.
function targetSetsFor(step: SequenceStep) {
  const withSets = step as SequenceStep & { sets?: number };
  if (withSets.sets && withSets.sets > 0) return withSets.sets;
  return step.seconds ? 1 : 5;
}

interface LiveSession {
  routine: Routine;
  stepIdx: number;
  setsDone: number[];
  startedAt: number;
}

// A routine runs on the EMOM clock when it's tagged emom, or when its
// name says so (routines predating the kind selector default to
// "straight"). Length falls back to 20 minutes if unset.
function isGuidedEmom(routine: Routine) {
  return routine.kind === "emom" || /\bemom\b/i.test(routine.name);
}

function emomMinutes(routine: Routine) {
  return routine.durationMinutes ?? 20;
}

export default function TrainPage() {
  const router = useRouter();
  const [data, setData] = useState<TrainData | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [showRoutines, setShowRoutines] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [live, setLive] = useState<LiveSession | null>(null);
  const [emomLive, setEmomLive] = useState<Routine | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restLeft, setRestLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    const local = new Date();
    const dateStr = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/health/train?date=${dateStr}&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
    fetch("/api/health/sequences")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRoutines(Array.isArray(rows) ? rows : []))
      .catch(() => setRoutines([]));
  }, []);

  useEffect(load, [load]);
  useDataLoggedListener(load);

  // Live session clock
  useEffect(() => {
    if (!live) return;
    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - live.startedAt) / 1000)),
      1000
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [live]);

  const startLive = (routine: Routine) => {
    // iOS only allows audio born from a tap — unlock before any runner UI.
    unlockRunnerAudio();
    setShowRoutines(false);
    setShowStartPicker(false);
    // EMOM routines dive straight into the protocol clock — no set
    // counting; the clock is the log (deferred-items training block).
    // The builder defaults kind to "straight", so routines built before
    // the kind selector existed are matched by name too; duration falls
    // back to 20 min rather than silently dropping to the manual sheet.
    // The picker's "EMOM · guided" chip shows which routines run guided.
    if (isGuidedEmom(routine) && routine.steps.length > 0) {
      setEmomLive(routine);
      return;
    }
    setLive({
      routine,
      stepIdx: 0,
      setsDone: routine.steps.map(() => 0),
      startedAt: Date.now(),
    });
    setElapsed(0);
    setRestEndsAt(null);
  };

  const openStart = () => {
    if (!routines || routines.length === 0) {
      toast("Build a routine first — Routines → Build new routine.");
      setShowRoutines(true);
      return;
    }
    setShowStartPicker(true);
  };

  const bumpSet = (delta: number) => {
    setLive((prev) => {
      if (!prev) return prev;
      const setsDone = [...prev.setsDone];
      setsDone[prev.stepIdx] = Math.max(0, setsDone[prev.stepIdx] + delta);
      // A logged set starts the rest clock (circuit/straight protocols).
      if (delta > 0) {
        const step = prev.routine.steps[prev.stepIdx];
        const rest = step.restSeconds ?? prev.routine.restSecondsDefault;
        if (rest && rest > 0) setRestEndsAt(Date.now() + rest * 1000);
      }
      return { ...prev, setsDone };
    });
  };

  // Rest countdown — sage REST state from the watch design (screen 09),
  // folded into the live sheet. Beeps out the last 3 seconds.
  useEffect(() => {
    if (!restEndsAt) return;
    let lastWhole: number | null = null;
    const tick = () => {
      const left = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRestLeft(left);
      if (left !== lastWhole) {
        lastWhole = left;
        if (left <= 3 && left >= 1) runnerCues.tick();
        if (left === 0) {
          runnerCues.roundStart();
          setRestEndsAt(null);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [restEndsAt]);

  const advanceStep = (dir: 1 | -1) => {
    setLive((prev) => {
      if (!prev) return prev;
      const next = Math.min(
        prev.routine.steps.length - 1,
        Math.max(0, prev.stepIdx + dir)
      );
      return { ...prev, stepIdx: next };
    });
  };

  // Shared save path for both live modes. Returns true on success so the
  // EMOM runner can hold its save panel open (retry) instead of losing
  // the session on a network blip.
  const saveSession = async (
    routine: Routine,
    durationMinutes: number,
    exercises: {
      name: string;
      sets: number;
      reps?: number;
      seconds?: number;
      weightKg?: number;
    }[],
    extraMetrics?: Record<string, unknown>
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch("/api/health/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: "strength",
          description: routine.name,
          durationMinutes,
          exercises,
          source: "live",
          metricsData: {
            sequenceId: routine.id,
            sequenceName: routine.name,
            ...extraMetrics,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Couldn't save the session");
        return false;
      }
      if (Array.isArray(body.newPRs) && body.newPRs.length > 0) {
        for (const pr of body.newPRs) {
          toast.success(
            `NEW PR — ${pr.exerciseName}: ${fmt(pr.value)} ${pr.unit === "kg-reps" ? "kg total" : "kg"}`
          );
        }
      } else {
        toast.success("Session saved");
      }
      load();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const endLive = async () => {
    if (!live) return;
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    const exercises = live.routine.steps
      .map((step, i) => ({
        name: step.exerciseName,
        sets: live.setsDone[i],
        reps: step.reps ?? undefined,
        seconds: step.seconds ?? undefined,
        weightKg: step.weightKg ?? undefined,
      }))
      .filter((e) => e.sets > 0);

    if (exercises.length === 0) {
      toast("Nothing logged — session discarded.");
      setLive(null);
      setRestEndsAt(null);
      return;
    }

    if (await saveSession(live.routine, durationMinutes, exercises)) {
      setLive(null);
      setRestEndsAt(null);
    }
  };

  // EMOM: the clock is the log — sets derive from rounds completed
  // (round i belongs to step i % n), no manual counting.
  const finishEmom = async (result: {
    roundsCompleted: number;
    totalRounds: number;
    elapsedSeconds: number;
  }): Promise<boolean> => {
    if (!emomLive) return false;
    const n = emomLive.steps.length;
    const exercises = emomLive.steps
      .map((step, i) => ({
        name: step.exerciseName,
        sets:
          Math.floor(result.roundsCompleted / n) +
          (i < result.roundsCompleted % n ? 1 : 0),
        reps: step.reps ?? undefined,
        seconds: step.seconds ?? undefined,
        weightKg: step.weightKg ?? undefined,
      }))
      .filter((e) => e.sets > 0);
    if (exercises.length === 0) return false;

    const ok = await saveSession(
      emomLive,
      Math.max(1, Math.round(result.elapsedSeconds / 60)),
      exercises,
      { emom: { roundsCompleted: result.roundsCompleted, totalRounds: result.totalRounds } }
    );
    if (ok) setEmomLive(null);
    return ok;
  };

  const maxVolume = useMemo(
    () => Math.max(1, ...(data?.weeklyVolume.map((w) => w.volumeKg) ?? [1])),
    [data]
  );

  const sessionTime = data?.session
    ? new Date(data.session.startedAt)
        .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        .toUpperCase()
    : null;

  const trailDay = data?.latestTrail
    ? new Date(data.latestTrail.startedAt).toLocaleDateString("en-US", {
        weekday: "short",
      })
    : null;

  const liveStep = live?.routine.steps[live.stepIdx];
  const liveNext = live?.routine.steps[live.stepIdx + 1];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="micro-label">
            Week {data?.weekNumber ?? "—"} · Kettlebell block
          </p>
          <h1
            className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Train
          </h1>
        </div>
        <span className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold tabular-nums text-[#8C2F51]">
          {tonnageLabel(data?.weekVolumeKg ?? 0)} lifted
        </span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={openStart}
          className="flex flex-[1.5] items-center justify-center gap-2 rounded-[12px] bg-foreground py-3 text-[13.5px] font-semibold text-background"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="h-2 w-2 rounded-full bg-[#DC74A0]" /> Start live
          workout
        </button>
        <button
          onClick={() => setShowRoutines(true)}
          className="flex-1 rounded-[12px] border border-[#D9D7DC] bg-card py-3 text-[13.5px] font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Routines
        </button>
      </div>

      {/* THIS WEEK · PLANNED (2026-08-28) — the chat-dictated week; renders
          nothing until a week exists. Notably this is the "weekly plan
          target" the overview card's design always wanted. */}
      <TrainingWeek />

      {/* THIS WEEK · OVERVIEW (design 2026-08-11 rev). Surfaced deviation:
          the design's "4 of 5 planned" needs a weekly plan target that
          doesn't exist yet — the label shows the live session count. */}
      {data?.weekOverview && (
        <div className="mt-3 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              THIS WEEK · OVERVIEW
            </p>
            <p className="text-[11px] font-semibold text-[#5E9B72]">
              {data.weekOverview.sessions} this week
            </p>
          </div>
          <div className="mt-3 flex">
            {(
              [
                [String(data.weekOverview.sessions), "SESSIONS", null],
                [
                  `${Math.floor(data.weekOverview.activeMinutes / 60)}:${String(
                    data.weekOverview.activeMinutes % 60
                  ).padStart(2, "0")}`,
                  "ACTIVE",
                  null,
                ],
                [fmt(data.weekOverview.kcal), "KCAL", null],
                [data.weekOverview.outdoorKm.toFixed(1), "OUTDOORS", "km"],
              ] as const
            ).map(([value, label, unit]) => (
              <div key={label} className="flex-1">
                <div
                  className="text-[19px] font-bold text-foreground tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {value}
                  {unit && <span className="text-[12px] text-[#66646C]"> {unit}</span>}
                </div>
                <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push("/health/workouts/activities")}
            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent py-[11px] text-[13px] font-semibold text-[#8C2F51] hover:bg-[#F0D3E0]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            View activities <span>→</span>
          </button>
        </div>
      )}

      {/* NEW PR banner */}
      {data?.latestPR && (
        <div className="relative mt-3 overflow-hidden rounded-[18px] bg-primary p-[18px]">
          <div
            className="absolute bottom-0 top-0 w-[60px] bg-white/[0.18] blur-[6px]"
            style={{ animation: "shimmer 3.2s ease-in-out infinite" }}
          />
          <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-[#F6E3EB]">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="5"
                y="0"
                width="7"
                height="7"
                transform="rotate(45 5 1.5)"
                fill="#FFFFFF"
              />
            </svg>
            {data.latestPR.kind === "weight" ? "HEAVIEST EVER" : "BEST SESSION"} ·{" "}
            {data.latestPR.isToday
              ? "TODAY"
              : new Date(data.latestPR.achievedAt)
                  .toLocaleDateString("en-US", { weekday: "long" })
                  .toUpperCase()}
          </div>
          <div
            className="mt-1.5 text-[22px] font-bold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {prHeadline(data.latestPR)}
          </div>
          <div className="mt-[3px] text-xs text-[#F0D3E0]">
            {prSubline(data.latestPR)}
          </div>
        </div>
      )}

      {/* Today's session */}
      {data?.session && (
        <div className="mt-3 overflow-hidden rounded-[18px] bg-card shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="px-4 pb-2.5 pt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            TODAY{sessionTime ? ` · ${sessionTime}` : ""}
            {data.session.durationMinutes
              ? ` · ${data.session.durationMinutes} MIN`
              : ""}
          </div>
          {/* Routine attribution — watch/web runs sync their source routine
              and rounds; free-form sessions have none. */}
          {data.session.routine && (
            <div className="flex items-center justify-between px-4 pb-2.5">
              <span className="text-[13px] font-bold text-[#8C2F51]">
                {data.session.routine.name}
              </span>
              {data.session.routine.roundsCompleted != null && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-[#8C2F51]">
                  {data.session.routine.roundsCompleted} rounds
                </span>
              )}
            </div>
          )}
          {data.session.rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-t border-muted px-4 py-3"
              style={row.isPR ? { background: "#FDF7FA" } : undefined}
            >
              <div className="text-[13.5px] font-semibold text-foreground">
                {row.name}{" "}
                {row.isPR && (
                  <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-white">
                    PR
                  </span>
                )}
                {row.workSeconds != null && (
                  <span className="ml-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {Math.floor(row.workSeconds / 60)}:
                    {String(row.workSeconds % 60).padStart(2, "0")} work
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[12.5px] tabular-nums text-secondary-foreground">
                  {row.detail}
                </span>
                <span className="text-[13px] text-[#5E9B72]">✓</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volume · 8 weeks */}
      <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            VOLUME · 8 WEEKS
          </p>
          {data?.pctChange != null && (
            <p className="text-[11px] font-semibold text-muted-foreground">
              <span
                style={{ color: data.pctChange >= 0 ? "#5E9B72" : "#B54B4B" }}
              >
                {data.pctChange >= 0 ? "+" : ""}
                {data.pctChange}%
              </span>{" "}
              vs last week
            </p>
          )}
        </div>
        <div className="mt-3 flex h-[74px] items-end gap-2">
          {(data?.weeklyVolume ?? Array.from({ length: 8 }, () => null)).map(
            (bucket, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[6px]"
                style={{
                  background: BAR_COLORS[i],
                  height: bucket
                    ? `${Math.max(4, Math.round((bucket.volumeKg / maxVolume) * 100))}%`
                    : "4%",
                }}
              />
            )
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[9.5px] text-muted-foreground">
          <span>{data?.weeklyVolume[0]?.label ?? ""}</span>
          {/* The bars are unlabelled otherwise — the current week's tonnage
              is what the whole chart is scaled against. */}
          <span className="tabular-nums">
            {data ? tonnageLabel(data.weekVolumeKg) : ""}
          </span>
          <span>{data?.weeklyVolume[7]?.label ?? ""}</span>
        </div>
      </div>

      {/* v4 BY MOVEMENT — where the 8 weeks of tonnage actually went */}
      {data && data.movementTonnage.length > 0 && (
        <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            BY MOVEMENT · 8 WEEKS
          </p>
          <div className="mt-3 grid gap-2">
            {data.movementTonnage.map((m) => {
              const max = data.movementTonnage[0].totalKg || 1;
              return (
                <div key={m.key} className="flex items-center gap-2.5">
                  <span className="w-24 truncate text-[11px] font-semibold text-foreground">
                    {m.name}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F2F1F2]">
                    <div
                      className="h-full rounded-full bg-[#A63D63]"
                      style={{ width: `${Math.max(6, Math.round((m.totalKg / max) * 100))}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-[10.5px] text-muted-foreground tabular-nums">
                    {tonnageLabel(m.totalKg)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* v4 PR WALL — every heaviest-ever, not just the latest banner */}
      {data && data.prWall.length > 0 && (
        <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            PR WALL · HEAVIEST EVER
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data.prWall.map((pr) => (
              <button
                key={pr.exercise}
                onClick={() =>
                  pr.workoutLogId &&
                  router.push(
                    `/health/workouts/activities/${encodeURIComponent(pr.workoutLogId)}`
                  )
                }
                className="rounded-[12px] bg-[#FAF7F8] px-3 py-2.5 text-left"
              >
                <div className="truncate text-[11px] font-semibold text-foreground">
                  {pr.exerciseName}
                </div>
                <div
                  className="mt-0.5 text-[17px] font-bold text-[#8C2F51] tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {pr.valueKg} kg
                </div>
                <div className="text-[9.5px] text-muted-foreground tabular-nums">
                  {pr.previousKg != null ? `was ${pr.previousKg} · ` : ""}
                  {new Date(pr.achievedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trails — tapping the summary opens that activity's full detail */}
      <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <div
            onClick={() =>
              data?.latestTrail &&
              router.push(`/health/workouts/activities?id=${data.latestTrail.id}`)
            }
            className={data?.latestTrail ? "cursor-pointer" : undefined}
          >
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              TRAILS
            </p>
            {data?.latestTrail ? (
              <>
                <p
                  className="mt-1 text-[15px] font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {(data.latestTrail.description || data.latestTrail.workoutType)
                    .split("•")[0]
                    .trim()}{" "}
                  · {data.latestTrail.distanceKm} km · {trailDay}
                </p>
                <p className="mt-0.5 text-[11.5px] text-secondary-foreground">
                  {[
                    data.latestTrail.elevationGainM
                      ? `+${Math.round(data.latestTrail.elevationGainM)} m`
                      : null,
                    data.latestTrail.avgHeartRateBpm
                      ? `avg ${data.latestTrail.avgHeartRateBpm} bpm`
                      : null,
                    `${data.latestTrail.durationMinutes} min`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-muted-foreground">
                No trails yet — first one starts from the wrist.
              </p>
            )}
          </div>
          <button
            onClick={() =>
              toast("Trail recording lives on the watch — web recording later.")
            }
            className="rounded-[10px] bg-foreground px-4 py-2.5 text-[12.5px] font-semibold text-background"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ● Record
          </button>
        </div>
        {/* Elevation profile — real altitude stream (design: TRAILS spark) */}
        {data?.latestTrail?.altitudeSpark &&
          data.latestTrail.altitudeSpark.length > 2 && (
            <svg
              width="100%"
              height="54"
              viewBox="0 0 360 54"
              preserveAspectRatio="none"
              className="mt-2.5"
            >
              {(() => {
                const alt = data.latestTrail!.altitudeSpark!;
                const mn = Math.min(...alt);
                const mx = Math.max(...alt);
                const span = mx - mn || 1;
                const pts = alt.map((v, i) => ({
                  x: 8 + (i / (alt.length - 1)) * 344,
                  y: 8 + (1 - (v - mn) / span) * 38,
                }));
                return (
                  <>
                    <path
                      d={`M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`}
                      fill="none"
                      stroke="#DCA8BE"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={pts[0].x}
                      cy={pts[0].y}
                      r="4"
                      fill="none"
                      stroke="#A63D63"
                      strokeWidth="2"
                    />
                    <circle
                      cx={pts[pts.length - 1].x}
                      cy={pts[pts.length - 1].y}
                      r="4"
                      fill="#A63D63"
                    />
                  </>
                );
              })()}
            </svg>
          )}
      </div>

      {/* Effort · time in zones — HR-bearing sessions (Strava now, watch next) */}
      {data?.latestEffort && (
        <div className="mt-3 rounded-2xl bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-baseline justify-between">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              EFFORT · TIME IN ZONES
            </p>
            <p className="text-[11px] font-semibold text-[#8C2F51] tabular-nums">
              {data.latestEffort.relativeEffort != null
                ? `RE ${data.latestEffort.relativeEffort}`
                : data.latestEffort.loadScore != null
                  ? `load ${data.latestEffort.loadScore}`
                  : ""}
            </p>
          </div>
          <p
            className="mt-1 text-[13px] font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {(data.latestEffort.description ?? data.latestEffort.workoutType)
              .split("•")[0]
              .trim()}{" "}
            ·{" "}
            {new Date(data.latestEffort.startedAt).toLocaleDateString("en-US", {
              weekday: "short",
            })}
            {data.latestEffort.avgHeartRateBpm
              ? ` · avg ${data.latestEffort.avgHeartRateBpm} bpm`
              : ""}
          </p>
          <div className="mt-2.5 flex h-[22px] gap-[2px] overflow-hidden rounded-md">
            {data.latestEffort.timeInZones.pct.map((pct, i) =>
              pct > 0 ? (
                <div
                  key={i}
                  style={{
                    width: `${pct}%`,
                    background: ["#EADFE5", "#DCA8BE", "#C97D9C", "#A63D63", "#8C2F51"][i],
                  }}
                />
              ) : null
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            {data.latestEffort.timeInZones.pct.map((pct, i) => (
              <span key={i}>
                Z{i + 1} {pct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ——— Routines sheet ——— */}
      {showRoutines && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowRoutines(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Routines
            </p>
            <div className="mt-3.5 grid gap-px overflow-hidden rounded-[14px] border border-border bg-border">
              {(routines ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => startLive(r)}
                  className="flex items-center justify-between bg-card px-3.5 py-[13px] text-left"
                >
                  <div>
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {r.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {stepSummary(r.steps, r.durationMinutes)}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-[#8C2F51]">
                    → Watch
                  </span>
                </button>
              ))}
              <button
                onClick={() => router.push("/health/workouts/routines")}
                className="border-t-[1.5px] border-dashed border-border bg-card px-3.5 py-[13px] text-center"
              >
                <span className="text-[13px] font-semibold text-[#8C2F51]">
                  + Build new routine
                </span>
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Routines sync to your Apple Watch as native workouts — start them
              from the wrist, sets mirror back here.
            </p>
            <button
              onClick={() => setShowRoutines(false)}
              className="mx-auto mt-[18px] block rounded-full border border-border px-6 py-[9px] text-[13px] font-semibold text-secondary-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Close
            </button>
          </div>
        </SheetPortal>
      )}

      {/* ——— Start picker (choose routine for live session) ——— */}
      {showStartPicker && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowStartPicker(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Start live workout
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick the routine for this session.
            </p>
            <div className="mt-3.5 grid gap-px overflow-hidden rounded-[14px] border border-border bg-border">
              {(routines ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => startLive(r)}
                  className="flex items-center justify-between bg-card px-3.5 py-[13px] text-left"
                >
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {r.name}
                  </p>
                  {isGuidedEmom(r) ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-[#8C2F51]">
                      EMOM · guided
                    </span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[#DC74A0]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </SheetPortal>
      )}

      {/* ——— Live workout sheet ——— */}
      {live && liveStep && (
        <SheetPortal>
          <div className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]" />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <p
                className="text-xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Live workout
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full bg-primary"
                  style={{ animation: "soft-pulse 1.2s ease-in-out infinite" }}
                />
                <span className="text-[13px] font-semibold tabular-nums text-[#8C2F51]">
                  {mm}:{ss}
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-[16px] bg-accent p-4">
              <p className="text-[10.5px] font-bold tracking-[0.16em] text-[#8C2F51]">
                CURRENT · SET{" "}
                {Math.min(
                  live.setsDone[live.stepIdx] + 1,
                  targetSetsFor(liveStep)
                )}{" "}
                OF {targetSetsFor(liveStep)}
              </p>
              <p
                className="mt-1.5 text-[22px] font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {liveStep.exerciseName}
                {liveStep.weightKg ? ` · ${liveStep.weightKg} kg` : ""}
              </p>
              <div className="mt-3 flex items-center gap-3.5">
                <button
                  onClick={() => bumpSet(-1)}
                  className="h-11 w-11 rounded-[12px] bg-card text-[22px] leading-none text-[#8C2F51]"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <p
                    className="text-[26px] font-bold tabular-nums text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {liveStep.reps
                      ? `${liveStep.reps} reps`
                      : `${liveStep.seconds}s`}
                  </p>
                  <p className="text-[11px] font-semibold text-[#8C2F51]">
                    {live.setsDone[live.stepIdx]} set
                    {live.setsDone[live.stepIdx] === 1 ? "" : "s"} logged on tap
                  </p>
                </div>
                <button
                  onClick={() => bumpSet(1)}
                  className="h-11 w-11 rounded-[12px] bg-primary text-[22px] leading-none text-white"
                >
                  +
                </button>
              </div>
            </div>

            {restEndsAt !== null && restLeft > 0 && (
              <button
                onClick={() => setRestEndsAt(null)}
                className="mt-3 flex w-full items-center justify-between rounded-[14px] bg-[#EDF3EE] px-4 py-3"
              >
                <span className="text-[10.5px] font-bold tracking-[0.2em] text-[#5E9B72]">
                  REST
                </span>
                <span
                  className="text-[24px] font-bold tabular-nums text-[#5E9B72]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  :{String(restLeft).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  tap to skip
                </span>
              </button>
            )}

            <div className="mt-3 flex items-center justify-between px-1">
              <button
                onClick={() => advanceStep(-1)}
                disabled={live.stepIdx === 0}
                className="text-xs text-secondary-foreground disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-secondary-foreground">
                {liveNext
                  ? `Next — ${liveNext.exerciseName}${liveNext.weightKg ? ` · ${liveNext.weightKg} kg` : ""}`
                  : "Last movement"}
              </span>
              <button
                onClick={() => advanceStep(1)}
                disabled={live.stepIdx >= live.routine.steps.length - 1}
                className="text-xs font-semibold text-[#8C2F51] disabled:opacity-40"
              >
                Next →
              </button>
            </div>

            <button
              onClick={endLive}
              disabled={saving}
              className="mt-4 w-full rounded-[12px] bg-foreground py-[13px] text-sm font-semibold text-background"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {saving ? "Saving…" : "End session & save"}
            </button>
          </div>
        </SheetPortal>
      )}

      {/* ——— EMOM runner (protocol clock; kind="emom" routines) ——— */}
      {emomLive && (
        <EmomRunner
          routineName={emomLive.name}
          durationMinutes={emomMinutes(emomLive)}
          steps={emomLive.steps}
          saving={saving}
          onFinish={finishEmom}
          onExit={() => setEmomLive(null)}
        />
      )}
    </div>
  );
}
