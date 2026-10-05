"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BodyMap } from "@/components/body/body-map";
import { BodyTypeMatrix } from "@/components/body/body-type-matrix";
import { GoalSheet } from "@/components/body/goal-sheet";
import { PaceChart } from "@/components/body/pace-chart";
import { RangeBar } from "@/components/body/range-bar";
import { ReportSheet } from "@/components/body/report-sheet";
import { TapeSheet, type TapeSheetRequest } from "@/components/body/tape-sheet";
import {
  Card,
  DISPLAY,
  EstTag,
  KICKER,
  LABEL,
  MicGlyph,
  SortChip,
  chipStyle,
  useBodyTheme,
  useRevealOnce,
} from "@/components/body/theme";
import { TrendChart } from "@/components/body/trend-chart";
import { useDataLoggedListener } from "@/components/use-data-logged";
import type { BodySummary } from "@/lib/body-summary";
import {
  COMP,
  COMP_SORTS,
  type MetricKey,
  type ParsedTape,
  RANGES,
  type RangeKey,
  SEGMENT_GROUPS,
  SER,
  type SegmentKey,
  TAPE_SITES,
  TAPE_SORTS,
  TREND_METRICS,
  type TapeSite,
  addDays,
  agoText,
  autoMilestones,
  balance,
  balanceVerdict,
  bodyTypeMatrix,
  buildCompRow,
  buildTapeRow,
  cellTitle,
  dayLabel,
  daysBetween,
  describeMuscle,
  goalProgress,
  goalsNote,
  mergeMilestones,
  monthlyTrail,
  nearestValue,
  pace as computePace,
  pointsInRange,
  scaleChangeNote,
  signed,
  sortCompRows,
  sortTapeRows,
  sourceLines,
} from "@/lib/body-view";
import { haptic } from "@/lib/haptics";
import type { HealthGoals } from "@/lib/settings";

// Pitaya Body — port of docs/design/pitaya-body/ (Handoff Spec + the DC). One
// scroll of eight cards: today's weigh-in, target & forecast, composition
// against reference bands, the body map, the body-type matrix, trends, tape
// and milestones. The arithmetic lives in lib/body-view.ts; this file lays it
// out to the spec's numbers.
//
// Surfaced deviations (all in docs/state.md):
//  - Body map: interim front figure only, no shading layer, no Front/Back
//    toggle and no training mode — none of them exist in the handoff yet.
//  - Pull-to-sync refreshes from Pitaya; it cannot pull from the scale until
//    the RENPHO sync is switched on (a login with his account signs his phone
//    out), so the chip reports when data last arrived.
//  - Band notes and two "what it means" notes are computed from his numbers
//    instead of quoting the design's sample morning.
//  - The dock mic stays the app-wide voice input; the Tape button is the way
//    into tape-by-voice.

type SyncState = "idle" | "syncing" | "done";
const SEG_ORDER: SegmentKey[] = ["armRight", "armLeft", "trunk", "legRight", "legLeft"];
const MONTH = (day: string) => dayLabel(day).split(" ")[0];

function timeIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export default function BodyPage() {
  const router = useRouter();
  const theme = useBodyTheme();
  const [data, setData] = useState<BodySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [compSort, setCompSort] = useState(0);
  const [tapeSort, setTapeSort] = useState(0);
  const [mapMode, setMapMode] = useState<"muscle" | "fat">("muscle");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [trMetric, setTrMetric] = useState<MetricKey>("weight");
  const [trRange, setTrRange] = useState<RangeKey>("90d");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [trDelta, setTrDelta] = useState("");
  const [tapeRequest, setTapeRequest] = useState<TapeSheetRequest | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [flash, setFlash] = useState<TapeSite[]>([]);
  const requestId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetOpen = tapeRequest !== null || goalOpen || reportOpen;

  const load = useCallback(async (): Promise<BodySummary | null> => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/health/body/summary?tz=${encodeURIComponent(tz)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as BodySummary;
      setData(next);
      setFailed(false);
      setNow(Date.now());
      return next;
    } catch (error) {
      console.error("Body summary load failed:", error);
      setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useDataLoggedListener(() => void load());
  // Keeps "Synced 12 min ago" honest while the page sits open.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  // ——— sync chip + pull-to-sync (spec §1) ———
  const doSync = useCallback(async () => {
    if (sync === "syncing") return;
    setSync("syncing");
    const before = data?.latest?.arrivedAt ?? null;
    const started = Date.now();
    // A no-op while the RENPHO pull is switched off; the refresh still runs.
    await fetch("/api/health/body/sync", { method: "POST" }).catch(() => null);
    const next = await load();
    await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - started))));
    if (next?.latest && next.latest.arrivedAt !== before) {
      haptic("success");
      setSync("done");
      window.setTimeout(() => setSync("idle"), 3500);
    } else {
      setSync("idle");
    }
  }, [sync, data, load]);

  const pullRef = useRef({ startY: null as number | null, value: 0, armed: false });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const state = pullRef.current;
    const start = (e: TouchEvent) => {
      state.startY = window.scrollY <= 0 && !sheetOpen && sync !== "syncing" ? e.touches[0].clientY : null;
      state.armed = false;
    };
    const move = (e: TouchEvent) => {
      if (state.startY == null || window.scrollY > 0) return;
      const dy = (e.touches[0].clientY - state.startY) * 0.55;
      if (dy <= 4) return;
      // Ours, not the browser's rubber band.
      if (e.cancelable) e.preventDefault();
      state.value = Math.min(90, dy);
      if (state.value > 56 && !state.armed) {
        state.armed = true;
        haptic("light");
      } else if (state.value <= 56) state.armed = false;
      setPull(state.value);
      setPulling(true);
    };
    const end = () => {
      if (state.startY == null) return;
      state.startY = null;
      const go = state.value > 56;
      state.value = 0;
      setPull(0);
      setPulling(false);
      if (go) void doSync();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [sheetOpen, sync, doSync]);

  // ——— everything the cards draw, derived once per payload ———
  const view = useMemo(() => {
    if (!data || !data.latest) return null;
    const { series, tape, goals, today, latest } = data;
    const fatNow = series.fat[series.fat.length - 1] ?? null;
    const ffmNow = series.ffm[series.ffm.length - 1]?.value ?? null;
    const skmNow = series.skm[series.skm.length - 1]?.value ?? null;
    const bmiNow = series.bmi[series.bmi.length - 1]?.value ?? null;

    const w30 = nearestValue(series.weight, addDays(today, -30));
    const f30 = fatNow ? nearestValue(series.fat, addDays(today, -30)) : null;

    const compRows = COMP.filter((c) => c.main)
      .map((spec) =>
        buildCompRow(spec, series[spec.key as keyof typeof series] ?? [], today, {
          start: spec.key === "weight" ? data.start.weightKg : undefined,
          target: spec.key === "weight" ? goals.weightKg : spec.key === "fat" ? goals.bodyFatPct : null,
        })
      )
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const tapeRows = TAPE_SITES.map((site) => ({ site, row: buildTapeRow(site, tape[site.key], today) }));
    const tapeDays = Object.values(tape).flatMap((points) => points.map((p) => p.day));
    const lastTaped = tapeDays.length ? tapeDays.sort()[tapeDays.length - 1] : null;

    const trail = monthlyTrail(series.bmi, series.fat);
    const matrix =
      bmiNow != null && fatNow
        ? bodyTypeMatrix({ bmi: bmiNow, bf: fatNow.value }, trail.filter((t) => t.month !== today.slice(0, 7)))
        : null;

    const milestones = mergeMilestones(
      autoMilestones({ weight: series.weight, bmi: series.bmi, fat: series.fat, today }),
      data.milestones
    );

    const seg = data.segments?.values ?? null;
    const pair = (l: SegmentKey, r: SegmentKey, field: "muscleKg" | "fatKg") => {
      const left = seg?.[l][field];
      const right = seg?.[r][field];
      return left != null && right != null && left + right > 0 ? balance(left, right) : null;
    };

    return {
      fatNow, ffmNow, skmNow, bmiNow, w30, f30, compRows, tapeRows, lastTaped, matrix, milestones, seg,
      startFat: series.fat[0]?.value ?? null,
      startBmi: series.bmi[0]?.value ?? null,
      lost: data.start.weightKg - latest.weightKg,
      weeks: Math.round(daysBetween(data.start.day, today) / 7),
      balanceFor: (field: "muscleKg" | "fatKg") => ({
        arms: pair("armLeft", "armRight", field),
        legs: pair("legLeft", "legRight", field),
      }),
    };
  }, [data]);

  const pace = useMemo(
    () => (data ? computePace(data.series.weight, data.today, data.goals) : null),
    [data]
  );

  const trendPoints = useMemo(() => {
    if (!data) return [];
    const all = trMetric === "waist" ? data.tape.waist : data.series[trMetric as keyof typeof data.series];
    return pointsInRange(all ?? [], trRange, data.today, custom ?? undefined);
  }, [data, trMetric, trRange, custom]);

  const saveTape = useCallback(
    async (readings: ParsedTape[]): Promise<boolean> => {
      const body: Record<string, unknown> = { measuredAt: new Date().toISOString() };
      for (const r of readings) body[TAPE_SITES.find((s) => s.key === r.site)!.field] = r.value;
      try {
        const res = await fetch("/api/health/body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        toast.error("Couldn’t save the tape");
        return false;
      }
      await load();
      // The row flashes once the sheet has closed, then fades over .9s.
      window.setTimeout(() => setFlash(readings.map((r) => r.site)), 1300);
      window.setTimeout(() => setFlash([]), 2600);
      return true;
    },
    [load]
  );

  const saveGoals = useCallback(
    async (draft: HealthGoals) => {
      setGoalOpen(false);
      if (!data) return;
      const g = data.goals;
      if (draft.weightKg === g.weightKg && draft.bodyFatPct === g.bodyFatPct && draft.byDate === g.byDate) return;
      setData({ ...data, goals: draft });
      try {
        const res = await fetch("/api/health/body/goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        toast.error("Couldn’t save the targets");
        setData({ ...data, goals: g });
      }
    },
    [data]
  );

  const openTape = (mode: "voice" | "pad", site?: TapeSite) =>
    setTapeRequest({ id: ++requestId.current, mode, site });

  const rootStyle = { background: "var(--b-bg)", minHeight: "100dvh", padding: "48px 22px 150px" } as const;

  if (!data || !view || !data.latest) {
    return (
      <div ref={rootRef} className="body-theme" data-theme={theme} style={rootStyle}>
        <Header pill={null} />
        <Card delay={0.04} padding="20px" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--b-sub)", lineHeight: 1.55 }}>
            {failed
              ? "Couldn’t load your body data. Pull down to try again."
              : data
                ? "No weigh-ins yet. Step on the scale and your first reading lands here."
                : "Loading…"}
          </div>
        </Card>
      </div>
    );
  }

  const { latest, goals, today } = data;
  const dLast = data.previous ? latest.weightKg - data.previous.weightKg : null;
  const d30 = view.w30 != null ? latest.weightKg - view.w30 : null;
  const fd30 = view.fatNow && view.f30 != null ? view.fatNow.value - view.f30 : null;
  const src = sourceLines(latest);
  const toGo = latest.weightKg - goals.weightKg;
  const progress = goalProgress(latest.weightKg, goals.weightKg, data.start.weightKg);
  const fatToGo = view.fatNow ? view.fatNow.value - goals.bodyFatPct : null;
  const note = goalsNote(goals, view.ffmNow);
  const kg = (d: number) => (Math.abs(d) < 0.05 ? "±0 kg" : signed(d, `${Math.abs(d).toFixed(1)} kg`));

  const syncText =
    sync === "syncing"
      ? data.sync.enabled ? "Syncing from scale…" : "Checking for readings…"
      : sync === "done"
        ? "Synced just now"
        : `Synced ${agoText(new Date(latest.arrivedAt).getTime(), now)}`;
  const pullH = sync === "syncing" ? 44 : pull;

  const segText = (key: SegmentKey) => {
    const r = view.seg?.[key];
    const kgValue = mapMode === "muscle" ? r?.muscleKg : r?.fatKg;
    const pct = mapMode === "muscle" ? r?.musclePct : r?.fatPct;
    return {
      value: kgValue != null ? `${kgValue.toFixed(2)} kg` : "—",
      pct: pct != null ? `${pct.toFixed(0)}% of std` : "",
    };
  };
  const bal = view.balanceFor(mapMode === "muscle" ? "muscleKg" : "fatKg");
  const verdict = balanceVerdict(bal.arms, bal.legs);
  const selectedMuscle = muscle ? describeMuscle(muscle) : null;
  const mapCaption = (() => {
    if (!view.seg) return "";
    const pcts = SEG_ORDER.map((k) => (mapMode === "muscle" ? view.seg![k].musclePct : view.seg![k].fatPct));
    const lines =
      mapMode === "muscle"
        ? ["Deeper = more muscle than standard.", pcts.every((p) => p != null && p > 110) ? "Every segment above 110%." : ""]
        : [
            "Deeper = more fat than standard.",
            (view.seg.armLeft.fatPct ?? 100) < 80 && (view.seg.armRight.fatPct ?? 100) < 80 && (view.seg.trunk.fatPct ?? 0) > 100
              ? "Arms lean; trunk carries what’s left."
              : "",
          ];
    if (data.segments && data.segments.day !== today) lines.push(`Reading from ${dayLabel(data.segments.day)}.`);
    return lines.filter(Boolean).join("\n");
  })();

  const tapeList = sortTapeRows(
    view.tapeRows.filter((t) => t.row).map((t) => t.row!),
    tapeSort
  );
  const untaped = view.tapeRows.filter((t) => !t.row).map((t) => t.site);

  return (
    <div ref={rootRef} className="body-theme" data-theme={theme} style={rootStyle}>
      {/* Pull-to-sync well */}
      <div
        style={{
          height: pullH, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center",
          transition: pulling ? "none" : "height .35s cubic-bezier(.22,.9,.3,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 600, color: "var(--b-deep)", paddingBottom: 10 }}>
          <span
            style={{
              width: 14, height: 14, borderRadius: 99, border: "2px solid var(--b-edge)", borderTopColor: "var(--b-rasp)",
              animation: sync === "syncing" ? "body-spin .8s linear infinite" : "none",
            }}
          />
          {sync === "syncing"
            ? syncText
            : pull > 56
              ? "Release to sync"
              : data.sync.enabled ? "Pull to sync from scale" : "Pull to check for readings"}
        </div>
      </div>

      <Header pill={`${signed(-view.lost, Math.abs(view.lost).toFixed(1))} kg · since ${MONTH(data.start.day)}`} />

      {/* TODAY'S WEIGH-IN */}
      <Card delay={0.04} padding="20px" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>
            {latest.isToday ? "TODAY’S WEIGH-IN" : `LAST WEIGH-IN · ${dayLabel(latest.day).toUpperCase()}`} ·{" "}
            {timeIn(latest.measuredAt, data.timeZone)}
          </div>
          <div
            role="button"
            onClick={() => void doSync()}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "var(--b-faint)", cursor: "pointer" }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: 99,
                background: sync === "syncing" ? "var(--b-rasp)" : sync === "done" ? "var(--b-green)" : "var(--b-ghost)",
                animation: sync === "syncing" ? "body-pulse .9s ease-in-out infinite" : "none",
              }}
            />
            {syncText}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ ...DISPLAY, fontSize: 54, fontWeight: 700, color: "var(--b-ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {latest.weightKg.toFixed(1)}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--b-faint)" }}>kg</span>
          </div>
          {view.fatNow && (
            <div style={{ paddingBottom: 5 }}>
              <div style={{ ...LABEL, display: "flex", alignItems: "center", gap: 5 }}>
                BODY FAT <EstTag />
                {view.fatNow.day !== latest.day && <span style={{ letterSpacing: ".08em" }}>· {dayLabel(view.fatNow.day).toUpperCase()}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 3 }}>
                <span style={{ ...DISPLAY, fontSize: 26, fontWeight: 700, color: "var(--b-ink)", lineHeight: 1 }}>
                  {view.fatNow.value.toFixed(1)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--b-faint)" }}>%</span>
              </div>
            </div>
          )}
        </div>
        {/* Not in the design: the weight arrives on its own, the composition
            does not (see report-sheet.tsx). When this weigh-in has none, say
            so and offer the way to add it. */}
        {(!view.fatNow || view.fatNow.day !== latest.day) && (
          <div
            role="button"
            onClick={() => setReportOpen(true)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14,
              background: "var(--b-card2)", borderRadius: 12, padding: "10px 12px", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--b-sub)" }}>
              This weigh-in has weight only. Add its RENPHO report for the rest.
            </span>
            <span style={{ ...DISPLAY, flex: "none", fontSize: 11.5, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", borderRadius: 8, padding: "6px 11px" }}>
              Add report
            </span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 12, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--b-rule)" }}>
          <div>
            <div style={LABEL}>VS LAST</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: dLast != null && dLast < -0.05 ? "var(--b-green)" : "var(--b-sub)" }}>
              {dLast != null ? kg(dLast) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--b-faint)", marginTop: 2 }}>
              {data.previous ? `${dayLabel(data.previous.day)} · ${data.previous.weightKg.toFixed(1)}` : "first reading"}
            </div>
          </div>
          <div>
            <div style={LABEL}>VS 30 DAYS</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: d30 != null && d30 < -0.05 ? "var(--b-green)" : "var(--b-sub)" }}>
              {d30 != null ? kg(d30) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--b-faint)", marginTop: 2 }}>
              {fd30 != null ? `fat ${Math.abs(fd30) < 0.05 ? "±0" : signed(fd30, Math.abs(fd30).toFixed(1))} pt` : " "}
            </div>
          </div>
          <div>
            <div style={LABEL}>SOURCE</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--b-ink)", marginTop: 4 }}>{src.device}</div>
            <div style={{ fontSize: 11, color: "var(--b-faint)", marginTop: 2 }}>{src.via}</div>
          </div>
        </div>
      </Card>

      {/* TARGET & FORECAST */}
      <Card delay={0.08} padding="20px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>TARGET · {dayLabel(goals.byDate).toUpperCase()}</div>
          <button
            onClick={() => setGoalOpen(true)}
            style={{ ...DISPLAY, fontSize: 11.5, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", border: "none", borderRadius: 8, padding: "6px 11px", cursor: "pointer" }}
          >
            Edit targets
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
          <span style={{ ...DISPLAY, fontSize: 22, fontWeight: 700, color: "var(--b-ink)" }}>
            {goals.weightKg} kg · {goals.bodyFatPct}%
          </span>
          <span style={{ fontSize: 12, color: "var(--b-sub)" }}>{toGo > 0 ? `${toGo.toFixed(1)} kg to go` : "arrived"}</span>
        </div>
        <div style={{ position: "relative", height: 22, marginTop: 12 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 9, height: 4, borderRadius: 99, background: "var(--b-track)" }} />
          <div style={{ position: "absolute", left: 0, top: 9, height: 4, borderRadius: 99, background: "var(--b-rasp)", opacity: 0.35, width: `${progress.toFixed(1)}%`, transition: "width 1s cubic-bezier(.22,.9,.3,1)" }} />
          <div style={{ position: "absolute", top: 7, left: -1, width: 6, height: 6, borderRadius: 99, border: "1.5px solid var(--b-faint)", background: "var(--b-card)" }} />
          <div style={{ position: "absolute", top: 7, right: 0, width: 7, height: 7, background: "var(--b-ink)", transform: "rotate(45deg)" }} />
          <div style={{ position: "absolute", top: 6, width: 10, height: 10, borderRadius: 99, background: "var(--b-rasp)", boxShadow: "0 0 0 2px var(--b-card)", left: `calc(${progress.toFixed(1)}% - 5px)`, transition: "left 1s cubic-bezier(.22,.9,.3,1)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--b-faint)", letterSpacing: ".06em", marginTop: -2 }}>
          <span>{data.start.weightKg.toFixed(1)} · {MONTH(data.start.day).toUpperCase()}</span>
          <span style={{ color: "var(--b-deep)", fontWeight: 600 }}>{progress.toFixed(0)}% of the way</span>
          <span>{goals.weightKg} kg</span>
        </div>

        {pace && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--b-rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, letterSpacing: "0.12em", fontWeight: 600, color: "var(--b-faint)" }}>
              <span>PACE NEEDED VS PACE YOU&apos;RE ON</span>
              <span>KG / WK</span>
            </div>
            <PaceChart pace={pace} goalWeightKg={goals.weightKg} goalDay={goals.byDate} />
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              <div style={{ flex: 1, background: "var(--b-card2)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ ...LABEL, letterSpacing: "0.12em" }}>NEEDED</div>
                <div style={{ ...DISPLAY, fontSize: 18, fontWeight: 700, color: "var(--b-ink)", marginTop: 2 }}>
                  {toGo > 0 ? pace.needed.toFixed(2) : "—"}
                </div>
              </div>
              <div style={{ flex: 1, background: "var(--b-wash)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ ...LABEL, letterSpacing: "0.12em", color: "var(--b-deep)" }}>YOU&apos;RE ON</div>
                <div style={{ ...DISPLAY, fontSize: 18, fontWeight: 700, color: "var(--b-deep)", marginTop: 2 }}>
                  {pace.rate < 0 ? `−${Math.abs(pace.rate).toFixed(2)}` : pace.rate.toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--b-ink)", marginTop: 12 }}>{pace.sentence}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--b-rule)" }}>
              <div style={{ fontSize: 12.5, color: "var(--b-sub)" }}>Body fat target</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--b-ink)" }}>
                {view.fatNow && fatToGo != null
                  ? fatToGo <= 0
                    ? `${goals.bodyFatPct}% · arrived (${view.fatNow.value.toFixed(1)})`
                    : `${goals.bodyFatPct}% · ${fatToGo.toFixed(1)} pt to go (${view.fatNow.value.toFixed(1)})`
                  : `${goals.bodyFatPct}%`}
              </div>
            </div>
            {note && <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--b-faint)", marginTop: 8 }}>{note}</div>}
          </div>
        )}
      </Card>

      {/* COMPOSITION OVERVIEW */}
      <Card delay={0.12} padding="18px 20px 10px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>COMPOSITION · SMART SCALE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setReportOpen(true)}
              style={{ ...DISPLAY, fontSize: 11.5, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", border: "none", borderRadius: 8, padding: "6px 11px", cursor: "pointer" }}
            >
              Add report
            </button>
            <SortChip label={COMP_SORTS[compSort]} onTap={() => setCompSort((n) => (n + 1) % 3)} />
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          {sortCompRows(view.compRows, compSort).map((r) => (
            <div
              key={r.key}
              role="button"
              onClick={() => router.push(`/health/body/metric?m=${r.key}`)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--b-rule)", cursor: "pointer" }}
            >
              <div style={{ width: 108, flex: "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--b-ink)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                  {r.label}
                  {r.estimate && <EstTag />}
                </div>
                <div style={{ fontSize: 10.5, color: r.good ? "var(--b-green)" : "var(--b-faint)", marginTop: 2 }}>{r.d30Text} · 30d</div>
              </div>
              <RangeBar geometry={r} />
              <div style={{ ...DISPLAY, width: 72, flex: "none", textAlign: "right", fontSize: 15, fontWeight: 700, color: "var(--b-ink)" }}>
                {r.valueText}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--b-faint)", marginLeft: 2 }}>{r.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 10.5, color: "var(--b-faint)", padding: "10px 0 6px", lineHeight: 1.5 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 14, height: 6, borderRadius: 99, background: "var(--b-band)" }} />
            reference band
            {data.profile.age != null ? ` · ${data.profile.age} y` : ""}
            {data.profile.heightCm != null ? ` · ${data.profile.heightCm} cm` : ""}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, border: "1.5px solid var(--b-faint)" }} />
            {MONTH(data.start.day)} start
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--b-rasp)" }} />
            now
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, background: "var(--b-ink)", transform: "rotate(45deg)" }} />
            target
          </span>
          <span>EST = bioimpedance estimate</span>
        </div>
      </Card>

      {/* BODY MAP */}
      <Card delay={0.16} padding="18px 20px 20px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>BODY MAP · SEGMENTAL</div>
          <div style={{ display: "flex", background: "var(--b-card2)", border: "1px solid var(--b-rule2)", borderRadius: 99, padding: 2 }}>
            {(["muscle", "fat"] as const).map((m) => (
              <div
                key={m}
                role="button"
                aria-pressed={mapMode === m}
                onClick={() => setMapMode(m)}
                style={{
                  padding: "5px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  background: mapMode === m ? "var(--b-rasp)" : "var(--b-chip)", color: mapMode === m ? "#FFFFFF" : "var(--b-sub)",
                  transition: "background .3s, color .3s",
                }}
              >
                {m === "muscle" ? "Muscle" : "Fat"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", gap: 6, alignItems: "center", marginTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 280, padding: "22px 0 18px", textAlign: "right" }}>
            <SegLabel title="RIGHT ARM" {...segText("armRight")} />
            <SegLabel title="RIGHT LEG" {...segText("legRight")} />
          </div>
          <BodyMap mode={mapMode} segments={view.seg} selected={muscle} onSelect={setMuscle} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 280, padding: "22px 0 18px" }}>
            <SegLabel title="LEFT ARM" {...segText("armLeft")} />
            <SegLabel title="LEFT LEG" {...segText("legLeft")} />
          </div>
        </div>
        {view.seg ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: -6 }}>
              <div style={{ flex: "none", whiteSpace: "nowrap" }}>
                <div style={{ ...LABEL, letterSpacing: "0.12em" }}>TRUNK</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                  <span style={{ ...DISPLAY, fontSize: 16, fontWeight: 700, color: "var(--b-ink)" }}>{segText("trunk").value}</span>
                  <span style={{ fontSize: 10.5, color: "var(--b-sub)" }}>{segText("trunk").pct}</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, maxWidth: 200, fontSize: 11, color: "var(--b-faint)", textAlign: "right", lineHeight: 1.4, whiteSpace: "pre-line" }}>
                {mapCaption}
              </div>
            </div>
            {selectedMuscle && muscle && (
              <div
                style={{
                  marginTop: 12, background: "var(--b-card2)", borderRadius: 12, padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
                  animation: "body-rise .25s ease both",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--b-ink)", textTransform: "capitalize" }}>{selectedMuscle.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--b-faint)", marginTop: 1 }}>
                    {SEGMENT_GROUPS[selectedMuscle.segment].label} · the scale reads the whole segment
                  </div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div style={{ ...DISPLAY, fontSize: 15, fontWeight: 700, color: "var(--b-ink)" }}>{segText(selectedMuscle.segment).value}</div>
                  <div style={{ fontSize: 10.5, color: "var(--b-sub)" }}>{segText(selectedMuscle.segment).pct}</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--b-rule)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, letterSpacing: "0.12em", fontWeight: 600, color: "var(--b-faint)" }}>
                <span>LEFT · RIGHT BALANCE</span>
                {verdict && <span style={{ color: verdict.balanced ? "var(--b-green)" : "var(--b-sub)" }}>{verdict.text}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 92px", gap: 12, alignItems: "center", marginTop: 10 }}>
                {([["Arms", bal.arms], ["Legs", bal.legs]] as const).map(([name, b]) =>
                  b ? (
                    <BalanceRow key={name} name={name} offsetPx={b.offsetPx} text={b.text} />
                  ) : null
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--b-ghost)", letterSpacing: ".08em", marginTop: 6, paddingLeft: 64, paddingRight: 104 }}>
                <span>RIGHT</span>
                <span>LEFT</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--b-faint)", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
            Your scale hasn&apos;t sent segmental readings yet.
          </div>
        )}
      </Card>

      {/* BODY-TYPE MATRIX */}
      {view.matrix && view.fatNow && view.bmiNow != null && (
        <Card delay={0.2}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={KICKER}>BODY TYPE · BMI × BODY FAT</div>
            <div style={{ fontSize: 11, color: "var(--b-faint)" }}>trail · monthly</div>
          </div>
          <BodyTypeMatrix view={view.matrix} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
            <div style={{ fontSize: 13, color: "var(--b-ink)" }}>
              Now <strong style={{ fontWeight: 700 }}>{cellTitle(view.matrix.cell.name)}</strong> · BMI {view.bmiNow.toFixed(1)} · {view.fatNow.value.toFixed(1)}% fat
            </div>
            {view.startBmi != null && view.startFat != null && (
              <div style={{ fontSize: 11, color: "var(--b-faint)" }}>
                {MONTH(data.start.day)}: BMI {view.startBmi.toFixed(0)} · {view.startFat.toFixed(0)}%
              </div>
            )}
          </div>
          {data.scaleChangedOn && (
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--b-faint)", marginTop: 6 }}>
              The sideways step in {MONTH(data.scaleChangedOn)} is the new scale reading body fat lower than the old one.
            </div>
          )}
        </Card>
      )}

      {/* TRENDS */}
      <Card delay={0.24}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>TRENDS</div>
          {trDelta && trendPoints.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", padding: "4px 10px", borderRadius: 99 }}>{trDelta}</div>
          )}
        </div>
        <div className="body-noscroll" style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
          {TREND_METRICS.map((k) => (
            <div key={k} role="button" onClick={() => setTrMetric(k)} style={chipStyle(trMetric === k)}>
              {SER[k].label}
            </div>
          ))}
        </div>
        <div className="body-noscroll" style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
          {RANGES.map(([key, label]) => (
            <div
              key={key}
              role="button"
              onClick={() => {
                setTrRange(key);
                if (key === "custom" && !custom) setCustom({ from: addDays(today, -120), to: today });
              }}
              style={chipStyle(trRange === key, "square")}
            >
              {label}
            </div>
          ))}
        </div>
        {trRange === "custom" && custom && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "var(--b-sub)" }}>
            <DateChip value={custom.from} min={data.start.day} max={custom.to} onChange={(from) => setCustom({ ...custom, from })} />
            →
            <DateChip value={custom.to} min={custom.from} max={today} onChange={(to) => setCustom({ ...custom, to })} />
            <span style={{ color: "var(--b-faint)" }}>tap a date to change</span>
          </div>
        )}
        <TrendChart
          metric={trMetric}
          points={trendPoints}
          rangeLabel={RANGES.find((r) => r[0] === trRange)![1]}
          resetKey={`${trMetric}-${trRange}-${custom?.from}-${custom?.to}`}
          onDelta={setTrDelta}
          note={scaleChangeNote(trMetric, trendPoints, data.scaleChangedOn)}
        />
      </Card>

      {/* TAPE */}
      <Card delay={0.28} padding="18px 20px 12px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>TAPE{view.lastTaped ? ` · TAPED ${dayLabel(view.lastTaped).toUpperCase()}` : ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SortChip label={TAPE_SORTS[tapeSort]} onTap={() => setTapeSort((n) => (n + 1) % 3)} />
            <button
              onClick={() => openTape("voice")}
              style={{ ...DISPLAY, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#FFFFFF", background: "var(--b-rasp)", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
            >
              <MicGlyph size={11} />
              Tape
            </button>
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          {tapeList.map((r) => (
            <div
              key={r.key}
              role="button"
              onClick={() => openTape("pad", r.key)}
              style={{
                display: "grid", gridTemplateColumns: "92px 1fr 64px 76px", gap: 10, alignItems: "center",
                padding: "10px 6px", margin: "0 -6px", borderRadius: 10, borderBottom: "1px solid var(--b-rule)",
                background: flash.includes(r.key) ? "var(--b-wash)" : "transparent", transition: "background .9s ease", cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--b-ink)" }}>{r.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--b-faint)", marginTop: 1 }}>{r.when}</div>
              </div>
              <svg viewBox="0 0 60 20" width="100%" height="20" preserveAspectRatio="none" style={{ display: "block" }}>
                <polyline points={r.spark} fill="none" stroke="var(--b-rasp)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
                <circle cx={r.sparkX} cy={r.sparkY} r="2" fill="var(--b-rasp)" />
              </svg>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: r.good ? "var(--b-green)" : "var(--b-sub)", textAlign: "right" }}>{r.deltaText}</div>
              <div style={{ ...DISPLAY, textAlign: "right", fontSize: 16, fontWeight: 700, color: "var(--b-ink)" }}>
                {r.valueText}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--b-faint)", marginLeft: 2 }}>cm</span>
              </div>
            </div>
          ))}
          {untaped.map((site) => (
            <div
              key={site.key}
              role="button"
              onClick={() => openTape("pad", site.key)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--b-rule)", cursor: "pointer" }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--b-ink)" }}>{site.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--b-faint)" }}>not taped yet</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--b-faint)", padding: "10px 0 4px" }}>
          Change is since your first tape. Tap a site to type one number; the mic takes a whole sentence.
        </div>
      </Card>

      {/* MILESTONES */}
      <MilestonesCard
        startKg={data.start.weightKg}
        weeks={view.weeks}
        rows={view.milestones.map((m) => ({
          key: `${m.day}-${m.title}`,
          title: m.title,
          date: m.day === today && m.title === "Today" ? dayLabel(m.day) : dayLabel(m.day),
          // A fat line "crossed" on the day the scale changed was crossed by
          // the scale, and the row says so.
          sub:
            m.note ??
            (m.title.startsWith("Body fat") && m.day === data.scaleChangedOn ? "first reading on the new scale" : ""),
          weight: m.weightKg != null ? `${m.weightKg.toFixed(1)} kg` : "",
        }))}
      />

      <TapeSheet
        request={tapeRequest}
        theme={theme}
        today={today}
        tape={data.tape}
        onSave={saveTape}
        onClose={() => setTapeRequest(null)}
      />
      <ReportSheet
        open={reportOpen}
        theme={theme}
        onClose={() => setReportOpen(false)}
        onSaved={() => void load()}
      />
      <GoalSheet
        open={goalOpen}
        theme={theme}
        today={today}
        goals={goals}
        sentenceFor={(draft) => computePace(data.series.weight, today, draft)?.sentence ?? ""}
        onClose={saveGoals}
      />
    </div>
  );
}

