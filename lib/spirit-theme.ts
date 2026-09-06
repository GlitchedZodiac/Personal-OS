"use client";

import { useCallback, useEffect, useState } from "react";

// Reader theme + typography. Three designed surfaces — light, dark,
// night ("not an inversion — highlight tints are re-tuned for it").
// Preferences are per-device by design, so they live in localStorage.

export type ReaderTheme = "light" | "dark" | "night";

export interface ReaderTokens {
  bg: string;
  card: string;
  rule: string;
  ink: string;
  faint: string;
  sub: string;
  chip: string;
  shadow: string;
  /** hex-alpha suffix for highlight tint fills, tuned per surface */
  tintAlpha: string;
}

export const READER_THEMES: Record<ReaderTheme, ReaderTokens> = {
  light: {
    bg: "#F2F1F2",
    card: "#FFFFFF",
    rule: "#E4E2E6",
    ink: "#232227",
    faint: "#96949B",
    sub: "#66646C",
    chip: "#FAF9FA",
    shadow: "0 2px 12px rgba(35,34,39,0.06)",
    tintAlpha: "1F",
  },
  dark: {
    bg: "#232227",
    card: "#2A272E",
    rule: "#3A3239",
    ink: "#F2F1F2",
    faint: "#837F8B",
    sub: "#C4C0C9",
    chip: "#322F36",
    shadow: "0 2px 14px rgba(0,0,0,0.35)",
    tintAlpha: "30",
  },
  night: {
    bg: "#151217",
    card: "#1C181E",
    rule: "#2E2830",
    ink: "#E3DCE0",
    faint: "#6E6873",
    sub: "#AFA8B2",
    shadow: "0 2px 16px rgba(0,0,0,0.5)",
    chip: "#262128",
    tintAlpha: "2B",
  },
};

export const READER_SIZES = [14, 15.5, 17, 18.5, 20] as const;

export interface ReaderPrefs {
  theme: ReaderTheme;
  size: number; // 0..4 index into READER_SIZES
  serif: boolean;
  justify: boolean;
  /** V3 §4 — "Lock size against pinch": his explicit lock, alongside the automatic ink-on-screen one */
  lockSize?: boolean;
}

const DEFAULT_PREFS: ReaderPrefs = {
  theme: "light",
  size: 2,
  serif: true,
  justify: false,
  lockSize: false,
};

const KEY = "spirit-reader-prefs";

// Every hook instance shares one set of listeners, so the pane header's aA
// popover and the reader itself stay in step — before this, each instance read
// localStorage once and never heard about the other's writes.
const listeners = new Set<(p: ReaderPrefs) => void>();
// the last value loaded or broadcast — module state, so update() never reads a ref in render
let current: ReaderPrefs | null = null;

export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let loaded: ReaderPrefs | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) loaded = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
      // stay on defaults
    }
    if (loaded) {
      current = loaded;
      setPrefs(loaded);
    }
    const listen = (p: ReaderPrefs) => setPrefs(p);
    listeners.add(listen);
    return () => { listeners.delete(listen); };
  }, []);

  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    const next = { ...(current ?? DEFAULT_PREFS), ...patch };
    current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage full/blocked — the session still works
    }
    // broadcast (self included) — side effects live here, never inside a state updater
    for (const l of listeners) l(next);
  }, []);

  return {
    prefs,
    update,
    tokens: READER_THEMES[prefs.theme],
    fontSize: READER_SIZES[prefs.size] ?? 17,
    fontFamily: prefs.serif ? "var(--font-serif)" : "var(--font-body)",
  };
}
