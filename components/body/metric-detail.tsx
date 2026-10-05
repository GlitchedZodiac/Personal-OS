"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RangeBar } from "@/components/body/range-bar";
import { Card, DISPLAY, KICKER, chipStyle, useBodyTheme } from "@/components/body/theme";
import { TrendChart } from "@/components/body/trend-chart";
import type { BodySummary } from "@/lib/body-summary";
import {
  COMP,
  type DayPoint,
  type MetricKey,
  RANGES,
  type RangeKey,
  SER,
  addDays,
  bandNote,
  buildCompRow,
  dayLabel,
  daysBetween,
  fmtDelta,
  fmtValue,
  meaningNote,
  pointsInRange,
  scaleChangeNote,
} from "@/lib/body-view";

// Metric push-in (spec §9): slides in from the right over the Body screen.
// The value and its range, the trend with the same chips and scrub, the value
// against its reference band with one sentence about where it sits, the last
// weekly readings, and what the number means.

/** One reading per week going back from today — the reading nearest each
 *  7-day mark, within three days. A week he did not weigh in is left out
 *  rather than filled with a number nobody measured. */
function weeklyReadings(points: readonly DayPoint[], today: string, count = 6): DayPoint[] {
  const out: DayPoint[] = [];
  for (let j = 0; out.length < count && j < 26; j++) {
    const mark = addDays(today, -7 * j);
    let best: DayPoint | null = null;
    for (const p of points) {
      const gap = Math.abs(daysBetween(p.day, mark));
      if (gap <= 3 && (!best || gap < Math.abs(daysBetween(best.day, mark)))) best = p;
    }
    if (best && !out.some((o) => o.day === best!.day)) out.push(best);
  }
  return out;
}

