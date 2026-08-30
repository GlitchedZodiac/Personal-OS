"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircuitIcon, TrailIcon, TrainIcon, WalkIcon } from "@/components/pitaya-icons";
import { RangePicker } from "@/components/range-picker";

// Train → Activities — port of the design's activity-history push-in screens
// (docs/design/pitaya-app.dc.html, 2026-08-11 rev: actList view). The detail
// half (actDet) moved to components/activity-detail.tsx behind a dedicated
// route on 2026-08-28 — this file is list-only, and old ?id= deep links
// redirect to /health/workouts/activities/<id>.

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

// Design's type palettes (ICO/CLR maps) — icon circle bg + stroke.
const TYPE_COLORS: Record<ActivityType, [string, string]> = {
  kb: ["#F6E3EB", "#8C2F51"],
  cir: ["#F0EEF2", "#66646C"],
  out: ["#EAF3ED", "#3E7A54"],
};

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
    // Legacy deep link: ?id=<workout> used to open an in-page overlay — the
    // watch and chat still link that way, so forward to the real route.
    // (window.location avoids the useSearchParams Suspense requirement.)
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) router.replace(`/health/workouts/activities/${encodeURIComponent(id)}`);
  }, [loadPage, router]);

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
              onClick={() => router.push(`/health/workouts/activities/${encodeURIComponent(a.id)}`)}
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
