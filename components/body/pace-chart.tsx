"use client";

import { type Pace, dayLabel } from "@/lib/body-view";

// Pace chart (spec §2): two lines and one gap. Dashed = the pace the date
// needs; solid = the pace he is on, running to its arrival and then flat. When
// the arrival is past the window the solid line ends above the target on the
// right edge, and that vertical gap is the shortfall.

export function PaceChart({
  pace,
  goalWeightKg,
  goalDay,
}: {
  pace: Pace;
  goalWeightKg: number;
  goalDay: string;
}) {
  const c = pace.chart;
  const goalLabel = dayLabel(goalDay).toUpperCase();
  return (
    <div style={{ position: "relative", marginTop: 6 }}>
      <svg viewBox="0 0 320 100" width="100%" height="100" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <line x1="16" x2="304" y1="74" y2="74" stroke="var(--b-rule)" strokeWidth="1" />
        <line x1={c.goalX} x2={c.goalX} y1="8" y2="80" stroke="var(--b-rule2)" strokeWidth="1" strokeDasharray="2 3" />
        <path d={c.neededPath} fill="none" stroke="var(--b-ghost)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={c.onPath} fill="none" stroke="var(--b-rasp)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="14" r="4" fill="var(--b-rasp)" stroke="var(--b-card)" strokeWidth="2" />
        <circle cx={c.arrivalX} cy={c.arrivalY} r="4.5" fill="var(--b-rasp)" stroke="var(--b-card)" strokeWidth="2" />
        <text x="16" y="94" fontSize="9.5" letterSpacing="0.8" fill="var(--b-faint)" fontWeight="600">TODAY</text>
      </svg>
      <div
        style={{
          position: "absolute", top: 86, left: `${(c.goalX / 320) * 100}%`, transform: "translateX(-50%)",
          fontSize: 9.5, letterSpacing: ".08em", fontWeight: 600, color: "var(--b-faint)", whiteSpace: "nowrap", pointerEvents: "none",
        }}
      >
        {goalLabel}
      </div>
      <div
        style={{
          position: "absolute", top: 52, left: `${(c.arrivalX / 320) * 100}%`, transform: "translateX(-50%)",
          fontSize: 10.5, fontWeight: 600, color: "var(--b-deep)", whiteSpace: "nowrap", pointerEvents: "none",
          opacity: c.arrivalVisible ? 1 : 0,
        }}
      >
        {c.arrivalVisible && pace.arrivalDay ? dayLabel(pace.arrivalDay).toUpperCase() : ""}
      </div>
      <div
        style={{
          position: "absolute", top: 60, left: "calc(16 / 320 * 100%)", fontSize: 9.5, fontWeight: 600,
          color: "var(--b-faint)", whiteSpace: "nowrap", pointerEvents: "none",
        }}
      >
        {goalWeightKg} kg
      </div>
    </div>
  );
}
