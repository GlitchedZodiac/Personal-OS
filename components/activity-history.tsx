"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityHistory, HistoryBucket, HistoryMetric } from "@/lib/activity-history";

// Steps & calories over his whole history (2026-10-17): one bar chart with a
// metric switch (steps / active kcal / km) and a range switch (days / weeks /
// months / years), then trends and all-time records. NO DESIGN SLICE — built
// from the Sunday Report's card language like the rest of /health/activity.
// One series, so no legend: the card title names it. Tap a bar to read it.

const BRAND = "#A63D63";

const METRICS: { key: HistoryMetric; label: string; unit: string }[] = [
  { key: "steps", label: "Steps", unit: "steps" },
  { key: "activeEnergyKcal", label: "Active kcal", unit: "kcal" },
  { key: "walkingRunningDistanceKm", label: "Km", unit: "km" },
];

type Range = "days" | "weeks" | "months" | "years";
const RANGES: { key: Range; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "weeks", label: "Weeks" },
  { key: "months", label: "Months" },
  { key: "years", label: "Years" },
];

function fmt(metric: HistoryMetric, n: number): string {
  if (metric === "walkingRunningDistanceKm") return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1);
  return Math.round(n).toLocaleString("en-US");
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function d(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, dd] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

function bucketLabel(range: Range, b: HistoryBucket): string {
  if (range === "days") return d(b.start, { weekday: "short", month: "short", day: "numeric" });
  if (range === "weeks") return `Week of ${d(b.start, { month: "short", day: "numeric" })}`;
  if (range === "months") return d(b.start, { month: "long", year: "numeric" });
  return b.start.slice(0, 4);
}

function tickLabel(range: Range, b: HistoryBucket): string {
  if (range === "days" || range === "weeks") return d(b.start, { month: "short", day: "numeric" });
  // "Sep '26", never "Sep 26" — that reads as the 26th of September.
  if (range === "months") return `${d(b.start, { month: "short" })} '${b.start.slice(2, 4)}`;
  return b.start.slice(0, 4);
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const color = pct === 0 ? "#66646C" : pct > 0 ? "#5E9B72" : "#D9A23E";
  return (
    <span className="font-semibold tabular-nums" style={{ color }}>
      {pct === 0 ? "even" : `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`}
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="min-h-8 rounded-full px-3 text-[11.5px] font-semibold"
      style={{
        background: on ? "#232227" : "transparent",
        color: on ? "#FFFFFF" : "#66646C",
        border: on ? "1px solid #232227" : "1px solid var(--border)",
        fontFamily: "var(--font-display)",
      }}
    >
      {children}
    </button>
  );
}

const card = "mt-3 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]";
const kicker = "text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground";

