// Pitaya brand + icon set — every path EXTRACTED VERBATIM from
// docs/design/pitaya-app.dc.html (the design source of truth). Do not
// substitute icon libraries here; when the design gains icons, copy them in.

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Stroke24({
  size = 24,
  className,
  strokeWidth = 1.9,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** The Pitaya dragonfruit logo — design lock screen, verbatim. */
export function PitayaLogo({ size = 76, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      {tile && <rect width="48" height="48" rx="13" fill="#A63D63" />}
      <circle cx="24" cy="26" r="12.5" fill="#FFFFFF" />
      <circle cx="20" cy="23" r="1.4" fill="#A63D63" />
      <circle cx="27" cy="27" r="1.4" fill="#A63D63" />
      <circle cx="22" cy="30" r="1.4" fill="#A63D63" />
      <circle cx="28" cy="21.5" r="1.4" fill="#A63D63" />
      <path d="M28 12 Q31 8 36 9 Q34 14 30 14.5 Z" fill="#FFFFFF" opacity="0.9" />
      <path d="M18 13 Q14 10 10.5 12 Q13 16 17 15.5 Z" fill="#FFFFFF" opacity="0.7" />
    </svg>
  );
}

/* ── Tab bar icons (design tab bar, verbatim paths) ─────────────────── */

export function BodyIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M8 21v-5l-1.5-4A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 2.5L16 16v5" />
    </Stroke24>
  );
}

export function FoodIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3" />
    </Stroke24>
  );
}

export function TodayIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </Stroke24>
  );
}

export function TrainIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      <path d="M7.5 8h9c2 2.2 3 4.6 3 7a7.5 7.5 0 0 1-15 0c0-2.4 1-4.8 3-7Z" />
    </Stroke24>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </Stroke24>
  );
}

/* ── Activity icons (Train → Activities, design 2026-08-11 rev ICO map,
      verbatim paths; kettlebell = TrainIcon above) ─────────────────────── */

export function CircuitIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M10 2.5h4M12 5.5a8 8 0 1 0 0.01 0ZM12 9.5v4.5" />
    </Stroke24>
  );
}

export function TrailIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M3 18L9 8l4 5.5 3-4L21 18Z" />
    </Stroke24>
  );
}

export function WalkIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M12 3.5a1.9 1.9 0 1 1-0.01 0M13 8.5l-3 5 4 3V21M10 13.5l-3 2.5M14 16.5l4 2.5" />
    </Stroke24>
  );
}

/* ── Dock icons (chat · mic · camera, verbatim) ─────────────────────── */

export function ChatBubbleIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L4 20l1.2-4.3A8.5 8.5 0 1 1 21 11.5Z" />
    </Stroke24>
  );
}

export function MicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="7" y="2" width="6" height="11" rx="3" fill="#FFFFFF" />
      <path
        d="M4 9 a6 6 0 0 0 12 0 M10 15 v3"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Stroke24 {...props}>
      <path d="M3 8.5a2 2 0 0 1 2-2h1.6l1.4-2h8l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </Stroke24>
  );
}
