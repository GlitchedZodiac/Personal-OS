"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActivityMetric, MorningReport, WeeklyReport } from "@/lib/activity-summary";

// Activity — Apple Health steps and calories from the nightly Shortcut
// (2026-10-17): yesterday against the week before it, and Mon–Sun. NO
// DESIGN SLICE exists for this screen; it is built from the Sunday Report's
// own card language (PORT GATE §5 — listed in docs/state.md as undesigned).

interface ActivityData {
  timeZone: string;
  today: string;
  morning: MorningReport;
  weekly: WeeklyReport;
  lastPush: { date: string; receivedAt: string } | null;
  totalDays: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const METRIC_ROWS: { key: ActivityMetric; label: string; show: (n: number) => string }[] = [
  { key: "steps", label: "STEPS", show: fmt },
  { key: "activeEnergyKcal", label: "ACTIVE KCAL", show: fmt },
  { key: "restingEnergyKcal", label: "RESTING KCAL", show: fmt },
  { key: "walkingRunningDistanceKm", label: "KM WALK + RUN", show: (n) => n.toFixed(2) },
];

function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function dayLabel(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
    .toUpperCase();
}

function Delta({ pct, against }: { pct: number | null; against: string }) {
  if (pct === null) return null;
  const up = pct > 0;
  const color = pct === 0 ? "#66646C" : up ? "#5E9B72" : "#D9A23E";
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
      {pct === 0 ? "even" : `${up ? "↑" : "↓"} ${Math.abs(pct)}%`}{" "}
      <span className="font-normal text-muted-foreground">vs {against}</span>
    </span>
  );
}

/** "↓ 8%" beside a name — the week-over-week box. */
function Change({ label, pct }: { label: string; pct: number | null }) {
  if (pct === null) return null;
  const color = pct === 0 ? "#66646C" : pct > 0 ? "#5E9B72" : "#D9A23E";
  return (
    <span className="flex justify-between text-[11.5px] tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold" style={{ color }}>
        {pct === 0 ? "even" : `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`}
      </span>
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  phone: "iPhone",
  watch: "Apple Watch",
  mixed: "Watch + iPhone",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1">
      <div
        className="text-[19px] font-bold text-foreground tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityScreen />
    </Suspense>
  );
}

function ActivityScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [date, setDate] = useState<string | null>(params.get("date"));
  const [week, setWeek] = useState<string | null>(params.get("week"));
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (d: string | null, w: string | null) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (d) qs.set("date", d);
    if (w) qs.set("week", w);
    try {
      const res = await fetch(`/api/health/activity?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(date, week);
  }, [load, date, week]);

  const morning = data?.morning;
  const weekly = data?.weekly;
  const yesterday = data ? shiftDay(data.today, -1) : null;
  const thisWeekStart = weekly && data ? weekly.weekStart >= shiftDay(data.today, -6) : false;
  const maxSteps = weekly ? Math.max(1, ...weekly.days.map((d) => d.steps ?? 0)) : 1;

  return (
    <div className="min-h-screen bg-background px-[22px] pb-36 pt-12 lg:px-8 push-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-card"
          aria-label="Back to Today"
        >
          <span className="-mt-0.5 text-lg leading-none text-foreground">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            APPLE HEALTH · CENTRAL TIME
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Activity
          </div>
        </div>
      </div>

      {loading && !data && (
        <p className="mt-10 text-center text-[12px] text-muted-foreground">Reading your days…</p>
      )}
      {failed && !data && (
        <div className="mt-10 text-center text-[12px] text-muted-foreground">
          Couldn&apos;t load activity.{" "}
          <button onClick={() => load(date, week)} className="font-semibold text-[#8C2F51]">
            Try again
          </button>
        </div>
      )}

      {data && data.totalDays === 0 && (
        <div className="mt-4 rounded-[18px] bg-accent p-[18px]">
          <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#8C2F51]">
            WAITING FOR THE SHORTCUT
          </div>
          <div className="mt-2 text-[13.5px] leading-[1.6] text-foreground">
            Nothing has arrived from Apple Health yet. Build the Health Shortcut on your
            iPhone (SHORTCUT_SETUP.md in the repo) and run it once — the last six months
            fill in, then it keeps itself up to date every night.
          </div>
        </div>
      )}

      {morning && (
        <div className="mt-4 rounded-[18px] bg-[#A63D63] p-[18px]">
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#F6E3EB]">
              {morning.date === yesterday ? "YESTERDAY · " : ""}
              {dayLabel(morning.date, { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setDate(shiftDay(morning.date, -1))}
                className="min-h-8 min-w-8 rounded-lg bg-white/15 px-2 text-sm font-semibold text-white"
                aria-label="Day before"
              >
                ‹
              </button>
              <button
                onClick={() => setDate(shiftDay(morning.date, 1))}
                disabled={!yesterday || morning.date >= yesterday}
                className="min-h-8 min-w-8 rounded-lg bg-white/15 px-2 text-sm font-semibold text-white disabled:opacity-30"
                aria-label="Day after"
              >
                ›
              </button>
            </div>
          </div>
          {morning.hasData ? (
            <>
              <div
                className="mt-1.5 text-[34px] font-bold leading-none text-white tabular-nums"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {morning.metrics.steps.value !== null ? fmt(morning.metrics.steps.value) : "—"}
                <span className="ml-1.5 text-[14px] font-semibold text-[#F0D3E0]">steps</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#F6E3EB]">
                {morning.metrics.steps.vsAvg7Pct !== null && (
                  <span>
                    {morning.metrics.steps.vsAvg7Pct >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(morning.metrics.steps.vsAvg7Pct)}% vs 7-day avg
                  </span>
                )}
                {morning.metrics.steps.vsLastWeekPct !== null && (
                  <span>
                    {morning.metrics.steps.vsLastWeekPct >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(morning.metrics.steps.vsLastWeekPct)}% vs last{" "}
                    {morning.weekday.slice(0, 3)}
                  </span>
                )}
                {morning.source && <span>{SOURCE_LABEL[morning.source] ?? morning.source}</span>}
              </div>
            </>
          ) : (
            <div className="mt-2 text-[13.5px] leading-[1.5] text-white">
              Nothing for this day yet. The Shortcut sends each night — or run it now on
              your iPhone.
            </div>
          )}
        </div>
      )}

      {morning?.hasData && (
        <div className="mt-3 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              {morning.weekday.toUpperCase()} VS YOUR WEEK
            </div>
            <div className="text-[11px] text-muted-foreground">7-day avg · last week</div>
          </div>
          <div className="mt-2 divide-y divide-border">
            {METRIC_ROWS.map(({ key, label, show }) => {
              const m = morning.metrics[key];
              return (
                <div key={key} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1">
                    <div
                      className="text-[19px] font-bold text-foreground tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {m.value !== null ? show(m.value) : "—"}
                    </div>
                    <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                      {label}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {m.avg7 !== null ? `avg ${show(m.avg7)}` : "no avg yet"}
                      {m.lastWeek !== null ? ` · last ${show(m.lastWeek)}` : ""}
                    </span>
                    <Delta pct={m.vsAvg7Pct} against="avg" />
                    <Delta pct={m.vsLastWeekPct} against={`last ${morning.weekday.slice(0, 3)}`} />
                  </div>
                </div>
              );
            })}
          </div>
          {morning.metrics.steps.avg7Days > 0 && morning.metrics.steps.avg7Days < 7 && (
            <div className="mt-1 text-[10.5px] text-muted-foreground">
              Average over the {morning.metrics.steps.avg7Days} of the 7 days before that arrived.
            </div>
          )}
        </div>
      )}

      {weekly && (
        <div className="mt-3 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              WEEK · {dayLabel(weekly.weekStart, { month: "short", day: "numeric" })} –{" "}
              {dayLabel(weekly.weekEnd, { month: "short", day: "numeric" })}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setWeek(shiftDay(weekly.weekStart, -7))}
                className="min-h-8 rounded-lg bg-accent px-2.5 text-xs font-semibold text-[#8C2F51]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ‹ older
              </button>
              {!thisWeekStart && (
                <button
                  onClick={() => setWeek(shiftDay(weekly.weekStart, 7))}
                  className="min-h-8 rounded-lg bg-accent px-2.5 text-xs font-semibold text-[#8C2F51]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  newer ›
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex">
            <Stat value={weekly.totals.steps !== null ? fmt(weekly.totals.steps) : "—"} label="STEPS" />
            <Stat
              value={weekly.totals.activeEnergyKcal !== null ? fmt(weekly.totals.activeEnergyKcal) : "—"}
              label="ACTIVE KCAL"
            />
            <Stat
              value={
                weekly.totals.walkingRunningDistanceKm !== null
                  ? weekly.totals.walkingRunningDistanceKm.toFixed(1)
                  : "—"
              }
              label="KM"
            />
          </div>

          <div className="mt-4 flex h-24 items-end justify-between gap-1.5">
            {weekly.days.map((d) => {
              const isBest = weekly.best?.date === d.date;
              const isWorst = weekly.worst?.date === d.date;
              return (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end">
                  {d.steps !== null ? (
                    <div
                      className="w-full max-w-[26px] rounded-t-[4px]"
                      style={{
                        height: `${Math.max(3, (d.steps / maxSteps) * 100)}%`,
                        background: isBest ? "#A63D63" : isWorst ? "#D9A23E" : "#232227",
                      }}
                      title={`${fmt(d.steps)} steps`}
                    />
                  ) : (
                    <div className="h-[3px] w-full max-w-[26px] rounded-full bg-border" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-[5px] flex justify-between gap-1.5 text-[9.5px] text-muted-foreground">
            {weekly.days.map((d) => (
              <span key={d.date} className="flex-1 text-center">
                {d.label.toUpperCase()}
              </span>
            ))}
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2 text-[11.5px]">
            <div className="rounded-[12px] bg-background p-2.5">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                DAILY AVERAGE
              </div>
              <div className="mt-1 font-semibold text-foreground tabular-nums">
                {weekly.dailyAvg.steps !== null ? `${fmt(weekly.dailyAvg.steps)} steps` : "—"}
              </div>
              <div className="text-muted-foreground tabular-nums">
                {weekly.dailyAvg.activeEnergyKcal !== null
                  ? `${fmt(weekly.dailyAvg.activeEnergyKcal)} active kcal`
                  : ""}
              </div>
            </div>
            <div className="rounded-[12px] bg-background p-2.5">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                VS LAST WEEK
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {weekly.change.steps !== null || weekly.change.activeEnergyKcal !== null ? (
                  <>
                    <Change label="Steps" pct={weekly.change.steps} />
                    <Change label="Active kcal" pct={weekly.change.activeEnergyKcal} />
                    <Change label="Km" pct={weekly.change.walkingRunningDistanceKm} />
                  </>
                ) : (
                  <span className="text-muted-foreground">no week before to compare</span>
                )}
              </div>
            </div>
            <div className="rounded-[12px] bg-background p-2.5">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-[#A63D63]">
                BEST DAY
              </div>
              <div className="mt-1 font-semibold text-foreground tabular-nums">
                {weekly.best ? `${weekly.best.label} · ${fmt(weekly.best.steps)}` : "—"}
              </div>
            </div>
            <div className="rounded-[12px] bg-background p-2.5">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-[#D9A23E]">
                LOWEST DAY
              </div>
              <div className="mt-1 font-semibold text-foreground tabular-nums">
                {weekly.worst ? `${weekly.worst.label} · ${fmt(weekly.worst.steps)}` : "—"}
              </div>
            </div>
          </div>

          <div className="mt-3 text-[10.5px] text-muted-foreground">
            {weekly.complete
              ? `Resting energy: ${weekly.totals.restingEnergyKcal !== null ? fmt(weekly.totals.restingEnergyKcal) : "—"} kcal. Week-over-week compares daily averages.`
              : `${weekly.daysWithData} of 7 days in — averages and the comparison use the days that arrived.`}
          </div>
        </div>
      )}

      {data?.lastPush && (
        <div className="mt-4 text-center text-[11px] text-muted-foreground">
          Last push{" "}
          {new Date(data.lastPush.receivedAt).toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · {data.totalDays} days stored
        </div>
      )}
    </div>
  );
}
