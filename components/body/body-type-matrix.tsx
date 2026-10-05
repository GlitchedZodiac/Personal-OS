"use client";

import type { MatrixView } from "@/lib/body-view";
import { useRevealOnce } from "@/components/body/theme";

// Body-type matrix (spec §5): BMI × body fat, his current cell washed, and a
// monthly trail that draws itself once when the card scrolls into view. After
// the trail has drawn, only the "now" dot rings.

export function BodyTypeMatrix({ view }: { view: MatrixView }) {
  const [ref, on] = useRevealOnce<HTMLDivElement>();
  const { cell, now } = view;
  return (
    <div ref={ref} style={{ position: "relative", marginTop: 10 }}>
      <svg viewBox="0 0 320 236" width="100%" style={{ display: "block", overflow: "visible" }}>
        <rect x="36" y="10" width="274" height="190" fill="var(--b-card2)" rx="10" />
        <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill="var(--b-wash)" rx="6" />
        <line x1="90.8" x2="90.8" y1="10" y2="200" stroke="var(--b-rule2)" strokeWidth="1" />
        <line x1="153.4" x2="153.4" y1="10" y2="200" stroke="var(--b-rule2)" strokeWidth="1" />
        <line x1="36" x2="310" y1="96.4" y2="96.4" stroke="var(--b-rule2)" strokeWidth="1" />
        <line x1="36" x2="310" y1="139.5" y2="139.5" stroke="var(--b-rule2)" strokeWidth="1" />
        {view.captions.map((c) => (
          <text
            key={c.text}
            x={c.x}
            y={c.y}
            textAnchor="end"
            fontSize="8.5"
            fill={c.current ? "var(--b-deep)" : "var(--b-faint)"}
            fontWeight={c.current ? 700 : 600}
          >
            {c.text}
          </text>
        ))}
        <text x="30" y="99" fontSize="9.5" fill="var(--b-faint)" textAnchor="end">30</text>
        <text x="30" y="142" fontSize="9.5" fill="var(--b-faint)" textAnchor="end">25</text>
        <text x="30" y="200" fontSize="9.5" fill="var(--b-faint)" textAnchor="end">18.5</text>
        <text x="30" y="16" fontSize="9" fill="var(--b-ghost)" textAnchor="end" letterSpacing="0.8">BMI</text>
        <text x="90.8" y="214" fontSize="9.5" fill="var(--b-faint)" textAnchor="middle">12</text>
        <text x="153.4" y="214" fontSize="9.5" fill="var(--b-faint)" textAnchor="middle">20</text>
        <text x="310" y="214" fontSize="9.5" fill="var(--b-faint)" textAnchor="end">40</text>
        <text x="36" y="230" fontSize="9" fill="var(--b-ghost)" letterSpacing="0.8">BODY FAT %</text>
        <polyline
          points={view.polyline}
          fill="none"
          stroke="var(--b-rasp)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity=".5"
          strokeDasharray={view.length}
          style={{ strokeDashoffset: on ? 0 : view.length, transition: "stroke-dashoffset 1.8s cubic-bezier(.4,0,.2,1)" }}
        />
        {view.trail.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="var(--b-card)"
            stroke="var(--b-rasp)"
            strokeWidth="1.5"
            opacity={on ? p.opacity : 0}
            style={{ transition: "opacity .6s ease" }}
          />
        ))}
        {on && (
          <circle
            cx={now.x}
            cy={now.y}
            r="6"
            fill="var(--b-rasp)"
            opacity=".5"
            style={{ transformOrigin: `${now.x}px ${now.y}px`, animation: "body-ring 1.8s ease-out infinite" }}
          />
        )}
        <circle cx={now.x} cy={now.y} r="6" fill="var(--b-rasp)" stroke="var(--b-card)" strokeWidth="2.5" />
      </svg>
      {view.trail.map((p, i) =>
        p.label ? (
          <div
            key={i}
            style={{
              position: "absolute", left: `${(p.x / 320) * 100}%`, top: `${((p.y - 6) / 236) * 100}%`,
              transform: "translate(-50%,-100%)", fontSize: 8.5, fontWeight: 600, color: "var(--b-faint)",
              opacity: on ? p.opacity : 0, transition: "opacity .6s ease", whiteSpace: "nowrap", pointerEvents: "none",
            }}
          >
            {p.label}
          </div>
        ) : null
      )}
    </div>
  );
}
