"use client";

// Jump rope on the activity detail (2026-10-05). NO DESIGN SLICE EXISTS for
// any of this — built inside the activity screen's own language (the dark
// header panel, white 18px cards, caps kickers, the HR card's pinks) at
// Michael's call, and flagged for the next design pass. PORT GATE applies
// the moment a slice lands.
//
// Everything drawn here is arithmetic from lib/jump-rope.ts over what the
// wrist recorded: when each work interval ran, and the HR stream on the
// same clock. Nothing is estimated on the page.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  formatClock,
  formatJumpRopePR,
  type IntervalAnalysis,
  type ProtocolGroup,
} from "@/lib/jump-rope";

const fmt = (n: number) => n.toLocaleString("en-US");

const CARD = "mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]";
const KICKER = "text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground";

export interface RopeRecord {
  kind: string;
  value: number;
  previousValue: number | null;
  exerciseName: string;
}

function protocolLabel(rope: IntervalAnalysis) {
  return rope.protocol === "continuous" ? "CONTINUOUS" : rope.protocol;
}

/** Dark header: jump time as the hero, the session drawn as work and rest. */
export function RopeHeaderPanel({ rope }: { rope: IntervalAnalysis }) {
  const total = Math.max(rope.sessionSeconds, 1);
  const marks = rope.rounds;
  return (
    <div className="relative overflow-hidden bg-[#1B1518] px-[22px] pb-[22px] pt-16">
      <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#7E6F77]">
        JUMP ROPE · {protocolLabel(rope)}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2.5">
        <span
          className="text-[44px] font-bold leading-none text-[#F0E8EC] tabular-nums"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {formatClock(rope.jumpSeconds)}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] text-[#7E6F77]">JUMPING</span>
      </div>
      {marks.length > 0 ? (
        <>
          <div className="relative mt-4 h-[26px] overflow-hidden rounded-[8px] bg-[#2C2127]">
            {marks.map((r) => (
              <div
                key={r.round}
                className="absolute top-0 h-full bg-[#A63D63]"
                style={{
                  left: `${(r.start / total) * 100}%`,
                  width: `${Math.max(((r.end - r.start) / total) * 100, 0.6)}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-[#7E6F77]">
            <span>0:00</span>
            <span>pink = rope turning · dark = rest</span>
            <span>{formatClock(rope.sessionSeconds)}</span>
          </div>
        </>
      ) : (
        <div className="mt-3 text-[10.5px] leading-[1.5] text-[#7E6F77]">
          Typed in after the session — the rounds were not timed.
        </div>
      )}
    </div>
  );
}

/** Stats grid rows for a jump rope session. */
export function ropeStats(
  rope: IntervalAnalysis,
  det: {
    caloriesBurned: number | null;
    avgHeartRateBpm: number | null;
    maxHeartRateBpm: number | null;
  }
): [string, string][] {
  const hr = (v: number | null) => (v ? `${Math.round(v)} bpm` : "—");
  const rounds =
    rope.mode === "continuous"
      ? "—"
      : rope.plannedRounds && rope.plannedRounds !== rope.roundsCompleted
        ? `${rope.roundsCompleted} of ${rope.plannedRounds}`
        : String(rope.roundsCompleted);
  return [
    ["JUMP TIME", formatClock(rope.jumpSeconds)],
    ["ROUNDS", rounds],
    ["SESSION", formatClock(rope.sessionSeconds)],
    ["CALORIES", det.caloriesBurned ? String(Math.round(det.caloriesBurned)) : "—"],
    ["AVG HR", hr(det.avgHeartRateBpm)],
    ["MAX HR", hr(det.maxHeartRateBpm)],
    ...(rope.kcalPerJumpMinute != null
      ? ([["KCAL / JUMP MIN", String(rope.kcalPerJumpMinute)]] as [string, string][])
      : []),
    ...(rope.jumps != null ? ([["JUMPS", fmt(rope.jumps)]] as [string, string][]) : []),
  ];
}

/** HR on a real time axis, each work interval shaded behind it. */
function IntervalHrChart({
  rope,
  hr,
  time,
}: {
  rope: IntervalAnalysis;
  hr: number[];
  time: number[];
}) {
  const W = 360;
  const H = 150;
  const PAD = 10;
  const view = useMemo(() => {
    const n = Math.min(hr.length, time.length);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(hr[i]) && Number.isFinite(time[i]) && hr[i] > 0) pts.push([time[i], hr[i]]);
    }
    if (pts.length < 2) return null;
    const tMax = Math.max(pts[pts.length - 1][0], rope.sessionSeconds, 1);
    const lo = Math.min(...pts.map((p) => p[1]));
    const hi = Math.max(...pts.map((p) => p[1]));
    const range = hi - lo || 1;
    const x = (t: number) => (t / tMax) * W;
    const y = (v: number) => PAD + (1 - (v - lo) / range) * (H - 2 * PAD);
    return {
      line: pts.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
      bands: rope.rounds.map((r) => ({ x: x(r.start), w: Math.max(x(r.end) - x(r.start), 0.8) })),
      lo,
      hi,
      tMax,
    };
  }, [hr, time, rope]);

  if (!view) return null;
  return (
    <div className="mt-2.5">
      <div className="relative">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {view.bands.map((b, i) => (
            <rect key={i} x={b.x} y="0" width={b.w} height={H} fill="#F6E3EB" />
          ))}
          <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} stroke="#F2F1F2" strokeWidth="1" />
          <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} stroke="#F2F1F2" strokeWidth="1" />
          <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} stroke="#F2F1F2" strokeWidth="1" />
          <polyline
            points={view.line}
            fill="none"
            stroke="#8C2F51"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-white/80 px-1 text-[9.5px] font-semibold text-[#8C2F51] tabular-nums">
          {Math.round(view.hi)}
        </span>
        <span className="pointer-events-none absolute bottom-0.5 left-1 rounded bg-white/80 px-1 text-[9.5px] font-semibold text-muted-foreground tabular-nums">
          {Math.round(view.lo)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-[2px] bg-[#F6E3EB]" /> rope turning
        </span>
        <span>{formatClock(view.tMax)}</span>
      </div>
    </div>
  );
}

/** One column per round: trough to peak, with both trends drawn through. */
function RoundChart({ rope }: { rope: IntervalAnalysis }) {
  const W = 360;
  const H = 130;
  const PAD = 12;
  const view = useMemo(() => {
    const rs = rope.rounds.filter((r) => r.peak != null);
    if (rs.length < 2) return null;
    const lows = rs.map((r) => r.trough ?? r.peak!).concat(rs.map((r) => r.peak!));
    const lo = Math.min(...lows) - 3;
    const hi = Math.max(...rs.map((r) => r.peak!)) + 3;
    const x = (i: number) => PAD + (i / (rs.length - 1)) * (W - 2 * PAD);
    const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
    return {
      rs,
      lo,
      hi,
      x,
      y,
      peaks: rs.map((r, i) => `${x(i).toFixed(1)},${y(r.peak!).toFixed(1)}`).join(" "),
      troughs: rs
        .map((r, i) => (r.trough != null ? `${x(i).toFixed(1)},${y(r.trough).toFixed(1)}` : null))
        .filter(Boolean)
        .join(" "),
    };
  }, [rope]);
  if (!view) return null;
  const { rs, x, y } = view;
  const dot = rs.length > 30 ? 1.8 : 2.8;
  return (
    <div className="mt-2.5">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {rs.map((r, i) =>
          r.trough != null ? (
            <line
              key={r.round}
              x1={x(i)}
              x2={x(i)}
              y1={y(r.peak!)}
              y2={y(r.trough)}
              stroke="#EADFE5"
              strokeWidth={rs.length > 30 ? 2 : 4}
              strokeLinecap="round"
            />
          ) : null
        )}
        {view.troughs && (
          <polyline points={view.troughs} fill="none" stroke="#5E9B72" strokeWidth="1.5" />
        )}
        <polyline points={view.peaks} fill="none" stroke="#A63D63" strokeWidth="1.5" />
        {rs.map((r, i) => (
          <g key={r.round}>
            <circle cx={x(i)} cy={y(r.peak!)} r={dot} fill="#8C2F51" />
            {r.trough != null && <circle cx={x(i)} cy={y(r.trough)} r={dot} fill="#5E9B72" />}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground tabular-nums">
        <span>round 1</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#8C2F51]" /> peak
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#5E9B72]" /> trough
          </span>
        </span>
        <span>round {rs[rs.length - 1].round}</span>
      </div>
    </div>
  );
}

function Cell({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="py-1">
      <div
        className="text-[20px] font-bold tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: tone ?? "var(--foreground)" }}
      >
        {value}
      </div>
      <div className="mt-[3px] text-[9.5px] font-semibold tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** His own count. The wrist's estimate sits beside it, clearly on trial. */
function JumpsCard({
  id,
  rope,
  onSaved,
}: {
  id: string;
  rope: IntervalAnalysis;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rope.jumps != null ? String(rope.jumps) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const total = Number(value);
    if (!Number.isFinite(total) || total < 1) {
      toast.error("Enter the number you counted");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/health/workouts/entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, jumps: { total } }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Jump count saved");
      setEditing(false);
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(String(body.error ?? "Couldn't save"));
    }
  };

  const est = rope.jumpsEstimated;
  const off =
    est != null && rope.jumps != null && rope.jumps > 0
      ? Math.round(((est - rope.jumps) / rope.jumps) * 1000) / 10
      : null;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <div className={KICKER}>JUMPS</div>
        {rope.jumps != null && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-[#8C2F51]"
          >
            Edit
          </button>
        )}
      </div>
      {rope.jumps != null && !editing ? (
        <div className="mt-2 grid grid-cols-2">
          <Cell value={fmt(rope.jumps)} label="COUNTED BY YOU" />
          <Cell
            value={rope.jumpsPerMinute != null ? String(rope.jumpsPerMinute) : "—"}
            label="PER JUMPING MINUTE"
          />
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="How many did you count?"
            inputMode="numeric"
            className="min-w-0 flex-1 rounded-[10px] border border-[#E3E1E5] px-2.5 py-2 text-[13px] tabular-nums"
          />
          {editing && (
            <button
              onClick={() => setEditing(false)}
              className="rounded-[10px] px-2 py-2 text-[12.5px] font-semibold text-muted-foreground"
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[10px] bg-[#232227] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {est != null && (
        <div className="mt-3 rounded-[12px] bg-[#F7F6F7] px-3 py-2.5">
          <div className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">
            WRIST ESTIMATE · ON TRIAL
          </div>
          <div className="mt-1 text-[13px] font-semibold text-foreground tabular-nums">
            {fmt(est)} turns
            {off != null && (
              <span className="ml-2 font-normal text-muted-foreground">
                {off === 0 ? "matches your count" : `${Math.abs(off)}% ${off > 0 ? "over" : "under"} your count`}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-[1.5] text-muted-foreground">
            Counted from wrist motion. It is not used for records or totals until it tracks your own
            counts — enter yours and this line shows how close it got.
          </p>
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RopeCards({
  id,
  rope,
  hrStream,
  timeStream,
  avgHeartRateBpm,
  records,
  history,
  onSaved,
}: {
  id: string;
  rope: IntervalAnalysis;
  hrStream: number[] | null;
  timeStream: number[] | null;
  avgHeartRateBpm: number | null;
  records: RopeRecord[];
  history: ProtocolGroup | null;
  onSaved: () => void;
}) {
  const measured = rope.rounds.length > 0;
  const hasHr = !!hrStream && !!timeStream && hrStream.length > 1;
  const peaks = rope.rounds.map((r) => r.peak).filter((v): v is number => v != null);
  const troughs = rope.rounds.map((r) => r.trough).filter((v): v is number => v != null);
  const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
  const coarse = rope.hrResolutionSeconds != null && rope.hrResolutionSeconds > 8;
  const jumpPct = rope.jumpPct ?? 0;

  return (
    <>
      {records.length > 0 && (
        <div className="mt-3 rounded-[18px] bg-[#F6E3EB] px-4 py-3">
          <div className="text-[10.5px] font-bold tracking-[0.16em] text-[#8C2F51]">
            {records.length > 1 ? "RECORDS THIS SESSION" : "RECORD THIS SESSION"}
          </div>
          {records.map((r) => (
            <div key={r.kind} className="mt-1.5 text-[13px] font-semibold text-[#232227]">
              {r.kind === "rounds"
                ? `Most rounds · ${r.exerciseName.split(" · ")[1] ?? ""}`
                : r.kind === "duration"
                  ? "Longest unbroken jump"
                  : r.kind === "jumps"
                    ? "Most jumps in a session"
                    : "Most jumps in a round"}
              <span className="ml-2 tabular-nums text-[#8C2F51]">
                {formatJumpRopePR(r.kind, r.value)}
              </span>
              {r.previousValue != null && (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  was {formatJumpRopePR(r.kind, r.previousValue)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {measured && hasHr && (
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <div className={KICKER}>HEART RATE · ROUND BY ROUND</div>
            <div className="text-[11px] font-semibold text-[#8C2F51] tabular-nums">
              avg {avgHeartRateBpm ? `${avgHeartRateBpm} bpm` : "—"}
            </div>
          </div>
          <IntervalHrChart rope={rope} hr={hrStream!} time={timeStream!} />
          {coarse && (
            <p className="mt-2 text-[10px] leading-[1.5] text-muted-foreground">
              Heart rate was stored about every {Math.round(rope.hrResolutionSeconds!)} s here, so a
              round&rsquo;s peak and trough are approximate.
            </p>
          )}
        </div>
      )}

      {measured && peaks.length >= 2 && (
        <div className={CARD}>
          <div className={KICKER}>PEAK AND TROUGH · EACH ROUND</div>
          <RoundChart rope={rope} />
          <div className="mt-2.5 grid grid-cols-3">
            <Cell value={avg(peaks) != null ? String(avg(peaks)) : "—"} label="AVG PEAK" tone="#8C2F51" />
            <Cell value={avg(troughs) != null ? String(avg(troughs)) : "—"} label="AVG TROUGH" tone="#3E7A54" />
            <Cell value={rope.avgDrop != null ? `−${rope.avgDrop}` : "—"} label="AVG DROP IN REST" />
          </div>
          {rope.troughTrend && (
            <p className="mt-2 text-[11.5px] leading-[1.5] text-foreground">
              {rope.troughTrend.rising
                ? `Troughs climbed ${rope.troughTrend.first} → ${rope.troughTrend.last} bpm. You were recovering less between rounds as the session went on.`
                : `Troughs held (${rope.troughTrend.first} → ${rope.troughTrend.last} bpm). You were recovering between rounds.`}
            </p>
          )}
        </div>
      )}

      {measured && (rope.avgWorkHr != null || rope.drift) && (
        <div className={CARD}>
          <div className={KICKER}>WORK vs REST</div>
          <div className="mt-2 grid grid-cols-3">
            <Cell value={rope.avgWorkHr != null ? String(rope.avgWorkHr) : "—"} label="AVG HR · WORK" tone="#8C2F51" />
            <Cell value={rope.avgRestHr != null ? String(rope.avgRestHr) : "—"} label="AVG HR · REST" tone="#3E7A54" />
            <Cell value={avgHeartRateBpm ? String(avgHeartRateBpm) : "—"} label="WHOLE SESSION" />
          </div>
          {rope.drift && (
            <div className="mt-3 border-t border-[#F2F1F2] pt-3">
              <div className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">
                CARDIAC DRIFT · WORK HR, FIRST THIRD vs LAST
              </div>
              <div className="mt-1 text-[13px] font-semibold text-foreground tabular-nums">
                {rope.drift.first} → {rope.drift.last} bpm
                <span
                  className="ml-2"
                  style={{ color: rope.drift.delta >= 8 ? "#D9A23E" : "#66646C" }}
                >
                  {rope.drift.delta >= 0 ? "+" : "−"}
                  {Math.abs(rope.drift.delta)} bpm ({rope.drift.pct >= 0 ? "+" : "−"}
                  {Math.abs(rope.drift.pct)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={CARD}>
        <div className={KICKER}>JUMP TIME</div>
        <div className="mt-2.5 flex h-[10px] overflow-hidden rounded-full bg-[#EADFE5]">
          <div className="h-full bg-[#A63D63]" style={{ width: `${jumpPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums">
          <span className="font-semibold text-[#8C2F51]">
            {formatClock(rope.jumpSeconds)} jumping · {jumpPct}%
          </span>
          <span className="text-muted-foreground">of {formatClock(rope.sessionSeconds)}</span>
        </div>
        <div className="mt-2 grid grid-cols-2">
          <Cell
            value={rope.kcalPerJumpMinute != null ? String(rope.kcalPerJumpMinute) : "—"}
            label="KCAL PER JUMPING MINUTE"
          />
          <Cell value={formatClock(rope.longestJumpSeconds)} label="LONGEST UNBROKEN JUMP" />
        </div>
        {!measured && (
          <p className="mt-2 text-[10px] leading-[1.5] text-muted-foreground">
            This session was typed in afterwards, so the rounds were not timed and there are no
            per-round numbers. Sessions started from Jump Rope on the watch have them.
          </p>
        )}
      </div>

      <JumpsCard id={id} rope={rope} onSaved={onSaved} />

      {history && history.sessions.length > 1 && (
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <div className={KICKER}>
              EVERY {protocolLabel(rope)} SESSION
            </div>
            <div className="text-[11px] font-semibold text-[#8C2F51] tabular-nums">
              {rope.mode === "continuous"
                ? `longest ${formatClock(history.longestJumpSeconds)}`
                : `best ${history.bestRounds} rounds`}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-[12px] tabular-nums">
            <span className="text-[9.5px] font-bold tracking-[0.1em] text-muted-foreground">DATE</span>
            <span className="text-right text-[9.5px] font-bold tracking-[0.1em] text-muted-foreground">
              {rope.mode === "continuous" ? "TIME" : "ROUNDS"}
            </span>
            <span className="text-right text-[9.5px] font-bold tracking-[0.1em] text-muted-foreground">WORK HR</span>
            <span className="text-right text-[9.5px] font-bold tracking-[0.1em] text-muted-foreground">DROP</span>
            {[...history.sessions].reverse().map((s) => {
              const here = s.id === id;
              const cls = here ? "font-bold text-[#8C2F51]" : "text-foreground";
              return (
                <a
                  key={s.id}
                  href={`/health/workouts/activities/${encodeURIComponent(s.id)}`}
                  className="contents"
                >
                  <span className={cls}>
                    {shortDate(s.startedAt)}
                    {here ? " · this one" : ""}
                  </span>
                  <span className={`text-right ${cls}`}>
                    {rope.mode === "continuous" ? formatClock(s.jumpSeconds) : s.roundsCompleted}
                  </span>
                  <span className={`text-right ${cls}`}>{s.avgWorkHr ?? "—"}</span>
                  <span className={`text-right ${cls}`}>{s.avgDrop != null ? `−${s.avgDrop}` : "—"}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
