import { describe, expect, it } from "vitest";
import {
  APPEARANCE_SCRIPT,
  nextAppearance,
  normalizeAppearance,
  resolveAppearance,
} from "@/lib/appearance";
import { formatDelta } from "@/lib/delta";

describe("appearance — Day · Night · System", () => {
  it("defaults anything unknown to System (the legacy 'theme' value is never read)", () => {
    expect(normalizeAppearance(undefined)).toBe("system");
    expect(normalizeAppearance("auto")).toBe("system");
    expect(normalizeAppearance("dark")).toBe("dark");
  });

  it("System follows the phone; Day and Night ignore it", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });

  it("cycles System → Day → Night → System", () => {
    expect(nextAppearance("system")).toBe("light");
    expect(nextAppearance("light")).toBe("dark");
    expect(nextAppearance("dark")).toBe("system");
  });

  it("the before-paint script reads `appearance` from the settings copy and sets the class", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      const classes = new Set<string>();
      const root = { classList: { add: (c: string) => classes.add(c) }, style: {} as Record<string, string>, dataset: {} as Record<string, string> };
      const sandbox = {
        localStorage: { getItem: () => stored },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: root },
      };
      new Function("localStorage", "window", "document", APPEARANCE_SCRIPT)(
        sandbox.localStorage,
        sandbox.window,
        sandbox.document
      );
      return { dark: classes.has("dark"), scheme: root.style.colorScheme, pref: root.dataset.appearance };
    };
    expect(run(JSON.stringify({ appearance: "dark" }), false)).toEqual({ dark: true, scheme: "dark", pref: "dark" });
    expect(run(JSON.stringify({ appearance: "light" }), true)).toEqual({ dark: false, scheme: "light", pref: "light" });
    expect(run(JSON.stringify({ theme: "dark" }), false)).toEqual({ dark: false, scheme: "light", pref: "system" });
    expect(run(null, true)).toEqual({ dark: true, scheme: "dark", pref: "system" });
    expect(run("{not json", true)).toEqual({ dark: false, scheme: undefined, pref: undefined });
  });
});

describe("formatDelta — green only when it moved the good way", () => {
  it("signs with a true minus and fixed decimals", () => {
    expect(formatDelta(-0.34, 1).text).toBe("−0.3");
    expect(formatDelta(12, 0).text).toBe("+12");
    expect(formatDelta(1234.5, 1).text).toBe("+1,234.5");
  });

  it("is neutral when it rounds to zero or is not finite", () => {
    expect(formatDelta(0.04, 1)).toEqual({ text: "0", tone: "neutral", flat: true });
    expect(formatDelta(Number.NaN).text).toBe("—");
  });

  it("colours by the good direction, never red", () => {
    expect(formatDelta(-0.3, 1, "down").tone).toBe("good");
    expect(formatDelta(0.3, 1, "down").tone).toBe("neutral");
    expect(formatDelta(2, 0, "up").tone).toBe("good");
    expect(formatDelta(2, 0, "none").tone).toBe("neutral");
  });
});
