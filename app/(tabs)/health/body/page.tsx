"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDataLoggedListener } from "@/components/use-data-logged";
import { SheetPortal } from "@/components/sheet-portal";

// Pitaya Body — full port of the design's Body screen (docs/design/
// pitaya-app.dc.html, screen 4): scrubable 12-week trend chart
// (weight/volume/calories), the tape-measure figure with per-point history,
// progress-photo compare, and the recovery card. Surfaced deviations: the
// sleep/recovery card renders its honest "arrives with sleep sync" state
// (no data source until the watch ships it), and the photo compare shows a
// quiet empty state until two photos exist.

type MetricKey = "weight" | "volume" | "kcal";

interface Overview {
  date: string;
  latestWeightKg: number | null;
  weekLabels: { start: string; end: string };
  weighIns: { date: string; value: number }[];
  series: {
    volume: number[];
    kcal: (number | null)[];
  };
  lastTapedAt: string | null;
  tape: Record<string, { points: { date: string; value: number }[] }>;
  photos: { id: string; takenAt: string; imageData: string; weightKg: number | null }[];
  sleepAvailable: boolean;
}

// Design's tap points on the figure (viewBox 120×250) → schema fields.
const BODY_POINTS: { key: string; label: string; cx: number; cy: number }[] = [
  { key: "neckCm", label: "NECK", cx: 60, cy: 37 },
  { key: "chestCm", label: "CHEST", cx: 60, cy: 66 },
  { key: "armsCm", label: "ARM", cx: 93, cy: 75 },
  { key: "waistCm", label: "WAIST", cx: 60, cy: 101 },
  { key: "hipsCm", label: "HIPS", cx: 60, cy: 124 },
  { key: "legsCm", label: "THIGH", cx: 70, cy: 158 },
  { key: "calvesCm", label: "CALF", cx: 66, cy: 198 },
];

// The design's body figure, verbatim.
const FIGURE_PATH =
  "M60,4 C67.5,4 72.5,9.5 72.5,17.5 C72.5,23.5 70.5,28.5 66.5,31.5 L66.5,36.5 C66.5,40 69,42 73.5,44 C81,46.5 87,48.5 90,52.5 C93,56 94.5,60 95,65 C95.5,73 93.5,81 92,88.5 C90.5,96 89,103 87.5,109 C86.5,114 85.5,118 85.2,121.5 C85,125 86,129 86.5,132.5 C87,136.5 85,139 82.8,138.5 C80.8,138 79.8,135.5 79.6,132.5 C79.2,128.5 78.8,124.5 78.7,121.5 C77.8,113.5 76.4,103 75.4,93 C75,86 74.8,75 76.8,63.5 C75.6,70 74.6,78 74.2,86 C73.8,94 73.6,101 74.6,108 C75.8,115 78.2,120 78.8,127.5 C79.2,137 78,147 76.4,157 C74.8,166 72.8,172.5 71.8,178.5 C71.2,184.5 72,190 72.6,196 C73,203 71.8,212.5 70.4,220.5 C69.8,225.5 69.6,229.5 69.9,232.5 C70.2,235.5 71.8,237.5 73.2,239 C74.8,240.8 74.2,243.5 71,243.5 L63.5,243.5 C61.5,243.5 60.8,241.5 61.1,238.5 C61.4,233 61.6,227 61.4,221.5 C61,212.5 60.4,204 61.2,196.5 C61.9,189.5 62.4,184 62.9,178.5 C63.4,170 63.2,161.5 62.9,154.5 C62.6,148.5 61.8,145 60,142 C58.2,145 57.4,148.5 57.1,154.5 C56.8,161.5 56.6,170 57.1,178.5 C57.6,184 58.1,189.5 58.8,196.5 C59.6,204 59,212.5 58.6,221.5 C58.4,227 58.6,233 58.9,238.5 C59.2,241.5 58.5,243.5 56.5,243.5 L49,243.5 C45.8,243.5 45.2,240.8 46.8,239 C48.2,237.5 49.8,235.5 50.1,232.5 C50.4,229.5 50.2,225.5 49.6,220.5 C48.2,212.5 47,203 47.4,196 C48,190 48.8,184.5 48.2,178.5 C47.2,172.5 45.2,166 43.6,157 C42,147 40.8,137 41.2,127.5 C41.8,120 44.2,115 45.4,108 C46.4,101 46.2,94 45.8,86 C45.4,78 44.4,70 43.2,63.5 C45.2,75 45,86 44.6,93 C43.6,103 42.2,113.5 41.3,121.5 C41.2,124.5 40.8,128.5 40.4,132.5 C40.2,135.5 39.2,138 37.2,138.5 C35,139 33,136.5 33.5,132.5 C34,129 35,125 34.8,121.5 C34.5,118 33.5,114 32.5,109 C31,103 29.5,96 28,88.5 C26.5,81 24.5,73 25,65 C25.5,60 27,56 30,52.5 C33,48.5 39,46.5 46.5,44 C51,42 53.5,40 53.5,36.5 L53.5,31.5 C49.5,28.5 47.5,23.5 47.5,17.5 C47.5,9.5 52.5,4 60,4 Z";

