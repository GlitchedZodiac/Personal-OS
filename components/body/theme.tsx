"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

// Shared pieces of the Pitaya Body surface: the light/dark switch, and the
// handful of text styles every card repeats. Numbers come from the handoff
// spec §0 (docs/design/pitaya-body/).

export type BodyTheme = "light" | "dark";

/**
 * Follows the system. While dark is up, <html> carries data-body-theme so the
 * tab bar and dock take the dark roles too (see globals.css); the attribute
 * is removed on leave, and the rest of Pitaya stays light.
 */
export function useBodyTheme(): BodyTheme {
  const [theme, setTheme] = useState<BodyTheme>("light");
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(query.matches ? "dark" : "light");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.dataset.bodyTheme = "dark";
    else delete root.dataset.bodyTheme;
    return () => {
      delete root.dataset.bodyTheme;
    };
  }, [theme]);
  return theme;
}

export const DISPLAY: CSSProperties = { fontFamily: "var(--font-display), sans-serif" };

/** 10.5px / 0.16em / 600 / faint — the kicker over every card. */
export const KICKER: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  fontWeight: 600,
  color: "var(--b-faint)",
};

/** The smaller label inside cards (10px / 0.14em). */
export const LABEL: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  fontWeight: 600,
  color: "var(--b-faint)",
};

/** Worn by every bioimpedance-derived number, everywhere. */
export function EstTag() {
  return (
    <span
      style={{
        fontSize: 8.5,
        letterSpacing: ".06em",
        fontWeight: 600,
        border: "1px solid var(--b-rule2)",
        borderRadius: 4,
        padding: "0 3px",
        color: "var(--b-ghost)",
      }}
    >
      EST
    </span>
  );
}

export function Card({
  children,
  delay = 0,
  padding = "18px 20px 16px",
  style,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  padding?: string;
  style?: CSSProperties;
} & Record<`data-${string}`, string>) {
  return (
    <div
      className="body-card"
      style={{ padding, marginTop: 12, animationDelay: `${delay}s`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A pill chip in its on/off states — metric, range, site and date chips. */
export function chipStyle(on: boolean, shape: "pill" | "square" = "pill"): CSSProperties {
  return {
    padding: shape === "pill" ? "7px 12px" : "5px 10px",
    borderRadius: shape === "pill" ? 99 : 8,
    fontSize: shape === "pill" ? 12 : 11,
    fontWeight: 600,
    background: on ? "var(--b-rasp)" : "var(--b-chip)",
    color: on ? "#FFFFFF" : "var(--b-sub)",
    border: `1px solid ${on ? "var(--b-rasp)" : "var(--b-rule2)"}`,
    whiteSpace: "nowrap",
    cursor: "pointer",
    flex: "none",
    transition: "background .25s, color .25s",
  };
}

/** The up/down glyph on the sort chips, from the design. */
export function SortGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 1v8M1 3l2-2 2 2M7 9V1M5 7l2 2 2-2" />
    </svg>
  );
}

export function SortChip({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <div
      role="button"
      onClick={onTap}
      style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
        color: "var(--b-sub)", background: "var(--b-card2)", border: "1px solid var(--b-rule2)",
        borderRadius: 99, padding: "4px 10px", cursor: "pointer",
      }}
    >
      <SortGlyph />
      {label}
    </div>
  );
}

/** The mic glyph on the Tape button, the dock and the sheet, from the design. */
export function MicGlyph({ size, color = "#FFFFFF" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <rect x="7" y="2" width="6" height="11" rx="3" fill={color} />
      <path d="M4 9 a6 6 0 0 0 12 0 M10 15 v3" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** True once the element has scrolled into view; fires once per visit. */
export function useRevealOnce<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  // Reduced motion renders the end state from the first paint. (These cards
  // only mount after the client has fetched its data, so there is no server
  // render for this to disagree with.)
  const [seen, setSeen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (!node || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      // The design fires when the card's top passes 140px above the bottom edge.
      { rootMargin: "0px 0px -140px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, seen]);
  return [setNode, seen];
}
