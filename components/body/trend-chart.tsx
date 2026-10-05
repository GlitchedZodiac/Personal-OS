"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { type DayPoint, type MetricKey, trendChart } from "@/lib/body-view";
import { haptic } from "@/lib/haptics";

// Trend chart (spec §6): raw dots sized by density under a centred 7-day mean,
// a wash beneath it, and a pointer-captured scrub that snaps to real points
// and ticks once per point crossed. The tooltip stays where the finger left.

export function TrendChart({
  metric,
  points,
  rangeLabel,
  resetKey,
  onDelta,
  onExtent,
  note,
}: {
  metric: MetricKey;
  points: readonly DayPoint[];
  rangeLabel: string;
  /** Changes when a chip is reselected — the scrub returns to the newest point. */
  resetKey: string;
  onDelta?: (text: string) => void;
  onExtent?: (lo: string, hi: string) => void;
  /** One plain sentence under the chart — e.g. a change of scale in range. */
  note?: string | null;
}) {
  const g = useMemo(() => trendChart(metric, points, rangeLabel), [metric, points, rangeLabel]);
  const [scrub, setScrub] = useState<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    setScrub(null);
    last.current = null;
  }, [resetKey]);
  useEffect(() => {
    if (g) {
      onDelta?.(g.delta);
      onExtent?.(g.lo, g.hi);
    }
    // The callbacks are setters; only the geometry should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  if (!g) {
    return (
      <div style={{ height: 160, marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "var(--b-faint)" }}>
        No readings in this range yet.
      </div>
    );
  }

  const index = scrub == null ? g.n - 1 : Math.max(0, Math.min(g.n - 1, scrub));
  const tip = g.tip(index);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = g.indexAt(((e.clientX - box.left) / box.width) * 360);
    if (last.current !== i) {
      last.current = i;
      haptic("light");
      setScrub(i);
    }
  };

  return (
    <>
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pointer capture is a nicety; the drag still works without it.
          }
          move(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) move(e);
        }}
        onPointerUp={(e) => e.stopPropagation()}
        style={{ position: "relative", marginTop: 14, touchAction: "none", cursor: "crosshair", userSelect: "none" }}
      >
        <svg viewBox="0 0 360 160" width="100%" height="160" preserveAspectRatio="none" style={{ display: "block" }}>
          <line x1="6" x2="354" y1="14" y2="14" stroke="var(--b-rule)" strokeWidth="1" />
          <line x1="6" x2="354" y1="80" y2="80" stroke="var(--b-rule)" strokeWidth="1" />
          <line x1="6" x2="354" y1="146" y2="146" stroke="var(--b-rule)" strokeWidth="1" />
          <path d={g.area} fill="var(--b-rasp)" opacity="0.10" />
          {g.raw.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={g.dotR} fill="var(--b-rasp)" opacity={g.dotO} />
          ))}
          <path d={g.line} fill="none" stroke="var(--b-rasp)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={tip.x} x2={tip.x} y1="14" y2="146" stroke="var(--b-ink)" strokeWidth="1" opacity="0.22" />
          <circle cx={tip.x} cy={tip.y} r="5" fill="var(--b-rasp)" stroke="var(--b-card)" strokeWidth="2" />
        </svg>
        <div
          style={{
            position: "absolute", left: `${(tip.left / 360) * 100}%`, top: tip.top,
            background: "var(--b-tip)", color: "var(--b-tip-ink)", fontSize: 11.5, fontWeight: 600,
            padding: "5px 9px", borderRadius: 8, whiteSpace: "nowrap", pointerEvents: "none",
          }}
        >
          {tip.text}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--b-faint)", letterSpacing: ".06em", marginTop: 6 }}>
        <span style={{ whiteSpace: "nowrap" }}>{g.x0}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" }}>
          {g.smText} · touch &amp; drag
        </span>
        <span style={{ whiteSpace: "nowrap" }}>{g.x1}</span>
      </div>
      {note && <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--b-faint)", marginTop: 8 }}>{note}</div>}
    </>
  );
}
