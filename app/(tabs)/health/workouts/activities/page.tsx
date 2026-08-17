"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decodePolyline } from "@/lib/polyline";
import { CircuitIcon, TrailIcon, TrainIcon, WalkIcon } from "@/components/pitaya-icons";
import { RangePicker } from "@/components/range-picker";

// Train → Activities — port of the design's activity-history push-in screens
// (docs/design/pitaya-app.dc.html, 2026-08-11 rev: actList + actDet views).
// All data is real. Surfaced deviations from the design demo: the SPLITS
// card is omitted (no per-km split data is stored — streams carry HR and
// altitude only), and the "Apple Watch" copy is source-aware because his
// history spans Strava imports, live web sessions, and chat logs too.

type ActivityType = "kb" | "cir" | "out";

interface ActivityCard {
  id: string;
  type: ActivityType;
  name: string;
  workoutType: string;
  startedAt: string;
  durationMinutes: number;
  distanceMeters: number | null;
  elevationGainM: number | null;
  stepCount: number | null;
  volumeKg: number;
  roundsCompleted: number | null;
  workSeconds: number | null;
  externalSource: string | null;
  source: string | null;
}

interface ActivityDetail extends ActivityCard {
  caloriesBurned: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  prCount: number;
  sequenceName: string | null;
  totalRounds: number | null;
  stepSeconds: number[] | null;
  segments: { name: string; sub: string; seconds: number | null; deltaSeconds: number | null }[];
  hrStream: number[] | null;
  zonePct: number[] | null;
  altitudeStream: number[] | null;
  polyline: string | null;
}

// Design's type palettes (ICO/CLR maps) — icon circle bg + stroke.
const TYPE_COLORS: Record<ActivityType, [string, string]> = {
  kb: ["#F6E3EB", "#8C2F51"],
  cir: ["#F0EEF2", "#66646C"],
  out: ["#EAF3ED", "#3E7A54"],
};
// Zone ramp + segment-timeline ramp, verbatim.
const ZONE_COLORS = ["#E7E5E9", "#DCA8BE", "#C97D9C", "#A63D63", "#8C2F51"];
const RAMP = ["#DCA8BE", "#A63D63", "#C97D9C", "#8C2F51", "#E795B4"];

const fmt = (n: number) => n.toLocaleString("en-US");

