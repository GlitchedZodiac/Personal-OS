"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDataLoggedListener } from "@/components/use-data-logged";
import type { SequenceStep } from "@/lib/sequences";

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
    rows: { name: string; detail: string; isPR: boolean }[];
    durationMinutes: number;
    startedAt: string;
  } | null;
  weeklyVolume: { weekStart: string; label: string; volumeKg: number }[];
  pctChange: number | null;
  latestTrail: {
    id: string;
    startedAt: string;
    workoutType: string;
    description: string | null;
    distanceKm: number;
    elevationGainM: number | null;
    durationMinutes: number;
    avgHeartRateBpm: number | null;
  } | null;
}

interface Routine {
  id: string;
  name: string;
  kind: string;
  restSecondsDefault: number | null;
  durationMinutes: number | null;
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

export default function TrainPage() {
  const router = useRouter();
  const [data, setData] = useState<TrainData | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [showRoutines, setShowRoutines] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [live, setLive] = useState<LiveSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
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
    setLive({
      routine,
      stepIdx: 0,
      setsDone: routine.steps.map(() => 0),
      startedAt: Date.now(),
    });
    setElapsed(0);
    setShowRoutines(false);
    setShowStartPicker(false);
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
      return { ...prev, setsDone };
    });
  };

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

  const endLive = async () => {
    if (!live) return;
    setSaving(true);
    try {
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
        return;
      }

      const res = await fetch("/api/health/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: "strength",
          description: live.routine.name,
          durationMinutes,
          exercises,
          source: "live",
          metricsData: { sequenceId: live.routine.id },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Couldn't save the session");
        return;
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
      setLive(null);
      load();
    } finally {
      setSaving(false);
    }
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
          {fmt(data?.weekVolumeKg ?? 0)} kg
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
            NEW PR ·{" "}
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
            {data.latestPR.exerciseName} — {fmt(data.latestPR.value)}{" "}
            {data.latestPR.unit === "kg-reps" ? "kg total" : "kg"}
          </div>
          <div className="mt-[3px] text-xs text-[#F0D3E0]">
            Yesterday&apos;s you lifted less.
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
            <p
              className="text-[11px] font-semibold"
              style={{ color: data.pctChange >= 0 ? "#5E9B72" : "#B54B4B" }}
            >
              {data.pctChange >= 0 ? "+" : ""}
              {data.pctChange}%
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
          <span>{data?.weeklyVolume[7]?.label ?? ""}</span>
        </div>
      </div>

      {/* Trails */}
      <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <div>
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
      </div>

      {/* ——— Routines sheet ——— */}
      {showRoutines && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowRoutines(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[71] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
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
        </>
      )}

      {/* ——— Start picker (choose routine for live session) ——— */}
      {showStartPicker && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowStartPicker(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[71] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
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
                  <span className="h-2 w-2 rounded-full bg-[#DC74A0]" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ——— Live workout sheet ——— */}
      {live && liveStep && (
        <>
          <div className="fixed inset-0 z-[70] bg-[rgba(27,21,24,0.45)]" />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[71] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
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
        </>
      )}
    </div>
  );
}
