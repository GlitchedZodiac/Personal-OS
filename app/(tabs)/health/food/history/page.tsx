"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RangePicker } from "@/components/range-picker";

// Food → History — port of the design's Food History push-in (2026-08-11e
// rev): calories-vs-goal trend with the dashed goal line, BY DAY rows with
// goal-tick progress bars, from–to range via the shared calendar sheet.
// Tapping a day opens it in Food (the day stepper).

interface HistoryDay {
  date: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isToday: boolean;
}

interface HistoryData {
  from: string;
  to: string;
  goal: number;
  avgKcal: number | null;
  days: HistoryDay[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function shortLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export default function FoodHistoryPage() {
  const router = useRouter();
  const [data, setData] = useState<HistoryData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });

  const load = useCallback(async (from: string | null, to: string | null) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await fetch(`/api/health/food/history?${qs.toString()}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load(range.from, range.to);
  }, [load, range]);

  // Chart geometry (design: 360×140, gridlines 35/70/105, dashed goal).
  const chart = useMemo(() => {
    if (!data || data.days.length === 0) return null;
    const vals = data.days.map((d) => d.kcal);
    const lo = Math.min(...vals, data.goal) - 90;
    const hi = Math.max(...vals, data.goal) + 90;
    const span = hi - lo || 1;
    const n = data.days.length;
    const X = (i: number) => (n === 1 ? 180 : 14 + i * (332 / (n - 1)));
    const Y = (v: number) => 10 + (1 - (v - lo) / span) * 118;
    return {
      line: data.days.map((d, i) => `${X(i).toFixed(1)},${Y(d.kcal).toFixed(1)}`).join(" "),
      dots:
        n <= 20
          ? data.days.map((d, i) => ({ x: X(i).toFixed(1), y: Y(d.kcal).toFixed(1) }))
          : [],
      goalY: Y(data.goal).toFixed(1),
    };
  }, [data]);

  const rangeLab =
    data &&
    `${dayLabel(data.from).replace(/^\w+, /, "")} – ${dayLabel(data.to).replace(/^\w+, /, "")}`;

  return (
    <div
      className="min-h-screen bg-[#F2F1F2] px-[22px] pb-16 pt-12 lg:px-8"
      style={{ animation: "pushIn .38s cubic-bezier(.3,.9,.3,1) both" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/health/food")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Food"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            FOOD · HISTORY
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            History
          </div>
        </div>
        {data?.avgKcal != null && (
          <div className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold text-[#8C2F51] tabular-nums">
            {fmt(data.avgKcal)} avg
          </div>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2.5">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex flex-none items-center gap-1.5 rounded-full border border-[#E4E2E6] bg-white px-[13px] py-[7px] text-[11.5px] font-semibold text-[#8C2F51] hover:bg-[#FAF9FA]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8C2F51" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
          {rangeLab ?? "…"} ▾
        </button>
        <span className="text-[11px] text-muted-foreground">
          daily totals vs goal {data ? fmt(data.goal) : "…"}
        </span>
      </div>

      {/* CALORIES · TREND */}
      <div className="mt-3.5 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            CALORIES · TREND
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="w-3.5 border-t-[1.5px] border-dashed border-[#96949B]" />
            goal
          </div>
        </div>
        {chart ? (
          <>
            <svg width="100%" height="140" viewBox="0 0 360 140" preserveAspectRatio="none" className="mt-2.5">
              <line x1="0" y1="35" x2="360" y2="35" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="70" x2="360" y2="70" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="105" x2="360" y2="105" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1={chart.goalY} x2="360" y2={chart.goalY} stroke="#96949B" strokeWidth="1.5" strokeDasharray="5 5" />
              <polyline points={chart.line} fill="none" stroke="#A63D63" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {chart.dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r="3.2" fill="#FFFFFF" stroke="#A63D63" strokeWidth="1.8" />
              ))}
            </svg>
            <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground">
              <span>{data && shortLabel(data.days[0].date)}</span>
              <span>GOAL {data && fmt(data.goal)}</span>
              <span>{data && shortLabel(data.days[data.days.length - 1].date)}</span>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            No food logged in this range.
          </p>
        )}
      </div>

      {/* BY DAY */}
      {data && data.days.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-[18px] bg-white shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="px-4 pb-1.5 pt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            BY DAY
          </div>
          {[...data.days].reverse().map((d) => {
            const diff = d.kcal - data.goal;
            return (
              <button
                key={d.date}
                onClick={() => router.push(`/health/food?date=${d.date}`)}
                className="block w-full border-t border-[#F2F1F2] px-4 py-3 text-left hover:bg-[#FAF9FA]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-foreground">
                    {d.isToday ? "Today" : dayLabel(d.date)}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-foreground tabular-nums">
                      {fmt(d.kcal)}
                    </span>
                    <span
                      className="w-[70px] text-right text-[10.5px] font-semibold"
                      style={{
                        color: d.isToday ? "#96949B" : diff <= 0 ? "#5E9B72" : "#D9A23E",
                      }}
                    >
                      {d.isToday ? "in progress" : diff <= 0 ? `−${fmt(-diff)}` : `+${fmt(diff)}`}
                    </span>
                  </span>
                </div>
                <div className="mt-[7px] flex items-center gap-2.5">
                  <div className="relative h-1.5 flex-1 rounded-full bg-[#F2F1F2]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-[#DCA8BE]"
                      style={{ width: `${Math.min(100, (d.kcal / data.goal) * 86)}%` }}
                    />
                    <div className="absolute -inset-y-0.5 left-[86%] w-[1.5px] bg-[#96949B]" />
                  </div>
                  <span className="w-[110px] text-right text-[10.5px] text-muted-foreground">
                    {d.isToday
                      ? "today — still logging"
                      : `${d.proteinG}P · ${d.carbsG}C · ${d.fatG}F`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 text-center text-[11px] text-muted-foreground">
        Tap a day to open it in Food
      </div>

      <RangePicker
        open={pickerOpen}
        title="Food history — range"
        from={data?.from ?? null}
        to={data?.to ?? null}
        onCancel={() => setPickerOpen(false)}
        onApply={(from, to) => {
          setPickerOpen(false);
          setRange({ from, to });
        }}
      />
    </div>
  );
}
