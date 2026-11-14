"use client";

import { useEffect, useState } from "react";
import {
  APPEARANCE_EVENT,
  SETTINGS_STORAGE_KEY,
  applyAppearance,
  normalizeAppearance,
  type Appearance,
  type ResolvedTheme,
} from "@/lib/appearance";

function storedAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return normalizeAppearance(raw ? JSON.parse(raw).appearance : undefined);
  } catch {
    return "system";
  }
}

/**
 * Keeps <html class="dark"> right after the first paint (the <head> script
 * handles the first paint itself): when the phone flips between light and
 * dark while "System" is chosen, when another tab or the server sync writes
 * a new preference, and when this tab announces one.
 */
export function AppearanceSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyAppearance(storedAppearance());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener(APPEARANCE_EVENT, sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APPEARANCE_EVENT, sync);
    };
  }, []);
  return null;
}

/** The theme actually on screen, following <html class="dark">. */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
