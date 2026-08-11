"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Body → metric drill-in — port of the design's "Body composition detail"
// push-in (2026-08-11e rev): 4/8/12-wk chips, scrubable weekly chart,
// weekly rows with deltas, WHAT IT MEANS. One page serves all six metrics
// (?m=fat|muscle|bmr|weight|volume|kcal). The explainer copy is static per
// metric (the design demo's notes cited demo numbers — the real deltas
// live in the pill and rows).

interface MetricPoint {
  weekStart: string;
  value: number;
  readings: number;
}

interface MetricData {
  metric: string;
  unit: string;
  weeks: number;
  goal: number | null;
  series: MetricPoint[];
}

const META: Record<
  string,
  { name: string; kick: string; listKick: string; downGood: boolean; int: boolean; foot: string; note: string }
> = {
  fat: {
    name: "Body fat",
    kick: "BODY · SMART SCALE",
    listKick: "WEIGH-INS",
    downGood: true,
    int: false,
    foot: "Bioimpedance estimate · trend beats any single reading",
    note: "Estimated by bioimpedance, so single readings wobble — the trend is what counts. Morning weigh-ins, after the bathroom and before coffee, keep the readings comparable. Judge the slope over weeks, never one number.",
  },
  muscle: {
    name: "Muscle mass",
    kick: "BODY · SMART SCALE",
    listKick: "WEIGH-INS",
    downGood: false,
    int: false,
    foot: "Bioimpedance estimate · trend beats any single reading",
    note: "Holding or gaining muscle while the scale drops is the whole point of eating protein in a deficit. Flat or dipping weeks after hard sessions are usually water shifts, not lost muscle — judge it month to month.",
  },
  bmr: {
    name: "BMR",
    kick: "BODY · SMART SCALE",
    listKick: "WEIGH-INS",
    downGood: false,
    int: true,
    foot: "Recalculated each weigh-in by the scale",
    note: "Your resting burn, recalculated from each weigh-in. Losing weight without BMR falling is the game: it means the loss is fat, not the engine. If it slides for weeks, that's the cue to check protein and training volume.",
  },
  weight: {
    name: "Weight",
    kick: "BODY · TRENDS",
    listKick: "WEEKLY AVERAGES",
    downGood: true,
    int: false,
    foot: "Weekly averages of your morning weigh-ins",
    note: "The weekly wobble is water and glycogen; the slope is the truth. Around 0.25–0.5 kg a week is the band where fat goes and strength stays. Weigh in every morning and let the average do the judging.",
  },
  volume: {
    name: "Volume",
    kick: "TRAIN · VOLUME",
    listKick: "WEEKS",
    downGood: false,
    int: true,
    foot: "Tonnage = sets × reps × load, summed per week",
    note: "Weekly tonnage rising on falling bodyweight is the strongest signal in this app — strength being built, not just preserved. Two flat weeks in a row is the cue to nudge load or reps.",
  },
  kcal: {
    name: "Calories",
    kick: "FOOD · CALORIES",
    listKick: "WEEKLY AVERAGES",
    downGood: true,
    int: true,
    foot: "Daily average per logged day, per week",
    note: "A small steady deficit beats binge-and-starve swings every time. If the average hugs the goal with a tight band, protect the pattern rather than chase bigger cuts — this line is what moves the weight line.",
  },
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BodyMetricPage() {
  const router = useRouter();
  const [metric, setMetric] = useState("fat");
  const [weeksSel, setWeeksSel] = useState(12);
  const [data, setData] = useState<MetricData | null>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("m");
    if (m && META[m]) setMetric(m);
  }, []);

  const load = useCallback(async (m: string, w: number) => {
    const res = await fetch(`/api/health/body/metric?metric=${m}&weeks=${w}`);
    if (res.ok) {
      setData(await res.json());
      setScrubIdx(null);
    }
  }, []);

  useEffect(() => {
    load(metric, weeksSel);
  }, [load, metric, weeksSel]);

  const meta = META[metric];
  const fmtVal = useCallback(
    (v: number) => (meta.int ? fmtInt(v) : v.toFixed(1)),
    [meta]
  );

  const chart = useMemo(() => {
    if (!data || data.series.length < 2) return null;
    const v = data.series.map((p) => p.value);
    const mn = Math.min(...v);
    const mx = Math.max(...v);
    const span = mx - mn || 1;
    const xy = v.map(
      (x, i) =>
        [6 + i * (347.6 / (v.length - 1)), 14 + (1 - (x - mn) / span) * 108] as const
    );
    return {
      xy,
      pts: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      mn,
      mx,
    };
  }, [data]);

  const sel = useMemo(() => {
    if (!chart || !data) return null;
    const i =
      scrubIdx == null
        ? data.series.length - 1
        : Math.max(0, Math.min(data.series.length - 1, scrubIdx));
    return { i, x: chart.xy[i][0], y: chart.xy[i][1], p: data.series[i] };
  }, [chart, data, scrubIdx]);

  const scrub = (clientX: number) => {
    if (!chartRef.current || !data || data.series.length < 2) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 360;
    const step = 347.6 / (data.series.length - 1);
    setScrubIdx(Math.round((x - 6) / step));
  };

  const delta =
    data && data.series.length >= 2
      ? data.series[data.series.length - 1].value - data.series[0].value
      : null;
  const deltaGood = delta != null && (meta.downGood ? delta <= 0 : delta >= 0);

  const chip = (n: number) => (
    <button
      key={n}
      onClick={() => setWeeksSel(n)}
      className="rounded-full border border-[#E4E2E6] px-3 py-[5px] text-[11.5px] font-semibold transition-colors"
      style={{
        fontFamily: "var(--font-display)",
        background: weeksSel === n ? "#A63D63" : "#FFFFFF",
        color: weeksSel === n ? "#FFFFFF" : "#66646C",
      }}
    >
      {n} wk
    </button>
  );

  const rows = useMemo(() => {
    if (!data) return [];
    return data.series
      .map((p, i) => ({ p, d: i === 0 ? 0 : p.value - data.series[i - 1].value }))
      .slice(-6)
      .reverse();
  }, [data]);

  return (
    <div
      className="min-h-screen bg-[#F2F1F2] px-[22px] pb-16 pt-12 lg:px-8"
      style={{ animation: "pushIn .38s cubic-bezier(.3,.9,.3,1) both" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/health/body")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Body"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            {meta.kick}
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {meta.name}
          </div>
        </div>
        {delta != null && (
          <div
            className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold tabular-nums"
            style={{ color: deltaGood ? "#5E9B72" : "#D9A23E" }}
          >
            {delta >= 0 ? "+" : "−"}
            {meta.int ? fmtInt(Math.abs(delta)) : Math.abs(delta).toFixed(1)} · {weeksSel} wk
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[38px] font-bold leading-none text-foreground tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {data && data.series.length > 0
                ? fmtVal(data.series[data.series.length - 1].value)
                : "—"}
            </span>
            <span className="text-[13px] text-[#66646C]">{data?.unit ?? ""}</span>
          </div>
          {chart && (
            <div className="text-[11px] font-semibold text-[#66646C] tabular-nums">
              {fmtVal(chart.mn)} – {fmtVal(chart.mx)}
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-1.5">{[4, 8, 12].map(chip)}</div>

        {chart && data ? (
          <div className="relative mt-3" ref={chartRef}>
            <svg width="100%" viewBox="0 0 360 150" className="block">
              <line x1="0" y1="30" x2="360" y2="30" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="75" x2="360" y2="75" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="120" x2="360" y2="120" stroke="#F2F1F2" strokeWidth="1" />
              <polygon points={`6,128 ${chart.pts} 353.6,128`} fill="#F6E3EB" />
              <polyline
                points={chart.pts}
                fill="none"
                stroke="#A63D63"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {data.series.length <= 20 &&
                chart.xy.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="3" fill="#FFFFFF" stroke="#A63D63" strokeWidth="1.8" />
                ))}
              {sel && (
                <circle cx={sel.x} cy={sel.y} r="5.5" fill="#A63D63" stroke="#FFFFFF" strokeWidth="2" />
              )}
            </svg>
            <div
              className="absolute inset-0 cursor-ew-resize touch-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                scrub(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0) scrub(e.clientX);
              }}
            />
            {sel && (
              <div
                className="pointer-events-none absolute whitespace-nowrap rounded-[7px] bg-[#232227] px-2 py-1 text-[11px] font-semibold text-white tabular-nums"
                style={{
                  left: Math.max(2, Math.min(258, sel.x - 50)),
                  top: sel.y - 38,
                  transition: "left .15s ease, top .15s ease",
                }}
              >
                {fmtVal(sel.p.value)}
                {data.unit === "%" ? "%" : ` ${data.unit.split(" ")[0]}`} ·{" "}
                {weekLabel(sel.p.weekStart).toUpperCase()}
              </div>
            )}
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{weekLabel(data.series[0].weekStart).toUpperCase()}</span>
              <span>touch &amp; drag</span>
              <span>{weekLabel(data.series[data.series.length - 1].weekStart).toUpperCase()}</span>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            Not enough readings in this window yet.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-[18px] bg-white shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="px-4 pb-1.5 pt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            {meta.listKick}
          </div>
          {rows.map(({ p, d }) => (
            <div
              key={p.weekStart}
              className="flex items-center justify-between border-t border-[#F2F1F2] px-4 py-3"
            >
              <span className="text-[13px] font-semibold text-foreground">
                {weekLabel(p.weekStart)}
              </span>
              <span className="flex items-baseline gap-2.5">
                <span className="text-[13px] font-semibold text-foreground tabular-nums">
                  {fmtVal(p.value)}
                </span>
                <span
                  className="w-11 text-right text-[10.5px] font-semibold tabular-nums"
                  style={{
                    color:
                      d === 0
                        ? "#96949B"
                        : (meta.downGood ? d < 0 : d > 0)
                          ? "#5E9B72"
                          : "#D9A23E",
                  }}
                >
                  {d === 0
                    ? "—"
                    : `${d > 0 ? "+" : "−"}${meta.int ? fmtInt(Math.abs(d)) : Math.abs(d).toFixed(1)}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-[18px] bg-accent p-[18px]">
        <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-[#8C2F51]">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
          </svg>
          WHAT IT MEANS
        </div>
        <div className="mt-2.5 text-[13.5px] leading-[1.65] text-foreground">{meta.note}</div>
      </div>

      <div className="mt-4 text-center text-[11px] text-muted-foreground">{meta.foot}</div>
    </div>
  );
}
