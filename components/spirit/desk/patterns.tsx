"use client";

// V3 §8/§11 — the interaction patterns library, shared everywhere:
//
// · tap-twice destructive confirm (arms red, auto-disarms 2400ms) — tab close,
//   thread-entry delete, comment delete, verses-read card removal, page delete
// · the ring bloom that acknowledges an outside tap (§8: the tap is consumed
//   AND acknowledged — a raspberry ring at the tap point, 420ms)
// · the motion tokens (T-ENTER/T-FAST/T-SETTLE and their curves)
//
// Pure client module; no desk state. Everything here is a pattern, not a policy.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const T_ENTER = 200;
export const T_FAST = 120;
export const T_SETTLE = 260;
export const E_SWIFT = "cubic-bezier(.3,.9,.3,1)";
export const E_EXIT = "cubic-bezier(.4,0,.7,.2)";
/** §11 — destructive arm window */
export const ARM_MS = 2400;
export const DANGER = "#C24040";

/**
 * §8 — bloom a raspberry ring at a screen point. Imperative on purpose: dismissal
 * happens in a dozen scrims and two canvas tap paths, and none of them should have
 * to thread state for a 420ms acknowledgment. Appends to <body>, removes itself.
 */
export function ringBloom(x: number, y: number) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;pointer-events:none;z-index:200;animation:deskRingBloom .42s ease-out both`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 460);
}

/**
 * §11 — tap-twice. First fire arms (red, "tap again"); a second fire inside the
 * window confirms; the arm falls off by itself after 2400ms.
 */
export function useTapTwice(onConfirm: () => void, ms: number = ARM_MS) {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const fire = () => {
    if (armed) {
      if (t.current) clearTimeout(t.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setArmed(false), ms);
  };
  const disarm = () => {
    if (t.current) clearTimeout(t.current);
    setArmed(false);
  };
  return { armed, fire, disarm };
}

/**
 * The ✕ (or label) that arms before it deletes. Renders its child normally; armed,
 * it fills danger-red and appends the "tap again" cue via title. All hit targets
 * stay whatever the caller sizes them — this only owns the two-state behavior.
 */
export function ArmTwice({
  onConfirm,
  title,
  armedTitle = "tap again",
  children,
  armedChildren,
  style,
  armedStyle,
  stopPropagation = true,
  "aria-label": ariaLabel,
}: {
  onConfirm: () => void;
  title?: string;
  armedTitle?: string;
  children: ReactNode;
  /** what the control shows while armed (defaults to children) */
  armedChildren?: ReactNode;
  style?: CSSProperties;
  armedStyle?: CSSProperties;
  stopPropagation?: boolean;
  "aria-label"?: string;
}) {
  const { armed, fire } = useTapTwice(onConfirm);
  return (
    <button
      type="button"
      title={armed ? armedTitle : title}
      aria-label={ariaLabel ?? title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        fire();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        border: 0,
        cursor: "pointer",
        background: "transparent",
        padding: 0,
        transition: `background .14s ease, color .14s ease`,
        ...style,
        ...(armed ? { background: DANGER, color: "#FFFFFF", ...armedStyle } : {}),
      }}
    >
      {armed ? (armedChildren ?? children) : children}
    </button>
  );
}

/** §11 — the bottom toast pill is sonner's job app-wide; this styles inline confirmations. */
export const menuInStyle: CSSProperties = { animation: `deskMenuIn .2s ${E_SWIFT} both` };