function mmss(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function heroTime(d: { workSeconds: number | null; durationMinutes: number }) {
  return d.workSeconds != null && d.workSeconds > 0
    ? mmss(d.workSeconds)
    : `${d.durationMinutes}:00`;
}

function deltaLabel(deltaSeconds: number | null): { text: string; color: string } {
  if (deltaSeconds == null) return { text: "—", color: "#96949B" };
  if (deltaSeconds === 0) return { text: "even vs last", color: "#96949B" };
  const sign = deltaSeconds < 0 ? "−" : "+";
  const color = deltaSeconds < 0 ? "#5E9B72" : "#D9A23E";
  return { text: `${sign}${mmss(Math.abs(deltaSeconds))} vs last`, color };
}

function sourceLabel(a: { externalSource: string | null; source: string | null }) {
  if (a.externalSource === "strava") return "SYNCED FROM STRAVA";
  if (a.externalSource?.startsWith("app_watch") || a.externalSource?.startsWith("watch"))
    return "MIRRORED FROM WATCH";
  if (a.source === "live") return "LIVE ON PITAYA";
  return "LOGGED VIA CHAT";
}

function kicker(a: ActivityDetail) {
  const d = new Date(a.startedAt);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const day = sameDay
    ? "TODAY"
    : d
        .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        .toUpperCase();
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
  const gps = a.type === "out" && a.polyline ? " · GPS" : "";
  return `${day} · ${time} · ${sourceLabel(a)}${gps}`;
}

function subLine(a: ActivityCard) {
  const d = new Date(a.startedAt);
  const today = new Date();
  const day =
    d.toDateString() === today.toDateString()
      ? "Today"
      : d.toLocaleDateString("en-US", { weekday: "short" }) +
        (Date.now() - d.getTime() > 6 * 86_400_000
          ? ` ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : "");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const label =
    a.type === "out" ? a.workoutType.replace(/_/g, " ") : a.type === "cir" ? "circuit" : "kettlebell";
  return `${day} · ${time} · ${label}`;
}

// Design's chart(): min/max-normalized polyline points for a w×h viewBox.
function chartPoints(values: number[], w: number, h: number, pad: number) {
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const r = mx - mn || 1;
  return values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * w).toFixed(1)},${(
          pad +
          (1 - (v - mn) / r) * (h - 2 * pad)
        ).toFixed(1)}`
    )
    .join(" ");
}

// Project a Strava polyline into the design's 392×300 map viewBox.
function routePath(polyline: string): {
  d: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
} | null {
  try {
    const pts = decodePolyline(polyline);
    if (pts.length < 2) return null;
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const [lat, lng] of pts) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
    const pad = 36;
    const w = 392 - pad * 2;
    const h = 300 - pad * 2;
    const latR = maxLat - minLat || 1e-4;
    const lngR = maxLng - minLng || 1e-4;
    const scale = Math.min(w / lngR, h / latR);
    const ox = pad + (w - lngR * scale) / 2;
    const oy = pad + (h - latR * scale) / 2;
    const xy = ([lat, lng]: [number, number]) =>
      [ox + (lng - minLng) * scale, oy + (maxLat - lat) * scale] as const;
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${xy(p)[0].toFixed(1)} ${xy(p)[1].toFixed(1)}`)
      .join(" ");
    const [sx, sy] = xy(pts[0]);
    const [ex, ey] = xy(pts[pts.length - 1]);
    return { d, sx, sy, ex, ey };
  } catch {
    return null;
  }
}

function ActivityGlyph({ a, size = 20 }: { a: { type: ActivityType; workoutType: string }; size?: number }) {
  const icon =
    a.type === "out" ? (
      /walk/i.test(a.workoutType) ? (
        <WalkIcon size={size} strokeWidth={1.9} />
      ) : (
        <TrailIcon size={size} strokeWidth={1.9} />
      )
    ) : a.type === "cir" ? (
      <CircuitIcon size={size} strokeWidth={1.9} />
    ) : (
      <TrainIcon size={size} strokeWidth={1.9} />
    );
  // icons stroke currentColor — the design's per-type tint comes from here
  return <span className="flex" style={{ color: TYPE_COLORS[a.type][1] }}>{icon}</span>;
}

export default function ActivitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityCard[]>([]);
  const [total, setTotal] = useState(0);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<"all" | "gym" | "out">("all");
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (before: string | null) => {
      const qs = new URLSearchParams();
      if (before) qs.set("before", before);
      if (range.from) qs.set("from", range.from);
      if (range.to) qs.set("to", range.to);
      const res = await fetch(`/api/health/workouts/activities?${qs.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      setItems((prev) => (before ? [...prev, ...body.items] : body.items));
      setTotal(body.total);
      setNextBefore(body.nextBefore);
    },
    [range]
  );

  useEffect(() => {
    loadPage(null);
    // Deep link: /health/workouts/activities?id=<workout> opens that detail
    // (window.location avoids the useSearchParams Suspense requirement).
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      fetch(`/api/health/workouts/activity?id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setDetail(d))
        .catch(() => {});
    }
  }, [loadPage]);

  // "older weeks load as you scroll" — cursor pagination on a sentinel.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextBefore) return;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      await loadPage(nextBefore);
      setLoadingMore(false);
    });
    io.observe(node);
    return () => io.disconnect();
  }, [nextBefore, loadingMore, loadPage]);

  const openDetail = async (id: string) => {
    const res = await fetch(`/api/health/workouts/activity?id=${encodeURIComponent(id)}`);
    if (res.ok) setDetail(await res.json());
  };

  const shown = useMemo(
    () =>
      items.filter((a) =>
        filter === "all" ? true : filter === "gym" ? a.type !== "out" : a.type === "out"
      ),
    [items, filter]
  );

  const cardStat = (a: ActivityCard): [string, string] => {
    if (a.type === "out") {
      const km = ((a.distanceMeters ?? 0) / 1000).toFixed(1);
      const lab =
        a.elevationGainM && a.elevationGainM > 0
          ? `+${Math.round(a.elevationGainM)} m`
          : a.stepCount
            ? `${fmt(a.stepCount)} steps`
            : `${a.durationMinutes} min`;
      return [`${km} km`, lab];
    }
    const time = heroTime(a);
    const lab =
      a.type === "cir" && a.roundsCompleted
        ? `${a.roundsCompleted} rounds`
        : `${fmt(a.volumeKg)} kg`;
    return [time, lab];
  };

  // ——— detail derived pieces ———
  const det = detail;
  const blocks = useMemo(() => {
    if (!det || det.type === "out") return [];
    // EMOM: alternating work blocks per round; else stepSeconds proportions.
    if (det.totalRounds && det.totalRounds > 1) {
      return Array.from({ length: Math.min(det.totalRounds, 40) }, (_, i) => ({
        w: `${100 / det.totalRounds!}%`,
        c: i % 2 ? "#4A3540" : "#A63D63",
      }));
    }
    const secs = det.stepSeconds?.filter((s) => s > 0) ?? [];
    const sum = secs.reduce((s, x) => s + x, 0);
    if (sum <= 0) return [];
    return secs.map((s, i) => ({
      w: `${((s / sum) * 100).toFixed(1)}%`,
      c: RAMP[i % RAMP.length],
    }));
  }, [det]);

  const stats = useMemo(() => {
    if (!det) return [];
    const hr = (v: number | null) => (v ? `${Math.round(v)} bpm` : "—");
    if (det.type === "out") {
      return [
        ["DISTANCE", `${((det.distanceMeters ?? 0) / 1000).toFixed(1)} km`],
        ["ELEV GAIN", det.elevationGainM ? `+${Math.round(det.elevationGainM)} m` : "—"],
        ["MOVING TIME", `${det.durationMinutes}:00`],
        ["STEPS", det.stepCount ? fmt(det.stepCount) : "—"],
        ["CALORIES", det.caloriesBurned ? String(Math.round(det.caloriesBurned)) : "—"],
        ["AVG HR", hr(det.avgHeartRateBpm)],
      ];
    }
    if (det.type === "cir") {
      const rounds =
        det.roundsCompleted != null
          ? det.totalRounds
            ? `${det.roundsCompleted} of ${det.totalRounds}`
            : String(det.roundsCompleted)
          : "—";
      // ":1065 /rd" incident: a 1-round circuit has no per-round average
      // worth showing — fall back to per-movement, always mm:ss.
      const perRound =
        det.workSeconds && det.roundsCompleted && det.roundsCompleted > 1
          ? mmss(det.workSeconds / det.roundsCompleted) + " /round"
          : null;
      const perMove =
        det.workSeconds && det.segments.length > 1
          ? mmss(det.workSeconds / det.segments.length) + " /move"
          : null;
      const avgWork = perRound ?? perMove ?? "—";
      return [
        ["TOTAL TIME", heroTime(det)],
        ["ROUNDS", rounds],
        ["CALORIES", det.caloriesBurned ? String(Math.round(det.caloriesBurned)) : "—"],
        ["AVG WORK", avgWork],
        ["AVG HR", hr(det.avgHeartRateBpm)],
        ["MAX HR", hr(det.maxHeartRateBpm)],
      ];
    }
    return [
      ["TOTAL TIME", heroTime(det)],
      ["VOLUME", `${fmt(det.volumeKg)} kg`],
      ["CALORIES", det.caloriesBurned ? String(Math.round(det.caloriesBurned)) : "—"],
      ["AVG HR", hr(det.avgHeartRateBpm)],
      ["MAX HR", hr(det.maxHeartRateBpm)],
      ["PRS", String(det.prCount)],
    ];
  }, [det]);

  const route = useMemo(
    () => (det?.polyline ? routePath(det.polyline) : null),
    [det]
  );
  const hrLine = useMemo(
    () => (det?.hrStream && det.hrStream.length > 1 ? chartPoints(det.hrStream, 360, 110, 8) : null),
    [det]
  );
  const elevLine = useMemo(
    () =>
      det?.altitudeStream && det.altitudeStream.length > 1
        ? chartPoints(det.altitudeStream, 360, 110, 8)
        : null,
    [det]
  );

  const chip = (key: "all" | "gym" | "out", label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className="rounded-full border border-[#E4E2E6] px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors"
      style={{
        fontFamily: "var(--font-display)",
        background: filter === key ? "#232227" : "#FFFFFF",
        color: filter === key ? "#FFFFFF" : "#66646C",
      }}
    >
      {label}
    </button>
  );

  // ——— detail view (design actDet, push-in over everything) ———
  if (det) {
    const dark = det.type !== "out";
    return (
      <div
        className="min-h-screen bg-[#F2F1F2] pb-14"
        style={{ animation: "pushIn .38s cubic-bezier(.3,.9,.3,1) both" }}
      >
        {/* header panel: GPS map (out), distance hero (treadmill/no-GPS out),
            or segment timeline (strength/circuit) */}
        {det.type === "out" && !route ? (
          <div className="relative overflow-hidden bg-[#251C21] px-[22px] pb-[22px] pt-16">
            <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#7E6F77]">
              {/treadmill/i.test(det.workoutType) ? "TREADMILL" : "INDOOR · NO GPS"}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span
                className="text-[44px] font-bold leading-none text-[#F0E8EC] tabular-nums"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {((det.distanceMeters ?? 0) / 1000).toFixed(1)} km
              </span>
              <span className="text-[11px] font-semibold tracking-[0.1em] text-[#7E6F77]">
                {det.durationMinutes}:00 TOTAL
              </span>
            </div>
          </div>
        ) : det.type === "out" ? (
          <div className="relative h-[300px] overflow-hidden bg-[#251C21]">
            <svg width="100%" height="300" viewBox="0 0 392 300" preserveAspectRatio="none">
              <path
                d="M0 60 H392 M0 120 H392 M0 180 H392 M0 240 H392 M78 0 V300 M156 0 V300 M234 0 V300 M312 0 V300"
                stroke="#2C2127"
                strokeWidth="1"
              />
              <path
                d="M-10 250 C60 236 120 258 190 244 C250 232 310 246 400 228"
                fill="none"
                stroke="#3A2C33"
                strokeWidth="1.5"
                strokeDasharray="5 6"
              />
              <path
                d="M-10 96 C70 84 140 104 210 88 C280 74 340 88 400 70"
                fill="none"
                stroke="#3A2C33"
                strokeWidth="1.5"
                strokeDasharray="5 6"
              />
              {route && (
                <>
                  <path d={route.d} fill="none" stroke="#CE5C86" strokeWidth="4" strokeLinecap="round" />
                  <circle cx={route.sx} cy={route.sy} r="6" fill="#8FBF9C" stroke="#1B1518" strokeWidth="2" />
                  <circle cx={route.ex} cy={route.ey} r="7" fill="#CE5C86" stroke="#1B1518" strokeWidth="2.5" />
                </>
              )}
            </svg>
            <div className="absolute bottom-3 left-4 text-[10px] font-semibold tracking-[0.12em] text-[#7E6F77]">
              {(det.name || "").toUpperCase()}
            </div>
            {det.polyline && (
              <div className="absolute right-4 top-5 flex items-center gap-1.5 text-[10.5px] font-bold text-[#8FBF9C]">
                <span className="h-[7px] w-[7px] rounded-full bg-[#8FBF9C]" />
                GPS
              </div>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden bg-[#1B1518] px-[22px] pb-[22px] pt-16">
            <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#7E6F77]">
              SEGMENT TIMELINE
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span
                className="text-[44px] font-bold leading-none text-[#F0E8EC] tabular-nums"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {heroTime(det)}
              </span>
              <span className="text-[11px] font-semibold tracking-[0.1em] text-[#7E6F77]">TOTAL</span>
            </div>
            {blocks.length > 0 && (
              <>
                <div className="mt-4 flex h-[26px] gap-[3px] overflow-hidden rounded-[8px]">
                  {blocks.map((b, i) => (
                    <div key={i} style={{ height: "100%", width: b.w, background: b.c }} />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[9.5px] text-[#7E6F77]">
                  <span>0:00</span>
                  {/* his note: the bar read as zones — say what it is */}
                  <span>one block per movement · width = its time</span>
                  <span>{heroTime(det)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={() => setDetail(null)}
          className="absolute left-4 top-4 z-[5] flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(242,241,242,0.92)] hover:bg-white"
          aria-label="Back to activities"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>

        <div className="px-[22px] pt-[18px]">
          <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            {kicker(det)}
          </div>
          <div
            className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {det.name}
          </div>

          {/* stats grid */}
          <div className="mt-3.5 rounded-[18px] bg-white px-4 py-2 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="grid grid-cols-2">
              {stats.map(([l, v]) => (
                <div key={l} className="py-2.5">
                  <div
                    className="text-[20px] font-bold text-foreground tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {v}
                  </div>
                  <div className="mt-[3px] text-[9.5px] font-semibold tracking-[0.1em] text-muted-foreground">
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* segments (strength/circuit) */}
          {dark && det.segments.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-[18px] bg-white shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
              <div className="px-4 pb-2 pt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                SEGMENTS · TIME TO COMPLETE
              </div>
              {det.segments.map((g, i) => {
                const delta = deltaLabel(g.deltaSeconds);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between border-t border-[#F2F1F2] px-4 py-3"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">{g.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{g.sub}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-foreground tabular-nums">
                        {g.seconds != null ? mmss(g.seconds) : "—"}
                      </div>
                      <div className="mt-px text-[10px]" style={{ color: delta.color }}>
                        {delta.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* elevation (outdoor, when an altitude stream exists) */}
          {det.type === "out" && elevLine && det.altitudeStream && (
            <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
              <div className="flex items-center justify-between">
                <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                  ELEVATION
                </div>
                <div className="text-[11px] font-semibold text-[#66646C] tabular-nums">
                  {fmt(Math.round(Math.min(...det.altitudeStream)))} –{" "}
                  {fmt(Math.round(Math.max(...det.altitudeStream)))} m
                </div>
              </div>
              <svg width="100%" height="110" viewBox="0 0 360 110" preserveAspectRatio="none" className="mt-2.5">
                <line x1="0" y1="28" x2="360" y2="28" stroke="#F2F1F2" strokeWidth="1" />
                <line x1="0" y1="56" x2="360" y2="56" stroke="#F2F1F2" strokeWidth="1" />
                <line x1="0" y1="84" x2="360" y2="84" stroke="#F2F1F2" strokeWidth="1" />
                <polygon points={`0,110 ${elevLine} 360,110`} fill="#EBE9ED" />
                <polyline points={elevLine} fill="none" stroke="#96949B" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <div className="mt-1 flex justify-between text-[9.5px] text-muted-foreground">
                <span>START</span>
                <span>{((det.distanceMeters ?? 0) / 1000).toFixed(1)} KM</span>
              </div>
            </div>
          )}

          {/* heart rate + zones (when an HR stream exists) */}
          {(hrLine || det.zonePct) && (
            <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
              <div className="flex items-center justify-between">
                <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                  HEART RATE
                </div>
                <div className="text-[11px] font-semibold text-[#8C2F51] tabular-nums">
                  avg {det.avgHeartRateBpm ? `${det.avgHeartRateBpm} bpm` : "—"} · max{" "}
                  {det.maxHeartRateBpm ? `${det.maxHeartRateBpm} bpm` : "—"}
                </div>
              </div>
              {hrLine && (
                <svg width="100%" height="110" viewBox="0 0 360 110" preserveAspectRatio="none" className="mt-2.5">
                  <line x1="0" y1="28" x2="360" y2="28" stroke="#F2F1F2" strokeWidth="1" />
                  <line x1="0" y1="56" x2="360" y2="56" stroke="#F2F1F2" strokeWidth="1" />
                  <line x1="0" y1="84" x2="360" y2="84" stroke="#F2F1F2" strokeWidth="1" />
                  <polygon points={`0,110 ${hrLine} 360,110`} fill="#F6E3EB" />
                  <polyline points={hrLine} fill="none" stroke="#A63D63" strokeWidth="2.2" strokeLinejoin="round" />
                </svg>
              )}
              {det.zonePct && (
                <>
                  <div className="mb-2.5 mt-3.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                    TIME IN ZONES
                  </div>
                  <div className="grid gap-2">
                    {det.zonePct.map((p, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className="w-5 text-[10.5px] font-bold text-muted-foreground">
                          Z{i + 1}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F2F1F2]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, p * 2.2)}%`,
                              background: ZONE_COLORS[i],
                            }}
                          />
                        </div>
                        <span className="w-9 text-right text-[10.5px] text-[#66646C] tabular-nums">
                          {p}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* freestyle: a recorded session with no structure — describe it,
              the coach measures the description against the recording */}
          {det.segments.length === 0 && !det.sequenceName && (
            <button
              onClick={() => {
                const facts = [
                  `Freestyle session to describe: workout ${det.id}`,
                  new Date(det.startedAt).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }),
                  `${det.durationMinutes} min`,
                  det.avgHeartRateBpm
                    ? `avg HR ${det.avgHeartRateBpm}${det.maxHeartRateBpm ? ` (max ${det.maxHeartRateBpm})` : ""}`
                    : null,
                  det.zonePct
                    ? `zones ${det.zonePct.map((p, i) => `Z${i + 1} ${p}%`).join(" ")}`
                    : null,
                  det.elevationGainM && det.elevationGainM > 0
                    ? `+${Math.round(det.elevationGainM)} m elevation`
                    : null,
                  det.caloriesBurned ? `${Math.round(det.caloriesBurned)} kcal` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                sessionStorage.setItem(
                  "pitaya:pending-chat",
                  JSON.stringify({ text: facts, source: "text" }),
                );
                router.push("/chat");
              }}
              className="tap-scale mt-4 w-full rounded-[12px] bg-[#232227] py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#38343C]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Describe what this was →
            </button>
          )}
          {det.segments.length === 0 && !det.sequenceName && (
            <p className="mt-2 text-center text-[10.5px] leading-[1.5] text-muted-foreground">
              A follow-along or improvised session? Say what you did — the coach
              measures it against the recording, and can keep it as a routine.
            </p>
          )}

          <div className="mt-4 text-center text-[11px] text-muted-foreground">
            {sourceLabel(det).charAt(0) + sourceLabel(det).slice(1).toLowerCase()} · synced to
            Pitaya
          </div>

          {/* his ask: delete a wrong workout — confirm-first, PRs rebuild
              server-side on the next backfill */}
          <button
            onClick={async () => {
              if (!window.confirm(`Delete "${det.name}" and its logged data?`)) return;
              const res = await fetch(
                `/api/health/workouts?id=${encodeURIComponent(det.id)}`,
                { method: "DELETE" }
              );
              if (res.ok) {
                toast.success("Workout deleted");
                setDetail(null);
                loadPage(null);
              } else {
                toast.error("Couldn't delete");
              }
            }}
            className="mx-auto mt-3 block text-[12.5px] font-semibold text-[#B4536F]"
          >
            Delete this workout
          </button>
        </div>
      </div>
    );
  }

  // ——— list view (design actList) ———
  return (
    <div
      className="min-h-screen bg-[#F2F1F2] px-[22px] pb-16 pt-12 lg:px-8"
      style={{ animation: "pushIn .38s cubic-bezier(.3,.9,.3,1) both" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/health/workouts")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Train"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            TRAIN · HISTORY
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Activities
          </div>
        </div>
        <div className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold text-[#8C2F51] tabular-nums">
          {shown.length} of {total}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-1.5">
        {chip("all", "All")}
        {chip("gym", "Gym")}
        {chip("out", "Outdoor")}
        <div className="flex-1" />
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-[#E4E2E6] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#8C2F51] hover:bg-[#FAF9FA]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8C2F51" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
          {range.from && range.to
            ? `${range.from.slice(5).replace("-", "/")} – ${range.to.slice(5).replace("-", "/")}`
            : "All time"}
        </button>
      </div>

      <div className="mt-3.5 grid gap-2.5">
        {shown.map((a) => {
          const [stat, statLab] = cardStat(a);
          return (
            <button
              key={a.id}
              onClick={() => openDetail(a.id)}
              className="flex items-center gap-3 rounded-[16px] bg-white px-3.5 py-[13px] text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
            >
              <div
                className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full"
                style={{ background: TYPE_COLORS[a.type][0] }}
              >
                <ActivityGlyph a={a} />
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-foreground">{a.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{subLine(a)}</div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-semibold text-foreground tabular-nums">{stat}</div>
                <div className="mt-px text-[10px] text-muted-foreground">{statLab}</div>
              </div>
              <span className="text-base text-[#C9C7CD]">›</span>
            </button>
          );
        })}
      </div>

      <div ref={sentinelRef} />
      <div className="mt-4 text-center text-[11px] text-muted-foreground">
        {nextBefore
          ? "Synced from your devices · older weeks load as you scroll"
          : "Synced from your devices · that's the whole history"}
      </div>

      <RangePicker
        open={pickerOpen}
        title="Activities — range"
        from={range.from}
        to={range.to}
        onCancel={() => setPickerOpen(false)}
        onApply={(from, to) => {
          setPickerOpen(false);
          setRange({ from, to });
        }}
      />
    </div>
  );
}