export function ActivityHistoryView() {
  const [data, setData] = useState<ActivityHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<HistoryMetric>("steps");
  const [range, setRange] = useState<Range>("days");
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/health/activity/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ActivityHistory) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const buckets = useMemo(() => (data ? data[range] : []), [data, range]);
  const values = buckets.map((b) => b.avg[metric]);
  const present = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...present);
  const mean = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  const bestIdx = present.length ? values.indexOf(Math.max(...present)) : -1;
  const unit = METRICS.find((m) => m.key === metric)!.unit;
  const perDay = range === "days" ? "" : "/day";

  if (failed && !data) {
    return <p className="mt-4 text-center text-[12px] text-muted-foreground">Couldn&apos;t load your history.</p>;
  }
  if (!data) {
    return <p className="mt-4 text-center text-[12px] text-muted-foreground">Reading your history…</p>;
  }
  if (data.daysWithData === 0) return null;

  const sel = picked !== null ? buckets[picked] : null;
  const ticks = buckets.length <= 8 ? buckets.map((_, i) => i) : [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1];
  const at = data.allTime;

  return (
    <>
      {/* ——— history chart ——— */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className={kicker}>HISTORY</div>
          <div className="text-[11px] text-muted-foreground">through {d(data.asOf, { month: "short", day: "numeric" })}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <Chip key={m.key} on={metric === m.key} onClick={() => { setMetric(m.key); setPicked(null); }}>
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-[10px] bg-background p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRange(r.key); setPicked(null); }}
              className="min-h-8 rounded-[8px] text-[11.5px] font-semibold"
              style={{
                background: range === r.key ? "var(--card)" : "transparent",
                color: range === r.key ? "#232227" : "#66646C",
                boxShadow: range === r.key ? "0 1px 4px rgba(35,34,39,0.08)" : "none",
                fontFamily: "var(--font-display)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* readout: the tapped bar, or the range at a glance */}
        <div className="mt-3 min-h-[44px]">
          {sel ? (
            <>
              <div className="text-[11px] text-muted-foreground">{bucketLabel(range, sel)}</div>
              <div className="text-[19px] font-bold text-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                {sel.avg[metric] !== null ? `${fmt(metric, sel.avg[metric]!)} ${unit}${perDay}` : "no data"}
              </div>
              {range !== "days" && sel.total[metric] !== null && (
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {fmt(metric, sel.total[metric]!)} {unit} total · {sel.days} day{sel.days === 1 ? "" : "s"} in
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">
                Average {range === "days" ? "day" : `per day, by ${range.slice(0, -1)}`}
              </div>
              <div className="text-[19px] font-bold text-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                {mean !== null ? `${fmt(metric, mean)} ${unit}` : "—"}
              </div>
              {bestIdx >= 0 && (
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  best {tickLabel(range, buckets[bestIdx])} · {fmt(metric, values[bestIdx]!)}
                  {perDay} · tap a bar to read it
                </div>
              )}
            </>
          )}
        </div>

        <div className="relative mt-2 h-32">
          {mean !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${(mean / max) * 100}%`, borderColor: "#A9A7AE" }}
              aria-hidden
            />
          )}
          <div className="flex h-full items-end gap-[2px]">
            {buckets.map((b, i) => {
              const v = values[i];
              const on = picked === i;
              return (
                <button
                  key={b.start}
                  onClick={() => setPicked(on ? null : i)}
                  className="flex h-full min-w-0 flex-1 items-end"
                  aria-label={`${bucketLabel(range, b)}: ${v !== null ? `${fmt(metric, v)} ${unit}${perDay}` : "no data"}`}
                >
                  {v !== null ? (
                    <div
                      className="w-full rounded-t-[4px]"
                      style={{
                        height: `${Math.max(2, (v / max) * 100)}%`,
                        background: on ? "#232227" : BRAND,
                        opacity: picked === null || on ? 1 : 0.45,
                      }}
                    />
                  ) : (
                    <div className="h-[2px] w-full rounded-full bg-border" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative mt-[5px] h-3 text-[9.5px] text-muted-foreground">
          {ticks.map((i) => (
            <span
              key={i}
              className="absolute whitespace-nowrap"
              style={
                i === 0
                  ? { left: 0 }
                  : i === buckets.length - 1
                    ? { right: 0 }
                    : { left: `${((i + 0.5) / buckets.length) * 100}%`, transform: "translateX(-50%)" }
              }
            >
              {tickLabel(range, buckets[i])}
            </span>
          ))}
        </div>
        {range !== "days" && (
          <div className="mt-2.5 text-[10.5px] text-muted-foreground">
            Bars are the daily average over the days that arrived; the dashed line is the average bar.
          </div>
        )}
      </div>

      {/* ——— trends ——— */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className={kicker}>TRENDS · {METRICS.find((m) => m.key === metric)!.label.toUpperCase()}</div>
          <div className="text-[11px] text-muted-foreground">avg/day · vs the period before</div>
        </div>
        <div className="mt-2 divide-y divide-border">
          {data.trends.map((t) => (
            <div key={t.key} className="flex items-center justify-between py-2 text-[12.5px]">
              <span className="text-foreground">Last {t.days === 365 ? "12 months" : `${t.days} days`}</span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="font-semibold text-foreground">
                  {t.avg[metric] !== null ? fmt(metric, t.avg[metric]!) : "—"}
                </span>
                <span className="w-[64px] text-right text-[11.5px]">
                  <Delta pct={t.change[metric]} />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ——— all time ——— */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className={kicker}>ALL TIME</div>
          {data.firstDate && (
            <div className="text-[11px] text-muted-foreground">since {d(data.firstDate, { month: "short", year: "numeric" })}</div>
          )}
        </div>
        <div className="mt-3 flex">
          {(
            [
              [at.total.steps !== null ? compact(at.total.steps) : "—", "STEPS"],
              [at.dailyAvg.steps !== null ? fmt("steps", at.dailyAvg.steps) : "—", "AVG/DAY"],
              [String(data.daysWithData), "DAYS"],
              [String(at.daysOver10k), "10K DAYS"],
            ] as const
          ).map(([v, l]) => (
            <div key={l} className="flex-1">
              <div className="text-[19px] font-bold text-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                {v}
              </div>
              <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2 text-[11.5px]">
          {(
            [
              ["BEST DAY", at.bestDay.steps ? `${fmt("steps", at.bestDay.steps.value)} · ${d(at.bestDay.steps.date, { month: "short", day: "numeric", year: "numeric" })}` : "—"],
              ["BEST WEEK", at.bestWeek ? `${fmt("steps", at.bestWeek.avg)}/day · wk of ${d(at.bestWeek.start, { month: "short", day: "numeric", year: "numeric" })}` : "—"],
              ["BEST MONTH", at.bestMonth ? `${fmt("steps", at.bestMonth.avg)}/day · ${d(at.bestMonth.start, { month: "short", year: "numeric" })}` : "—"],
              ["10K STREAK", `${at.current10kStreak} now · best ${at.longest10kStreak}`],
              ["MOST KCAL", at.bestDay.activeEnergyKcal ? `${fmt("activeEnergyKcal", at.bestDay.activeEnergyKcal.value)} · ${d(at.bestDay.activeEnergyKcal.date, { month: "short", day: "numeric", year: "numeric" })}` : "—"],
              ["LONGEST WALK DAY", at.bestDay.walkingRunningDistanceKm ? `${fmt("walkingRunningDistanceKm", at.bestDay.walkingRunningDistanceKm.value)} km · ${d(at.bestDay.walkingRunningDistanceKm.date, { month: "short", day: "numeric", year: "numeric" })}` : "—"],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-[12px] bg-background p-2.5">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">{l}</div>
              <div className="mt-1 font-semibold text-foreground tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {at.weekdaySteps.some((v) => v !== null) && (
          <>
            <div className={`${kicker} mt-4`}>STEPS BY WEEKDAY</div>
            <div className="mt-2 flex h-14 items-end gap-[6px]">
              {at.weekdaySteps.map((v, i) => {
                const top = Math.max(1, ...at.weekdaySteps.map((x) => x ?? 0));
                return (
                  <div key={i} className="flex h-full flex-1 items-end" title={v !== null ? `${fmt("steps", v)} steps` : "no data"}>
                    <div
                      className="w-full rounded-t-[4px]"
                      style={{ height: `${v !== null ? Math.max(3, (v / top) * 100) : 3}%`, background: v !== null ? BRAND : "var(--border)" }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-[5px] flex gap-[6px] text-center text-[9.5px] text-muted-foreground">
              {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
                <span key={i} className="flex-1">
                  {l}
                  <br />
                  <span className="tabular-nums">{at.weekdaySteps[i] !== null ? compact(at.weekdaySteps[i]!) : "—"}</span>
                </span>
              ))}
            </div>
          </>
        )}

        <div className="mt-3.5 text-[10.5px] leading-[1.5] text-muted-foreground">
          {data.origins.app > 0 && data.origins.shortcut === 0
            ? `These ${data.origins.app} days come from the iPhone app's own Health sync, which only runs when the app is open — some days are partial. Run the Health History Shortcut once to bring in every day Health has.`
            : data.origins.app > 0
              ? `${data.origins.shortcut} days from the Health Shortcut; ${data.origins.app} filled in from the iPhone app's sync (may be partial).`
              : `${data.origins.shortcut} days from the Health Shortcut.`}
        </div>
      </div>
    </>
  );
}
