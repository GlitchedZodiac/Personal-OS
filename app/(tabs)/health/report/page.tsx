"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The Sunday Report — port of the design's report push-in (2026-08-11e
// rev). Data comes persisted from /api/health/report (written Sunday
// night by cron, or backfilled on demand for a past week). Surfaced
// deviations: no PDF button yet (deferred), and AVG BURNED is training
// burn only — the card says so.

interface ReportData {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  writtenAt: string;
  headline: string;
  coach: string;
  calorieTarget: number;
  energy: {
    avgInKcal: number | null;
    avgBurnedKcal: number | null;
    dailyDeficitKcal: number | null;
    weekDeficitKcal: number | null;
    days: { date: string; inKcal: number; burnedKcal: number }[];
  };
  macros: {
    adherencePct: { protein: number | null; carbs: number | null; fat: number | null };
    proteinDaysHit: number;
    loggedDays: number;
    note: string;
  };
  training: {
    sessions: number;
    volumeKg: number;
    activeMinutes: number;
    kcalBurned: number;
    zonesPct: number[] | null;
  };
  weight: {
    startKg: number | null;
    endKg: number | null;
    deltaKg: number | null;
    series: number[];
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const ZONE_COLORS = ["#E7E5E9", "#DCA8BE", "#C97D9C", "#A63D63", "#8C2F51"];

function rangeLabel(r: ReportData): string {
  const f = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      .toUpperCase();
  };
  return `WEEK ${r.weekNumber} · ${f(r.weekStart)} – ${f(r.weekEnd)}`;
}

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (week?: string) => {
    setLoading(true);
    const qs = week ? `?week=${week}` : "";
    const res = await fetch(`/api/health/report${qs}`);
    if (res.ok) {
      const body = await res.json();
      if (body.report) {
        setReport(body.report);
        setAvailableWeeks(body.availableWeeks ?? []);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const writtenLabel = report
    ? new Date(report.writtenAt)
        .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        .toUpperCase() +
      " · " +
      new Date(report.writtenAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const maxEnergy = report
    ? Math.max(
        ...report.energy.days.map((d) => Math.max(d.inKcal, d.burnedKcal)),
        1
      )
    : 1;

  const weightSpark = (() => {
    if (!report || report.weight.series.length < 2) return null;
    const v = report.weight.series;
    const mn = Math.min(...v);
    const mx = Math.max(...v);
    const span = mx - mn || 1;
    return v
      .map(
        (x, i) =>
          `${((i / (v.length - 1)) * 360).toFixed(1)},${(4 + (1 - (x - mn) / span) * 22).toFixed(1)}`
      )
      .join(" ");
  })();

  const idx = report ? availableWeeks.indexOf(report.weekStart) : -1;
  const newerWeek = idx > 0 ? availableWeeks[idx - 1] : null;
  const olderWeek = idx >= 0 && idx < availableWeeks.length - 1 ? availableWeeks[idx + 1] : null;

  return (
    <div
      className="min-h-screen bg-[#F2F1F2] px-[22px] pb-16 pt-12 lg:px-8"
      style={{ animation: "pushIn .38s cubic-bezier(.3,.9,.3,1) both" }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Today"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            {report ? rangeLabel(report) : "WEEKLY"}
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sunday Report
          </div>
        </div>
        {olderWeek && (
          <button
            onClick={() => load(olderWeek)}
            className="rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ‹ older
          </button>
        )}
        {newerWeek && (
          <button
            onClick={() => load(newerWeek)}
            className="rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            newer ›
          </button>
        )}
      </div>

      {loading && !report && (
        <p className="mt-10 text-center text-[12px] text-muted-foreground">
          Writing the report from your week…
        </p>
      )}

      {report && (
        <>
          {/* hero */}
          <div className="mt-4 rounded-[18px] bg-[#A63D63] p-[18px]">
            <div className="text-[10.5px] font-bold tracking-[0.18em] text-[#F6E3EB]">
              WRITTEN {writtenLabel.toUpperCase()}
            </div>
            <div
              className="mt-1.5 text-[22px] font-bold leading-[1.25] text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {report.headline}
            </div>
            <div className="mt-3.5 flex gap-[22px]">
              <div>
                <div
                  className="text-[17px] font-bold text-white tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {report.energy.weekDeficitKcal != null
                    ? `${report.energy.weekDeficitKcal >= 0 ? "−" : "+"}${fmt(Math.abs(report.energy.weekDeficitKcal))}`
                    : "—"}
                </div>
                <div className="mt-0.5 text-[9px] font-semibold tracking-[0.1em] text-[#F0D3E0]">
                  KCAL VS GOAL
                </div>
              </div>
              <div>
                <div
                  className="text-[17px] font-bold text-white tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {report.training.sessions}
                </div>
                <div className="mt-0.5 text-[9px] font-semibold tracking-[0.1em] text-[#F0D3E0]">
                  SESSIONS
                </div>
              </div>
              <div>
                <div
                  className="text-[17px] font-bold text-white tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {report.weight.deltaKg != null
                    ? `${report.weight.deltaKg > 0 ? "+" : "−"}${Math.abs(report.weight.deltaKg).toFixed(1)} kg`
                    : "—"}
                </div>
                <div className="mt-0.5 text-[9px] font-semibold tracking-[0.1em] text-[#F0D3E0]">
                  WEIGHT
                </div>
              </div>
            </div>
          </div>

          {/* energy in vs burned */}
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                ENERGY · IN VS TRAINING BURN
              </div>
              {report.energy.dailyDeficitKcal != null && (
                <div
                  className="text-[11px] font-semibold"
                  style={{
                    color: report.energy.dailyDeficitKcal >= 0 ? "#5E9B72" : "#D9A23E",
                  }}
                >
                  {report.energy.dailyDeficitKcal >= 0 ? "−" : "+"}
                  {fmt(Math.abs(report.energy.dailyDeficitKcal))} / day vs goal
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-[22px]">
              <div>
                <div
                  className="text-[19px] font-bold text-foreground tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {report.energy.avgInKcal != null ? fmt(report.energy.avgInKcal) : "—"}
                </div>
                <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                  AVG IN
                </div>
              </div>
              <div>
                <div
                  className="text-[19px] font-bold text-foreground tabular-nums"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {report.energy.avgBurnedKcal != null ? fmt(report.energy.avgBurnedKcal) : "—"}
                </div>
                <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                  AVG TRAINING BURN
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex h-14 items-end justify-between">
              {report.energy.days.map((d) => (
                <div key={d.date} className="flex h-full items-end gap-[3px]">
                  <div
                    className="w-[9px] rounded-t-[3px] bg-[#A63D63]"
                    style={{ height: `${Math.max(2, (d.inKcal / maxEnergy) * 100)}%` }}
                  />
                  <div
                    className="w-[9px] rounded-t-[3px] bg-[#232227]"
                    style={{ height: `${Math.max(2, (d.burnedKcal / maxEnergy) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-[5px] flex justify-between text-[9.5px] text-muted-foreground">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-2.5 flex gap-3.5 text-[10px] text-muted-foreground">
              <span>
                <span className="mr-1 inline-block h-[7px] w-[7px] rounded-[2px] bg-[#A63D63]" />
                in
              </span>
              <span>
                <span className="mr-1 inline-block h-[7px] w-[7px] rounded-[2px] bg-[#232227]" />
                training burn
              </span>
            </div>
          </div>

          {/* macro adherence */}
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                MACRO ADHERENCE
              </div>
              <div className="text-[11px] text-muted-foreground">vs targets</div>
            </div>
            <div className="grid gap-2.5">
              {(
                [
                  ["P", report.macros.adherencePct.protein, "#A63D63"],
                  ["C", report.macros.adherencePct.carbs, "#232227"],
                  ["F", report.macros.adherencePct.fat, "#A9A7AE"],
                ] as const
              ).map(([label, pct, color]) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="w-4 text-[11.5px] font-bold text-foreground">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F2F1F2]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct ?? 0}%`, background: color }}
                    />
                  </div>
                  <span className="w-[38px] text-right text-[11.5px] text-[#66646C] tabular-nums">
                    {pct != null ? `${pct}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">{report.macros.note}</div>
          </div>

          {/* training */}
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              TRAINING
            </div>
            <div className="mt-3 flex">
              {(
                [
                  [String(report.training.sessions), "SESSIONS"],
                  [fmt(report.training.volumeKg), "KG VOLUME"],
                  [
                    `${Math.floor(report.training.activeMinutes / 60)}:${String(report.training.activeMinutes % 60).padStart(2, "0")}`,
                    "ACTIVE",
                  ],
                  [fmt(report.training.kcalBurned), "KCAL"],
                ] as const
              ).map(([v, l]) => (
                <div key={l} className="flex-1">
                  <div
                    className="text-[19px] font-bold text-foreground tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {v}
                  </div>
                  <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                    {l}
                  </div>
                </div>
              ))}
            </div>
            {report.training.zonesPct && (
              <>
                <div className="mt-3.5 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
                  {report.training.zonesPct.map((p, i) => (
                    <div key={i} style={{ width: `${p}%`, background: ZONE_COLORS[i] }} />
                  ))}
                </div>
                <div className="mt-[7px] flex justify-between text-[10px] text-muted-foreground">
                  {report.training.zonesPct.map((p, i) => (
                    <span key={i}>
                      Z{i + 1} {p}%
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* weight */}
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                WEIGHT · WEEK
              </div>
              {report.weight.deltaKg != null && (
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: report.weight.deltaKg <= 0 ? "#5E9B72" : "#D9A23E" }}
                >
                  {report.weight.deltaKg > 0 ? "+" : "−"}
                  {Math.abs(report.weight.deltaKg).toFixed(1)} kg
                </div>
              )}
            </div>
            {report.weight.startKg != null && report.weight.endKg != null ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className="text-[19px] font-bold text-muted-foreground tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {report.weight.startKg.toFixed(1)}
                  </span>
                  <span className="text-[13px] text-muted-foreground">→</span>
                  <span
                    className="text-[19px] font-bold text-foreground tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {report.weight.endKg.toFixed(1)} kg
                  </span>
                </div>
                {weightSpark && (
                  <svg width="100%" height="30" viewBox="0 0 360 30" preserveAspectRatio="none" className="mt-2">
                    <polyline
                      points={weightSpark}
                      fill="none"
                      stroke="#A63D63"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">No weigh-ins this week.</p>
            )}
          </div>

          {/* coach */}
          {report.coach && (
            <div className="mt-3 rounded-[18px] bg-accent p-[18px]">
              <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-[#8C2F51]">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
                </svg>
                COACH
              </div>
              <div className="mt-2.5 text-[13.5px] leading-[1.65] text-foreground">
                {report.coach}
              </div>
            </div>
          )}

          <div className="mt-4 text-center text-[11px] text-muted-foreground">
            Writes itself every Sunday night
          </div>
        </>
      )}
    </div>
  );
}
