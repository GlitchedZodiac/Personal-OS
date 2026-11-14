// Appearance — Day, Night, or follow the phone (lane C, 2026-10).
//
// The setting lives in the settings blob as `appearance` (default
// "system"). It is NOT the legacy `theme` field: that one defaulted to
// "dark" and was written back to the server by every settings save, so his
// stored row says "dark" without him ever choosing it — honouring it would
// turn the app dark on deploy. `theme` stays in the type, unread.
//
// Night is a token override (`.dark` on <html>, app/globals.css block 2).
// The class is set by APPEARANCE_SCRIPT in <head> before first paint, from
// the local copy of the settings, so there is no flash of the wrong theme;
// <AppearanceSync /> then keeps it right when the server copy arrives, when
// he changes it, and when the phone switches between light and dark.

export type Appearance = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const APPEARANCES: readonly Appearance[] = ["system", "light", "dark"] as const;
export const DEFAULT_APPEARANCE: Appearance = "system";

/** The localStorage key lib/settings.ts keeps the settings copy under. */
export const SETTINGS_STORAGE_KEY = "personal-os-settings";

/** Event fired on window whenever the preference changes in this tab. */
export const APPEARANCE_EVENT = "pitaya:appearance";

export function normalizeAppearance(value: unknown): Appearance {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_APPEARANCE;
}

export function resolveAppearance(pref: Appearance, systemDark: boolean): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemDark ? "dark" : "light";
}

/** Labels the Settings row and the kit use. */
export const APPEARANCE_LABEL: Record<Appearance, string> = {
  system: "System",
  light: "Day",
  dark: "Night",
};

export function nextAppearance(pref: Appearance): Appearance {
  const i = APPEARANCES.indexOf(pref);
  return APPEARANCES[(i + 1) % APPEARANCES.length];
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Put the resolved theme on <html>. Client only. */
export function applyAppearance(pref: Appearance): ResolvedTheme {
  const resolved = resolveAppearance(pref, systemPrefersDark());
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    root.dataset.appearance = pref;
  }
  return resolved;
}

/** Tell this tab's listeners the preference changed (Settings, sync). */
export function announceAppearance(pref: Appearance) {
  if (typeof window === "undefined") return;
  applyAppearance(pref);
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: pref }));
}

/**
 * Inline <head> script: reads the local settings copy and sets the class
 * before the first paint. Kept dependency-free and tiny; any failure leaves
 * the page light, which is the server-rendered default.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_STORAGE_KEY
)})||"{}");var a=s.appearance;if(a!=="light"&&a!=="dark")a="system";var d=a==="dark"||(a==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";r.dataset.appearance=a;}catch(e){}})();`;
