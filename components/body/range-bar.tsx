"use client";

import type { RangeBarGeometry } from "@/lib/body-view";

// Range bar (spec §3): a 4px track, the dimmed reference band, a history line
// from the start to now, a hollow start dot, an ink diamond for the target
// and the raspberry "now" dot, which slides when a new reading lands. Values
// outside the band are never coloured — the band is context.

export function RangeBar({
  geometry,
  slide = true,
}: {
  geometry: RangeBarGeometry;
  slide?: boolean;
}) {
  const g = geometry;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  return (
    <div style={{ flex: 1, position: "relative", height: 22 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 9, height: 4, borderRadius: 99, background: "var(--b-track)" }} />
      <div style={{ position: "absolute", top: 7, height: 8, borderRadius: 99, background: "var(--b-band)", left: pct(g.bandL), width: pct(g.bandW) }} />
      <div style={{ position: "absolute", top: 10, height: 2, background: "var(--b-rasp)", opacity: 0.35, left: pct(g.histL), width: pct(g.histW) }} />
      <div
        style={{
          position: "absolute", top: 7, width: 6, height: 6, borderRadius: 99,
          border: "1.5px solid var(--b-faint)", background: "var(--b-card)",
          left: `calc(${pct(g.startX)} - 4px)`,
        }}
      />
      {g.targetX != null && (
        <div
          style={{
            position: "absolute", top: 7, width: 7, height: 7, background: "var(--b-ink)",
            transform: "rotate(45deg)", left: `calc(${pct(g.targetX)} - 3.5px)`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute", top: 6, width: 10, height: 10, borderRadius: 99,
          background: "var(--b-rasp)", boxShadow: "0 0 0 2px var(--b-card)",
          left: `calc(${pct(g.nowX)} - 5px)`,
          transition: slide ? "left .8s cubic-bezier(.22,.9,.3,1)" : undefined,
        }}
      />
    </div>
  );
}