export function MetricDetail({ metric }: { metric: MetricKey }) {
  const router = useRouter();
  const theme = useBodyTheme();
  const [data, setData] = useState<BodySummary | null>(null);
  const [range, setRange] = useState<RangeKey>("90d");
  const [delta, setDelta] = useState("");
  const [extent, setExtent] = useState<[string, string] | null>(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/health/body/summary?tz=${encodeURIComponent(tz)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setData(json as BodySummary))
      .catch((error) => console.error("Metric detail load failed:", error));
  }, []);

  const meta = SER[metric];
  const spec = COMP.find((c) => c.key === metric)!;
  const isTape = metric === "waist";

  const view = useMemo(() => {
    if (!data) return null;
    const all: DayPoint[] = isTape ? data.tape.waist : data.series[metric as keyof typeof data.series] ?? [];
    if (all.length === 0) return { all, row: null, list: [] as { date: string; value: string; delta: string; good: boolean }[] };
    const row = buildCompRow(spec, all, data.today, {
      start: metric === "weight" ? data.start.weightKg : undefined,
      target: metric === "weight" ? data.goals.weightKg : metric === "fat" ? data.goals.bodyFatPct : null,
    });
    // Newest first; each row's change is against the one before it in time.
    const picked = isTape ? [...all].reverse() : weeklyReadings(all, data.today);
    const list = picked.map((p, i) => {
      const prev = picked[i + 1];
      // "vs previous week" needs a previous week. Across a longer gap — or
      // across the change of scale — a difference is not a weekly change,
      // and must not be dressed as one.
      const gap = prev ? daysBetween(prev.day, p.day) : 0;
      const crossesScales =
        !isTape && spec.estimate && prev != null && data.scaleChangedOn != null &&
        prev.day < data.scaleChangedOn && p.day >= data.scaleChangedOn;
      if (!prev || (!isTape && gap > 10) || crossesScales) {
        return { date: dayLabel(p.day), value: fmtValue(metric, p.value), delta: "—", good: false };
      }
      const d = p.value - prev.value;
      const f = fmtDelta(metric, d);
      return {
        date: dayLabel(p.day),
        value: fmtValue(metric, p.value),
        delta: f.text,
        good: !f.flat && (meta.down ? d < 0 : d > 0),
      };
    });
    return { all, row, list };
  }, [data, metric, spec, isTape, meta.down]);

  const points = useMemo(
    () => (data && view ? pointsInRange(view.all, range, data.today) : []),
    [data, view, range]
  );

  return (
    <div
      className="body-theme"
      data-theme={theme}
      style={{
        background: "var(--b-bg)", minHeight: "100dvh", padding: "48px 22px 150px",
        animation: "body-push .42s cubic-bezier(.32,.86,.3,1) both", boxShadow: "-16px 0 40px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          role="button"
          aria-label="Back to Body"
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 99, background: "var(--b-card)", boxShadow: "var(--b-shadow)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none",
          }}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="var(--b-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2 2 8l6 6" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "var(--b-faint)" }}>BODY · SMART SCALE</div>
          <h1 style={{ ...DISPLAY, fontSize: 26, fontWeight: 700, color: "var(--b-ink)", letterSpacing: "-0.02em" }}>{meta.label}</h1>
        </div>
        {delta && points.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-deep)", background: "var(--b-wash)", padding: "5px 11px", borderRadius: 99 }}>{delta}</div>
        )}
      </div>

      {!data || !view ? (
        <Card padding="20px" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--b-sub)" }}>Loading…</div>
        </Card>
      ) : !view.row ? (
        <Card padding="20px" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--b-sub)", lineHeight: 1.55 }}>
            No {meta.label.toLowerCase()} readings yet{isTape ? " — tape your waist from the Body screen." : "."}
          </div>
        </Card>
      ) : (
        <>
          <Card padding="20px" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ ...DISPLAY, fontSize: 46, fontWeight: 700, color: "var(--b-ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {view.row.valueText}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--b-faint)" }}>{meta.unit}</span>
              </div>
              {extent && points.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--b-sub)" }}>
                  {extent[0]} – {extent[1]}
                </div>
              )}
            </div>
            <div className="body-noscroll" style={{ display: "flex", gap: 6, marginTop: 14, overflowX: "auto" }}>
              {RANGES.filter(([key]) => key !== "custom").map(([key, label]) => (
                <div key={key} role="button" onClick={() => setRange(key)} style={chipStyle(range === key, "square")}>
                  {label}
                </div>
              ))}
            </div>
            <TrendChart
              metric={metric}
              points={points}
              rangeLabel={RANGES.find((r) => r[0] === range)![1]}
              resetKey={`${metric}-${range}`}
              onDelta={setDelta}
              onExtent={(lo, hi) => setExtent([lo, hi])}
              note={scaleChangeNote(metric, points, data.scaleChangedOn)}
            />
          </Card>

          <Card padding="16px 20px">
            <div style={KICKER}>AGAINST THE BAND</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <RangeBar geometry={view.row} slide={false} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--b-faint)", marginTop: 2 }}>
              <span>{view.row.axisLo}</span>
              <span>band {view.row.bandText}</span>
              <span>{view.row.axisHi}</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--b-sub)", marginTop: 8 }}>
              {bandNote(metric, {
                value: view.row.value,
                band: spec.band,
                start: view.row.start,
                target: view.row.target,
                skeletalMuscleKg: data.series.skm[data.series.skm.length - 1]?.value ?? null,
                heightCm: data.profile.heightCm,
                age: data.profile.age,
                startWeightKg: data.start.weightKg,
              })}
            </div>
          </Card>

          <Card padding="16px 20px 6px">
            <div style={KICKER}>{isTape ? "TAPES" : "WEEKLY READINGS"}</div>
            {view.list.map((x) => (
              <div key={x.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--b-rule)" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--b-ink)" }}>{x.date}</div>
                <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
                  <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700, color: "var(--b-ink)" }}>{x.value}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: x.good ? "var(--b-green)" : "var(--b-faint)", width: 44, textAlign: "right" }}>{x.delta}</span>
                </div>
              </div>
            ))}
          </Card>

          <div style={{ background: "var(--b-wash)", borderRadius: 18, padding: 18, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, letterSpacing: "0.18em", fontWeight: 700, color: "var(--b-deep)" }}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="var(--b-rasp)" />
              </svg>
              WHAT IT MEANS
            </div>
            <div style={{ fontSize: 13.5, color: "var(--b-ink)", lineHeight: 1.65, marginTop: 10 }}>
              {meaningNote(metric, { value: view.row.value, start: view.row.start })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
