"use client";

// Small desk primitives ported from the design: pane header, chips, the
// dark pill menu (action bars, lasso menu), popover shell, section heads,
// the 3-segment pill, kicker text. Tokens per docs/design/pitaya-tokens.md.

import type { CSSProperties, ReactNode } from "react";
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
  children,
}: {
  kicker: string;
  title?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  onKicker?: () => void;
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
          <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{title}</span>
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
        gap: 2,
        background: "#232227",
        borderRadius: 12,
        animation: "deskPopIn .26s cubic-bezier(.2,.9,.3,1.2) both",
        padding: "5px 7px",
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
        gap: 3,
        padding: "6px 9px",
        borderRadius: 8,
        fontSize: 10,
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
  return (
    <>
      {onClose && <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}
      <div
        style={{
          position: "absolute",
          zIndex: 41,
          width,
          background: "#FFFFFF",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(20,15,18,0.28)",
          padding: 13,
          animation: "deskPopIn .24s cubic-bezier(.2,.9,.3,1.15) both",
          transformOrigin: "top right",
          ...style,
        }}
      >
        {children}
      </div>
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
