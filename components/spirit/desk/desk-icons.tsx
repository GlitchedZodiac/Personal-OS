// Icons for the iPad desk — every path extracted verbatim from the design
// files (docs/design/pitaya-ipad-0*.dc.html). PORT GATE: add by extraction,
// never from an icon library.

import type { CSSProperties } from "react";

interface P {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

const base = (size: number, vb: string, props: P, extra?: Record<string, string | number>) => ({
  width: size,
  height: size,
  viewBox: vb,
  fill: "none",
  stroke: props.color ?? "#454349",
  strokeWidth: props.strokeWidth ?? 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  style: props.style,
  className: props.className,
  ...extra,
});

/** The Pitaya diamond — a square rotated 45°. */
export function Diamond({ size = 11, color = "#A63D63", style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={style} aria-hidden>
      <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill={color} />
    </svg>
  );
}

export function PenIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M12 19l7-7-4-4-7 7-1.5 5.5L12 19Z" />
      <path d="M15 8l1.5-1.5a2.4 2.4 0 0 1 3.4 3.4L18.5 11.5" />
    </svg>
  );
}
export function GPenIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M5 19 16 8l-2.5-2.5L4 16l1 3Z" />
      <path d="M13.5 5.5 18 10M16 3l3 3" />
    </svg>
  );
}
export function HighlighterIcon(p: P) {
  // a chisel highlighter over its wash. (The design file drew this and the eraser with the
  // SAME primary path — they were indistinguishable on the rail, 2026-08-22.)
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M9 13.5 15.5 7l3.5 3.5L12.5 17H9v-3.5Z" />
      <path d="M15.5 7l1.8-1.8a1.8 1.8 0 0 1 2.5 2.5L18 9.5" />
      <path d="M4 20.5h16" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}
export function PencilIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M6 20l1-4L17.5 5.5a2 2 0 0 1 3 3L10 19l-4 1Z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}
export function MarkerIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M9 3h6v6l3 3v9H6v-9l3-3V3Z" />
      <path d="M9 9h6" />
    </svg>
  );
}
export function EraserIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M8.5 18.5 3.8 13.8a1.8 1.8 0 0 1 0-2.6l7-7a1.8 1.8 0 0 1 2.6 0l4.7 4.7a1.8 1.8 0 0 1 0 2.6l-6.4 6.4c-.4.4-.9.6-1.4.6H8.5Z" />
      <path d="M8.6 6.6 15.4 13.4" />
      <path d="M4 20.5h16" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}