const TAPE_FIELDS: { key: string; label: string }[] = [
  { key: "weightKg", label: "Weight (kg)" },
  { key: "neckCm", label: "Neck" },
  { key: "chestCm", label: "Chest" },
  { key: "armsCm", label: "Arm" },
  { key: "waistCm", label: "Waist" },
  { key: "hipsCm", label: "Hips" },
  { key: "legsCm", label: "Thigh" },
  { key: "calvesCm", label: "Calf" },
];

const fmt = (n: number) => n.toLocaleString("en-US");

function monthDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BodyPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [metric, setMetric] = useState<MetricKey>("weight");
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [selPoint, setSelPoint] = useState<string | null>(null);
  const [showTape, setShowTape] = useState(false);
  const [tapeDraft, setTapeDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [cmp, setCmp] = useState(50);
  const chartRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/health/body/overview?date=${localDateStr()}&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(load, [load]);
  useDataLoggedListener(load);

  // ——— chart geometry (design: 360×150, y = 14 + (1−t)·108) ———
  // Weight plots the FULL history (daily morning weigh-ins, server-
  // downsampled ≤96 points); volume/kcal plot 12 Mon-start weeks.
  const chart = useMemo(() => {
    if (!data) return null;
    const raw: { v: number; label: string }[] = [];
    if (metric === "weight") {
      for (const w of data.weighIns) raw.push({ v: w.value, label: monthDay(w.date) });
    } else {
      const series = data.series[metric] as (number | null)[];
      series.forEach((v, i) => {
        if (v == null || v <= 0) return;
        const [y, m, d] = data.weekLabels.start.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + i * 7));
        raw.push({
          v,
          label: dt
            .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
            .toUpperCase(),
        });
      });
    }
    const pts: { x: number; y: number; v: number; label: string }[] = [];
    if (raw.length < 2) return { pts, empty: true as const };
    const values = raw.map((r) => r.v);
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const span = mx - mn || 1;
    const stepX = 347.6 / (raw.length - 1);
    raw.forEach((r, i) => {
      pts.push({
        x: 6 + i * stepX,
        y: 14 + (1 - (r.v - mn) / span) * 108,
        v: r.v,
        label: r.label,
      });
    });
    return { pts, empty: false as const };
  }, [data, metric]);

  const fv = useCallback(
    (v: number) =>
      metric === "weight" ? `${v.toFixed(1)} kg` : metric === "volume" ? `${fmt(Math.round(v))} kg` : `${fmt(Math.round(v))} kcal`,
    [metric]
  );

  // Composition mini-series for the SMART SCALE card (12-wk, 3 metrics).
  const [composition, setComposition] = useState<Record<
    string,
    { series: { weekStart: string; value: number }[] }
  > | null>(null);

  useEffect(() => {
    Promise.all(
      ["fat", "muscle", "bmr"].map((m) =>
        fetch(`/api/health/body/metric?metric=${m}&weeks=12`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then(([fat, muscle, bmr]) => {
      if (fat || muscle || bmr) {
        setComposition({
          fat: fat ?? { series: [] },
          muscle: muscle ?? { series: [] },
          bmr: bmr ?? { series: [] },
        });
      }
    });
  }, []);

  const deltaText = useMemo(() => {
    if (!chart || chart.empty || chart.pts.length < 2) return "";
    const first = chart.pts[0].v;
    const last = chart.pts[chart.pts.length - 1].v;
    if (metric === "weight") {
      const d = last - first;
      const ins = data?.weighIns ?? [];
      let span = "";
      if (ins.length >= 2) {
        const ms =
          new Date(ins[ins.length - 1].date).getTime() -
          new Date(ins[0].date).getTime();
        const wk = Math.max(1, Math.round(ms / (7 * 86_400_000)));
        span = ` · ${wk} wk`;
      }
      return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} kg${span}`;
    }
    if (metric === "volume") {
      if (first === 0) return "12 wk";
      return `${last >= first ? "+" : ""}${Math.round(((last - first) / first) * 100)}% · 12 wk`;
    }
    const avg = chart.pts.reduce((s, p) => s + p.v, 0) / chart.pts.length;
    const dev = Math.round(Math.max(...chart.pts.map((p) => Math.abs(p.v - avg))));
    return `steady · ±${dev}`;
  }, [chart, metric]);

  const selected = useMemo(() => {
    if (!chart || chart.empty || chart.pts.length === 0) return null;
    if (scrubIdx == null) return chart.pts[chart.pts.length - 1];
    // scrubIdx carries the target x — snap to the nearest point
    let best = chart.pts[0];
    for (const p of chart.pts) {
      if (Math.abs(p.x - scrubIdx) < Math.abs(best.x - scrubIdx)) best = p;
    }
    return best;
  }, [chart, scrubIdx]);

  const scrub = (clientX: number) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    setScrubIdx(((clientX - rect.left) / rect.width) * 360);
  };

  // ——— tape panel ———
  const activePoint = selPoint ?? BODY_POINTS.find((p) => (data?.tape[p.key]?.points.length ?? 0) > 0)?.key ?? "waistCm";
  const activeDef = BODY_POINTS.find((p) => p.key === activePoint);
  const activeHistory = data?.tape[activePoint]?.points ?? [];
  const activeLatest = activeHistory[activeHistory.length - 1];
  const activeFirst = activeHistory[0];
  const miniBars = useMemo(() => {
    if (activeHistory.length === 0) return [];
    const picks =
      activeHistory.length >= 3
        ? [activeHistory[0], activeHistory[Math.floor(activeHistory.length / 2)], activeLatest]
        : activeHistory;
    const vals = picks.map((p) => p.value);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const span = mx - mn || 1;
    return picks.map((p) => ({
      label: monthDay(p.date).split(" ")[0],
      pct: 40 + ((p.value - mn) / span) * 60,
    }));
  }, [activeHistory, activeLatest]);

  const saveTape = async () => {
    const payload: Record<string, number> = {};
    for (const { key } of TAPE_FIELDS) {
      const v = Number.parseFloat(tapeDraft[key] ?? "");
      if (Number.isFinite(v) && v > 0) payload[key] = v;
    }
    if (Object.keys(payload).length === 0) {
      toast("Nothing to save — add at least one number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/health/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Taped.");
      setShowTape(false);
      setTapeDraft({});
      load();
    } catch {
      toast.error("Couldn't save the tape");
    } finally {
      setSaving(false);
    }
  };

  const photos = data?.photos ?? [];
  const canCompare = photos.length >= 2;
  const newer = photos[0];
  const older = photos[1];

  return (
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="micro-label">Trends · Measurements · Recovery</p>
          <h1
            className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Body
          </h1>
        </div>
        {data?.latestWeightKg != null && (
          <span className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold tabular-nums text-[#8C2F51]">
            {data.latestWeightKg.toFixed(1)} kg
          </span>
        )}
      </div>

      {/* Trend chart */}
      <div className="mt-[18px] rounded-[18px] bg-card p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {(
              [
                ["weight", "Weight"],
                ["volume", "Volume"],
                ["kcal", "Calories"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setMetric(key);
                  setScrubIdx(null);
                }}
                className="rounded-full border border-border px-3 py-[5px] text-[11.5px] font-semibold"
                style={{
                  fontFamily: "var(--font-display)",
                  background: metric === key ? "#A63D63" : "#FFFFFF",
                  color: metric === key ? "#FFFFFF" : "#66646C",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* design 11e: the delta chip drills into the weekly trend view */}
          <button
            onClick={() =>
              router.push(
                `/health/body/metric?m=${metric === "weight" ? "weight" : metric === "volume" ? "volume" : "kcal"}`
              )
            }
            className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-[5px] text-[10.5px] font-semibold text-[#8C2F51] hover:bg-[#F0D3E0]"
          >
            {deltaText} ›
          </button>
        </div>

        {chart && !chart.empty ? (
          <div className="relative mt-3" ref={chartRef}>
            <svg width="100%" viewBox="0 0 360 150" className="block">
              <line x1="0" y1="30" x2="360" y2="30" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="75" x2="360" y2="75" stroke="#F2F1F2" strokeWidth="1" />
              <line x1="0" y1="120" x2="360" y2="120" stroke="#F2F1F2" strokeWidth="1" />
              <polygon
                points={`${chart.pts[0].x},128 ${chart.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} ${chart.pts[chart.pts.length - 1].x},128`}
                fill="#F6E3EB"
              />
              <polyline
                points={chart.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                fill="none"
                stroke="#A63D63"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Per-point dots only while the series is sparse — the
                  full-history weight line (90+ daily points) reads as a
                  clean stroke, not a bead chain. */}
              {chart.pts.length <= 20 &&
                chart.pts.map((p) => (
                  <circle
                    key={p.x}
                    cx={p.x}
                    cy={p.y}
                    r="3"
                    fill="#FFFFFF"
                    stroke="#A63D63"
                    strokeWidth="1.8"
                  />
                ))}
              {selected && (
                <circle
                  cx={selected.x}
                  cy={selected.y}
                  r="5.5"
                  fill="#A63D63"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
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
            {selected && (
              <div
                className="pointer-events-none absolute whitespace-nowrap rounded-[7px] bg-foreground px-2 py-[5px] text-[11px] font-semibold tabular-nums text-background"
                style={{
                  left: `${Math.max(2, Math.min(272, selected.x - 44)) / 3.6}%`,
                  top: selected.y - 38,
                  transition: "left .15s ease, top .15s ease",
                }}
              >
                {fv(selected.v)} · {selected.label}
              </div>
            )}
            <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{chart.pts[0].label}</span>
              <span>touch &amp; drag</span>
              <span>{chart.pts[chart.pts.length - 1].label}</span>
            </div>
          </div>
        ) : (
          <p className="mt-6 pb-4 text-center text-[12.5px] text-muted-foreground">
            Not enough {metric === "weight" ? "weigh-ins" : metric === "volume" ? "training" : "food logs"} in the last 12 weeks yet — log a couple and the line appears.
          </p>
        )}
      </div>

      {/* BODY COMPOSITION · SMART SCALE (design 11e) — tap a metric to
          drill into its weekly trend */}
      {composition && (
        <div className="mt-3 rounded-[18px] bg-card p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              BODY COMPOSITION · SMART SCALE
            </p>
            <p className="text-[11px] text-muted-foreground">12 weeks</p>
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-3.5">
            {(
              [
                ["fat", "BODY FAT", "%", "#A63D63", true],
                ["muscle", "MUSCLE", " kg", "#232227", false],
                ["bmr", "BMR", "", "#A9A7AE", false],
              ] as const
            ).map(([key, label, unit, color, downGood]) => {
              const s = composition[key];
              if (!s || s.series.length === 0) return <div key={key} />;
              const last = s.series[s.series.length - 1].value;
              const delta = s.series.length >= 2 ? last - s.series[0].value : 0;
              const good = downGood ? delta <= 0 : delta >= 0;
              const vals = s.series.map((p) => p.value);
              const mn = Math.min(...vals);
              const span = Math.max(...vals) - mn || 1;
              const spark = vals
                .map(
                  (v, i) =>
                    `${((i / Math.max(1, vals.length - 1)) * 100).toFixed(1)},${(3 + (1 - (v - mn) / span) * 20).toFixed(1)}`
                )
                .join(" ");
              return (
                <button key={key} onClick={() => router.push(`/health/body/metric?m=${key}`)} className="text-left hover:opacity-75">
                  <p className="text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                    {label} ›
                  </p>
                  <p
                    className="mt-[3px] text-[19px] font-bold text-foreground tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {key === "bmr" ? fmt(Math.round(last)) : last.toFixed(1)}
                    {unit && <span className="text-[11px] text-[#66646C]">{unit}</span>}
                  </p>
                  <p
                    className="text-[10.5px] font-semibold"
                    style={{ color: good ? "#5E9B72" : "#D9A23E" }}
                  >
                    {delta >= 0 ? "+" : "−"}
                    {key === "bmr"
                      ? `${fmt(Math.round(Math.abs(delta)))} kcal`
                      : Math.abs(delta).toFixed(1)}
                  </p>
                  <svg width="100%" height="26" viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-[5px]">
                    <polyline points={spark} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-[1.5] text-muted-foreground">
            Tap a metric to drill in · syncs each weigh-in from your smart scale.
          </p>
        </div>
      )}

      {/* Measurements */}
      <div className="mt-3 rounded-[18px] bg-card p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            MEASUREMENTS{data?.lastTapedAt ? ` · TAPED ${monthDay(data.lastTapedAt)}` : ""}
          </p>
          <button
            onClick={() => setShowTape(true)}
            className="rounded-[8px] bg-primary px-3.5 py-[7px] text-xs font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            + New tape
          </button>
        </div>
        <div className="flex gap-4">
          <svg width="104" height="217" viewBox="0 0 120 250" className="shrink-0">
            <path
              d={FIGURE_PATH}
              fill="#F2F1F2"
              stroke="#E4E2E6"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M47,64 C53,69 67,69 73,64" fill="none" stroke="#E6E0E4" strokeWidth="1.2" />
            <path d="M60,72 L60,116" stroke="#E6E0E4" strokeWidth="1.2" />
            {BODY_POINTS.map((p) => (
              <circle
                key={p.key}
                cx={p.cx}
                cy={p.cy}
                r="6"
                fill="#A63D63"
                stroke="#FFFFFF"
                strokeWidth="2"
                opacity={activePoint === p.key ? 1 : 0.55}
                className="cursor-pointer"
                onClick={() => setSelPoint(p.key)}
              />
            ))}
          </svg>
          <div className="min-w-0 flex-1">
            <div className="rounded-[12px] bg-accent p-3.5">
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-[#8C2F51]">
                {activeDef?.label ?? ""}
              </p>
              {activeLatest ? (
                <>
                  <p
                    className="mt-1 text-[28px] font-bold tabular-nums text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {activeLatest.value}{" "}
                    <span className="text-[13px] font-normal text-secondary-foreground">cm</span>
                  </p>
                  {activeFirst && activeFirst !== activeLatest && (
                    <p className="mt-0.5 text-xs font-semibold text-[#8C2F51]">
                      {activeLatest.value - activeFirst.value >= 0 ? "+" : "−"}
                      {Math.abs(activeLatest.value - activeFirst.value).toFixed(1)} since{" "}
                      {monthDay(activeFirst.date).split(" ")[0]}
                    </p>
                  )}
                  {miniBars.length > 1 && (
                    <>
                      <div className="mt-2.5 flex h-8 items-end gap-1">
                        {miniBars.map((b, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t"
                            style={{
                              height: `${b.pct}%`,
                              background: ["#DCA8BE", "#C97D9C", "#A63D63"][
                                i + (3 - miniBars.length)
                              ],
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-[3px] flex justify-between text-[9px] text-muted-foreground">
                        {miniBars.map((b, i) => (
                          <span key={i}>{b.label}</span>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[12px] leading-relaxed text-secondary-foreground">
                  No tape yet for this point — grab the measuring tape and hit + New tape.
                </p>
              )}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Tap a point on the body.
            </p>
          </div>
        </div>
      </div>

      {/* Progress photos */}
      <div className="mt-3 rounded-[18px] bg-card p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            PROGRESS PHOTOS
          </p>
          <p className="text-[11px] text-muted-foreground">from weigh-ins</p>
        </div>
        {canCompare ? (
          <>
            <div className="relative h-[150px] overflow-hidden rounded-[12px]">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${newer.imageData})` }}
              />
              <span className="absolute bottom-1.5 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-white">
                {monthDay(newer.takenAt.slice(0, 10))}
                {newer.weightKg ? ` · ${newer.weightKg.toFixed(1)} KG` : ""}
              </span>
              <div
                className="absolute bottom-0 left-0 top-0 overflow-hidden"
                style={{ width: `${cmp}%` }}
              >
                <div
                  className="h-[150px] bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${older.imageData})`,
                    width: chartRef.current?.getBoundingClientRect().width ?? 360,
                  }}
                />
                <span className="absolute bottom-1.5 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-white">
                  {monthDay(older.takenAt.slice(0, 10))}
                  {older.weightKg ? ` · ${older.weightKg.toFixed(1)} KG` : ""}
                </span>
              </div>
              <div
                className="absolute bottom-0 top-0 w-0.5 bg-white"
                style={{ left: `${cmp}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={cmp}
              onChange={(e) => setCmp(Number(e.target.value))}
              className="mt-2.5 w-full accent-[#A63D63]"
            />
          </>
        ) : (
          <p className="py-3 text-center text-[12.5px] text-muted-foreground">
            Two photos make a comparison — add one at your next weigh-in.
          </p>
        )}
      </div>

      {/* Recovery — honest state until the watch syncs sleep */}
      <div className="mt-3 rounded-[18px] border border-[#362931] bg-[#1B1518] p-[18px]">
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#7E6F77]">
            LAST NIGHT · APPLE WATCH
          </p>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#B3A3AC]">
          Recovery score, HRV, resting HR and sleep stages land here the night
          your watch starts syncing sleep.
        </p>
      </div>

      {/* ——— New tape sheet ——— */}
      {showTape && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setShowTape(false)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              New tape
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fill what you measured — skip the rest. All in kg / cm.
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              {TAPE_FIELDS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                    {label.toUpperCase()}
                  </span>
                  <input
                    inputMode="decimal"
                    value={tapeDraft[key] ?? ""}
                    onChange={(e) =>
                      setTapeDraft((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="mt-0.5 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-center text-[15px] font-semibold tabular-nums outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setShowTape(false)}
                className="flex-1 rounded-[12px] border border-[#D9D7DC] bg-card py-3 text-[13.5px] font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Cancel
              </button>
              <button
                onClick={saveTape}
                disabled={saving}
                className="flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {saving ? "Saving…" : "Save tape"}
              </button>
            </div>
          </div>
        </SheetPortal>
      )}
    </div>
  );
}
