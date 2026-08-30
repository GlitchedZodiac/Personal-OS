"use client";

// Small desk primitives ported from the design: pane header, chips, the
// dark pill menu (action bars, lasso menu), popover shell, section heads,
// the 3-segment pill, kicker text. Tokens per docs/design/pitaya-tokens.md.

import { useCallback, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Diamond } from "./desk-icons";

export const DISPLAY = "var(--font-display)";
export const SERIF = "var(--font-serif)";

export function Kicker({ children, color = "#96949B", size = 9.5, style }: { children: ReactNode; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <span style={{ fontSize: size, letterSpacing: "0.14em", fontWeight: 700, color, ...style }}>{children}</span>
  );
}

/** The 40px pane header: KICKER ⌄ · title · right slot (01/02/03/04). */
export function PaneHeader({
  kicker,
  title,
  meta,
  right,
  onKicker,
  onTitle,
  titleGlyph = "\u270E",
  titleHint = "Rename this page",
  children,
}: {
  kicker: string;
  title?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  onKicker?: () => void;
  /** tap the title to rename what this pane is showing — or, on the Bible, to navigate */
  onTitle?: () => void;
  /** the affordance drawn after the title: a pencil to rename, a chevron to open a menu */
  titleGlyph?: string;
  titleHint?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        height: 40,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 14px",
        borderBottom: "1px solid #EDEBEE",
        background: "#FFFFFF",
        position: "relative",
        zIndex: 3,
        // a belt-and-braces guarantee: whatever the breakpoints decide, the row can never push
        // a control past the pane edge, because the pane clips (desk-shell paneBox overflow:hidden)
        // and a clipped control is an unreachable one
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onKicker}
        style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B", cursor: onKicker ? "pointer" : "default", background: "none", border: 0, padding: 0 }}
      >
        {kicker}
        {onKicker ? " ⌄" : ""}
      </button>
      {title !== undefined && (
        <>
          <span style={{ fontSize: 11, color: "#C9C7CD" }}>·</span>
          {onTitle ? (
            <button type="button" onClick={onTitle} title={titleHint} aria-label={titleHint} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, background: "transparent", border: 0, padding: "3px 6px", marginLeft: -6, borderRadius: 7, cursor: "pointer", font: "inherit" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{title}</span>
              <span style={{ fontSize: 10, color: "#C9C7CD", flex: "none" }}>{titleGlyph}</span>
            </button>
          ) : (
            <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{title}</span>
          )}
        </>
      )}
      {meta && <span style={{ fontSize: 10.5, color: "#96949B", whiteSpace: "nowrap" }}>{meta}</span>}
      {children}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function Chip({
  children,
  tone = "tint",
  onClick,
  style,
  title,
}: {
  children: ReactNode;
  tone?: "tint" | "outline" | "dark" | "success" | "ghost" | "primary";
  onClick?: () => void;
  style?: CSSProperties;
  title?: string;
}) {
  const tones: Record<string, CSSProperties> = {
    tint: { background: "#F6E3EB", color: "#8C2F51" },
    outline: { background: "#FFFFFF", color: "#66646C", border: "1px solid #E4E2E6" },
    dark: { background: "#232227", color: "#F2F1F2" },
    success: { background: "#EAF3ED", color: "#3E7A54" },
    ghost: { background: "transparent", color: "#96949B" },
    primary: { background: "#A63D63", color: "#FFFFFF" },
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        borderRadius: 99,
        padding: "3px 9px",
        border: 0,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "var(--font-body)",
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** STUDY | SCRATCH, HIDE | DIM | SHOW — one-tap segments, never a cycling button (05). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div style={{ display: "flex", background: "#FAF9FA", border: "1px solid #E4E2E6", borderRadius: 99, padding: 2.5 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              fontSize: size === "sm" ? 8.5 : 9,
              letterSpacing: "0.08em",
              fontWeight: 700,
              color: on ? "#FFFFFF" : "#96949B",
              background: on ? "#A63D63" : "transparent",
              borderRadius: 99,
              padding: size === "sm" ? "3px 9px" : "3.5px 12px",
              border: 0,
              cursor: "pointer",
              transition: "background .2s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The dark pill (action bar A/B, lasso menu) — items are icons or labels. */
export function DarkPill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: "#232227",
        borderRadius: 14,
        animation: "deskPopIn .26s cubic-bezier(.2,.9,.3,1.2) both",
        // +20% (his 2026-08-30 ask): these are Pencil targets with a palm on the glass
        padding: "6px 9px",
        boxShadow: "0 10px 28px rgba(20,15,18,0.35)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PillItem({ children, onClick, title, muted, style }: { children: ReactNode; onClick?: () => void; title?: string; muted?: boolean; style?: CSSProperties }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="desk-pill-item"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 12px",
        borderRadius: 9,
        fontSize: 12,
        fontWeight: 600,
        color: muted ? "#96949B" : "#F2F1F2",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** White floating popover (pen settings, layout picker, brush library, palette). */
/**
 * The popover shell — PORTALLED to <body>.
 *
 * Every pane menu used to render in place, inside its pane. Two walls killed that on the
 * real desk: the pane's own `overflow: hidden` clipped anything taller or wider than the
 * pane, and `PaneHeader` is a stacking context at zIndex 3, so a menu — whatever its own
 * z — drew UNDER the seam toolbar (z 5) and the band (z 20). His words: "they hide behind
 * things. they really should show up at the top."
 *
 * The call-site API is unchanged: `style` still positions relative to the PARENT of the
 * Popover, exactly as `position: absolute` did. A zero-size anchor span finds that parent;
 * the panel is portalled to <body> as `position: fixed`, its offsets translated from the
 * parent's rect, clamped to the viewport, and capped in height so a long menu scrolls
 * instead of vanishing off-screen. Positioning happens by direct style assignment in a
 * layout effect (no setState — the react-compiler rules ban synchronous setState there).
 */
export function Popover({
  children,
  style,
  onClose,
  width = 296,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClose?: () => void;
  width?: number;
}) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  // No mounted-flag dance: a popover only ever exists because he tapped something, which is
  // always post-hydration, so `document` is there. (An earlier version gated the portal on a
  // requestAnimationFrame and the menu never opened at all when the frame loop was starved.)
  const canPortal = typeof document !== "undefined";
  const place = useCallback(() => {
    const el = panel.current;
    const parent = anchor.current?.parentElement;
    if (!el || !parent) return;
    const r = parent.getBoundingClientRect();
    const s = (style ?? {}) as Record<string, number | string | undefined>;
    const num = (v: number | string | undefined) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0);
    let left: number;
    if (s.left !== undefined) left = r.left + num(s.left);
    else if (s.right !== undefined) left = r.right - num(s.right) - width;
    else left = r.left;
    let top: number;
    if (s.top !== undefined) top = r.top + num(s.top);
    else if (s.bottom !== undefined) top = r.bottom - num(s.bottom) - el.offsetHeight;
    else top = r.bottom + 4;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - 56));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${window.innerHeight - top - 12}px`;
    el.style.visibility = "visible";
  }, [style, width]);
  useLayoutEffect(() => {
    place();
    // a rotation or a keyboard-driven viewport change would otherwise strand the panel at
    // stale fixed coordinates
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("orientationchange", place);
    };
  }, [place]);
  return (
    <>
      <span ref={anchor} style={{ position: "absolute", width: 0, height: 0 }} />
      {canPortal && createPortal(
        <>
          {onClose && <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80 }} />}
          <div
            ref={panel}
            style={{
              position: "fixed",
              zIndex: 81,
              width,
              visibility: "hidden",
              overflowY: "auto",
              background: "#FFFFFF",
              borderRadius: 14,
              boxShadow: "0 16px 48px rgba(20,15,18,0.28)",
              padding: 13,
              animation: "deskPopIn .24s cubic-bezier(.2,.9,.3,1.15) both",
              transformOrigin: "top right",
              boxSizing: "border-box",
              ...style,
              left: undefined,
              right: undefined,
              top: undefined,
              bottom: undefined,
            }}
          >
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Section head on a page: small diamond + caps label (sermon page, worksheets). */
export function SectionHead({ label, color = "#B7A2AC", diamond = "#D9B9C8", size = 9 }: { label: string; color?: string; diamond?: string; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Diamond size={7} color={diamond} />
      <span style={{ fontSize: size, letterSpacing: "0.15em", fontWeight: 700, color }}>{label}</span>
    </div>
  );
}

/** Round 34px icon button from the desk bar. */
export function IconButton({ children, onClick, active, title, style }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: active ? "#F6E3EB" : "#FFFFFF",
        border: `1px solid ${active ? "#A63D63" : "#E4E2E6"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const cardShadow = "0 2px 12px rgba(35,34,39,0.06)";