export function HandIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <path d="M9 11V5.2a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M12.2 11V4.2a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M15.4 11.4V6.8a1.6 1.6 0 0 1 3.2 0V14a6.4 6.4 0 0 1-6.4 6.4h-.8a5.6 5.6 0 0 1-4.2-1.9L4 14.6a1.7 1.7 0 0 1 2.4-2.4L9 14.4" />
    </svg>
  );
}
export function LassoIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <ellipse cx="11" cy="11" rx="8" ry="6.5" strokeDasharray="2.6 3" />
      <path d="M17 16l3 4" />
    </svg>
  );
}
export function TextToolIcon({ size = 15, color = "#66646C" }: P) {
  return (
    <span style={{ fontFamily: "var(--font-display)", fontSize: size, fontWeight: 700, color, lineHeight: 1 }}>T</span>
  );
}
export function RefCardIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M7 10.5h7M7 14h4" />
    </svg>
  );
}
export function PhotoIcon(p: P) {
  return (
    <svg {...base(p.size ?? 17, "0 0 24 24", p)}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7 10 4h4l1.5 3" />
      <circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}
export function MicIcon(p: P) {
  return (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 20 20" style={p.style} className={p.className}>
      <rect x="7" y="1.5" width="6" height="10.5" rx="3" fill="none" stroke={p.color ?? "#66646C"} strokeWidth="1.7" />
      <path d="M4 8.5a6 6 0 0 0 12 0M10 14.5v3" stroke={p.color ?? "#66646C"} strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function MicFilledIcon({ size = 12, color = "#8C2F51" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="7" y="1.5" width="6" height="10.5" rx="3" fill={color} />
      <path d="M4 8.5a6 6 0 0 0 12 0M10 14.5v3" stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function UndoIcon(p: P) {
  return (
    <svg {...base(p.size ?? 15, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 1.9 })}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}
export function RedoIcon(p: P) {
  return (
    <svg {...base(p.size ?? 15, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 1.9 })}>
      <path d="M15 14 20 9l-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  );
}
export function LayoutGridIcon(p: P) {
  const c = p.color ?? "#454349";
  return (
    <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 16 16" style={p.style}>
      <rect x="1" y="1" width="6" height="6" rx="1.4" fill="none" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.4" fill="none" stroke={c} strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.4" fill="none" stroke={c} strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.4" fill="none" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}
export function FlipIcon(p: P) {
  return (
    <svg {...base(p.size ?? 15, "0 0 16 16", { ...p, strokeWidth: p.strokeWidth ?? 1.6 })}>
      <path d="M4.5 3 2 5.5 4.5 8M2 5.5h9M11.5 8 14 10.5 11.5 13M14 10.5H5" />
    </svg>
  );
}
export function EyeIcon(p: P) {
  return (
    <svg {...base(p.size ?? 13, "0 0 24 24", p)}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
export function LayersIcon(p: P) {
  return (
    <svg {...base(p.size ?? 11, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 2, color: p.color ?? "#8C2F51" })}>
      <path d="M12 3 2.5 8.5 12 14l9.5-5.5L12 3Z" />
      <path d="M2.5 14 12 19.5 21.5 14" />
    </svg>
  );
}
export function MarginIcon(p: P) {
  return (
    <svg {...base(p.size ?? 13, "0 0 16 16", { ...p, strokeWidth: p.strokeWidth ?? 1.6 })}>
      <rect x="1.5" y="2" width="13" height="12" rx="2" />
      <path d="M6 2v12" strokeDasharray="2 2" />
    </svg>
  );
}
export function LockIcon(p: P) {
  return (
    <svg {...base(p.size ?? 8, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 2.6, color: p.color ?? "#A9A7AE" })}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
export function PinIcon(p: P) {
  return (
    <svg {...base(p.size ?? 9, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 2.4, color: p.color ?? "#8C2F51" })}>
      <path d="M12 17v5M5 17h14l-2-6V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6l-2 6Z" />
    </svg>
  );
}
export function CheckIcon(p: P) {
  return (
    <svg {...base(p.size ?? 13, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 2, color: p.color ?? "#A63D63" })}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function PlayIcon({ size = 10, color = "#FFFFFF" }: P) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 10 11">
      <path d="M1.5 1l7.5 4.5-7.5 4.5Z" fill={color} />
    </svg>
  );
}
export function PauseIcon({ size = 10, color = "#FFFFFF" }: P) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 10 11">
      <rect x="1" y="1" width="2.8" height="9" rx="1.2" fill={color} />
      <rect x="6.2" y="1" width="2.8" height="9" rx="1.2" fill={color} />
    </svg>
  );
}
export function OpenExternalIcon(p: P) {
  return (
    <svg {...base(p.size ?? 10, "0 0 12 12", { ...p, strokeWidth: p.strokeWidth ?? 1.6, color: p.color ?? "#C9C7CD" })}>
      <path d="M3 9 9 3M4.5 3H9v4.5" />
    </svg>
  );
}
export function FromArrowIcon(p: P) {
  return (
    <svg {...base(p.size ?? 9, "0 0 12 12", { ...p, strokeWidth: p.strokeWidth ?? 1.8, color: p.color ?? "#8C2F51" })}>
      <path d="M10 3 4 9M8 9H4V5" />
    </svg>
  );
}
export function BackArrowIcon(p: P) {
  return (
    <svg {...base(p.size ?? 12, "0 0 16 16", { ...p, strokeWidth: p.strokeWidth ?? 1.8, color: p.color ?? "#A63D63" })}>
      <path d="M14 8H5M8 4 4 8l4 4" />
    </svg>
  );
}
export function GearIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: p.strokeWidth ?? 1.8 })}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}
export function TodayRailIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="none" stroke="#454349" strokeWidth="1.5" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="none" stroke="#454349" strokeWidth="1.5" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="none" stroke="#454349" strokeWidth="1.5" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="none" stroke="#A63D63" strokeWidth="1.5" />
    </svg>
  );
}
export function ChatRailIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: 1.7 })}>
      <path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.9-5A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
export function FoodRailIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: 1.7 })}>
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5" />
    </svg>
  );
}
export function HealthRailIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: 1.7 })}>
      <path d="M19 14c1.5-1.6 3-3.6 3-6a5 5 0 0 0-9-3 5 5 0 0 0-9 3c0 2.4 1.5 4.4 3 6l6 6 6-6Z" />
    </svg>
  );
}
export function TrendsRailIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: 1.7 })}>
      <path d="M3 17l5-6 4 3 6-8 3 4" />
      <path d="M3 21h18" />
    </svg>
  );
}
export function JournalRailIcon(p: P) {
  return (
    <svg {...base(p.size ?? 16, "0 0 24 24", { ...p, strokeWidth: 1.7 })}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}
export function QuickShapeIcon({ size = 9, color = "#A63D63" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 10 C 4 4, 8 4, 10 2" />
    </svg>
  );
}
export function MoonIcon(p: P) {
  return (
    <svg {...base(p.size ?? 13, "0 0 24 24", { ...p, strokeWidth: 1.7, color: p.color ?? "#96949B" })}>
      <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" />
    </svg>
  );
}
export function CompassIcon(p: P) {
  return (
    <svg {...base(p.size ?? 13, "0 0 24 24", { ...p, strokeWidth: 1.8, color: p.color ?? "#96949B" })}>
      <path d="M12 21a9 9 0 1 0-9-9" />
      <path d="M3 12h9V3" />
    </svg>
  );
}
/** The recording dot — the one red in the system (#C24040). */
export function RecDot({ size = 7, live = true }: { size?: number; live?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#C24040",
        animation: live ? "pulse 1.4s ease-in-out infinite" : "none",
      }}
    />
  );
}
/** The three-bar VU meter from 01/08. */
export function VuBars({ color = "#C24040", height = 10 }: { color?: string; height?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height }}>
      {[0, 0.14, 0.28].map((d) => (
        <span
          key={d}
          style={{
            width: 2.5,
            background: color,
            borderRadius: 2,
            height: "100%",
            transformOrigin: "bottom",
            animation: `vu .7s ease-in-out infinite ${d}s`,
          }}
        />
      ))}
    </span>
  );
}