function Header({ pill }: { pill: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", animation: "body-rise .5s ease both" }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "var(--b-faint)" }}>TODAY · BODY</div>
        <h1 style={{ ...DISPLAY, fontSize: 30, fontWeight: 700, color: "var(--b-ink)", letterSpacing: "-0.02em", marginTop: 2 }}>Body</h1>
      </div>
      {pill && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", padding: "6px 12px", borderRadius: 99 }}>{pill}</div>
      )}
    </div>
  );
}

function SegLabel({ title, value, pct }: { title: string; value: string; pct: string }) {
  return (
    <div>
      <div style={{ ...LABEL, letterSpacing: "0.12em", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ ...DISPLAY, fontSize: 16, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--b-sub)" }}>{pct}</div>
    </div>
  );
}

function BalanceRow({ name, offsetPx, text }: { name: string; offsetPx: number; text: string }) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink)" }}>{name}</div>
      <div style={{ position: "relative", height: 14 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 6, height: 2, background: "var(--b-rule2)" }} />
        <div style={{ position: "absolute", left: "50%", top: 2, width: 1, height: 10, background: "var(--b-ghost)" }} />
        <div
          style={{
            position: "absolute", top: 3, width: 8, height: 8, borderRadius: 99, background: "var(--b-rasp)",
            left: `calc(50% + ${offsetPx}px - 4px)`, transition: "left .6s cubic-bezier(.22,.9,.3,1)",
          }}
        />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--b-sub)", textAlign: "right" }}>{text}</div>
    </>
  );
}

