import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The token standard's accessibility promise, checked against the token file
// itself (app/globals.css): every TEXT role meets WCAG AA (4.5:1) on every
// surface it sits on, in Day and in Night. --ink-3/--ink-4 are non-text
// roles and are deliberately not in the list.

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[match[1]] = match[2];
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_ROLES = ["ink", "ink-2", "primary", "primary-deep", "success-ink", "warning-ink", "danger-ink"];
const SURFACES = ["bg", "card", "card-2"];

describe.each([
  ["Day", light],
  ["Night", dark],
])("%s — text roles meet AA (4.5:1)", (_mode, tokens) => {
  for (const role of TEXT_ROLES) {
    for (const surface of SURFACES) {
      it(`${role} on ${surface}`, () => {
        expect(tokens[role], `--${role}`).toMatch(/^#/);
        expect(tokens[surface], `--${surface}`).toMatch(/^#/);
        expect(contrast(tokens[role], tokens[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("on-primary on primary (button labels)", () => {
    expect(contrast(tokens["on-primary"], tokens.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it("tooltip ink on the tooltip", () => {
    expect(contrast(tokens["tooltip-ink"], tokens.tooltip)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ["Day", light],
  ["Night", dark],
])("%s — graphics reach 3:1 (WCAG 1.4.11)", (_mode, tokens) => {
  // chart-1/2/4 resolve through var(); compare their underlying roles.
  const series: Record<string, string> = {
    "chart-1 (primary)": tokens.primary,
    "chart-2 (dark-ink / ink-2)": _mode === "Day" ? tokens["dark-ink"] : tokens["ink-2"],
    "chart-3 (slate)": tokens.slate,
    "chart-4 (success)": tokens.success,
    "chart-5": tokens["chart-5"],
  };
  for (const [name, hex] of Object.entries(series)) {
    it(`${name} on card`, () => {
      expect(hex, name).toMatch(/^#/);
      expect(contrast(hex, tokens.card)).toBeGreaterThanOrEqual(3);
    });
  }
  for (const surface of SURFACES) {
    it(`focus ring on ${surface}`, () => {
      expect(contrast(tokens["focus-ring"], tokens[surface])).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("the large-text allowance is unused", () => {
  // AA allows 3:1 for text ≥ 18 px (or ≥ 14 px bold). The standard keeps
  // every text role at 4.5:1 regardless of size, so no role relies on it;
  // if one ever must, it is listed here with its size and tested at 3:1.
  const LARGE_ONLY: string[] = [];
  it("no text role is large-only", () => {
    expect(LARGE_ONLY).toEqual([]);
  });
});

describe("the faint roles are not text", () => {
  it("ink-3 fails AA on the Day background — which is why it is non-text only", () => {
    expect(contrast(light["ink-3"], light.bg)).toBeLessThan(4.5);
  });
});

describe("type floor", () => {
  it("no step of the scale is below 11 px, and only micro sits at 11", () => {
    const steps = [...css.matchAll(/--text-([a-z]+):\s*([0-9.]+)rem;/g)].map(([, name, rem]) => ({
      name,
      px: Number(rem) * 16,
    }));
    expect(steps.length).toBeGreaterThanOrEqual(7);
    for (const s of steps) expect(s.px, s.name).toBeGreaterThanOrEqual(11);
    expect(steps.filter((s) => s.px < 12).map((s) => s.name)).toEqual(["micro"]);
  });
});