function DateChip({ value, min, max, onChange }: { value: string; min: string; max: string; onChange: (day: string) => void }) {
  return (
    <label style={{ position: "relative", padding: "5px 10px", border: "1px dashed var(--b-rule2)", borderRadius: 8, fontWeight: 600, color: "var(--b-ink)", cursor: "pointer" }}>
      {dayLabel(value)}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }}
      />
    </label>
  );
}

function MilestonesCard({
  startKg,
  weeks,
  rows,
}: {
  startKg: number;
  weeks: number;
  rows: { key: string; title: string; date: string; sub: string; weight: string }[];
}) {
  const [ref, on] = useRevealOnce<HTMLDivElement>();
  return (
    <Card delay={0.32}>
      <div ref={ref}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={KICKER}>MILESTONES · FROM {startKg.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "var(--b-faint)" }}>{weeks} weeks</div>
        </div>
        <div style={{ position: "relative", marginTop: 14, paddingLeft: 18 }}>
          <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 1, background: "var(--b-rule2)" }} />
          <div
            style={{
              position: "absolute", left: 4, top: 6, width: 1, background: "var(--b-rasp)",
              height: on ? "calc(100% - 12px)" : "0%", transition: "height 2.2s cubic-bezier(.4,0,.2,1)",
            }}
          />
          {rows.map((m, i) => (
            <div
              key={m.key}
              style={{
                position: "relative", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
                padding: "7px 0", opacity: on ? 1 : 0, transform: `translateY(${on ? 0 : 14}px)`,
                transition: `opacity .5s ease ${(i * 0.09).toFixed(2)}s, transform .5s cubic-bezier(.22,.9,.3,1) ${(i * 0.09).toFixed(2)}s`,
              }}
            >
              <div style={{ position: "absolute", left: -17.5, top: 12, width: 6, height: 6, borderRadius: 99, background: "var(--b-rasp)", boxShadow: "0 0 0 2px var(--b-card)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--b-ink)", lineHeight: 1.35 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: "var(--b-faint)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.date}
                  {m.sub ? ` · ${m.sub}` : ""}
                </div>
              </div>
              <div style={{ flex: "none", fontSize: 12.5, fontWeight: 600, color: "var(--b-sub)", whiteSpace: "nowrap" }}>{m.weight}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
