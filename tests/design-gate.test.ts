import { describe, expect, it } from "vitest";
import { compact, compareToBaseline, familyTotals } from "../scripts/design-gate.mjs";
import { familyOf, scanSource } from "../scripts/design-metrics.mjs";

// The design gate is a ratchet over FAMILIES: debt may move between files of
// one family (renames, splits, extracted components) but no family's total
// may rise, and a family the baseline does not know must be clean.
// (scripts/design-gate.mjs, scripts/design-metrics.mjs)

const m = (over: Partial<Record<string, number>> = {}) => ({
  hex: 0,
  palette: 0,
  arbText: 0,
  inlineStyle: 0,
  rawButton: 0,
  rawField: 0,
  lucide: 0,
  motion: 0,
  ...over,
});

describe("scanSource — what counts as design debt", () => {
  it("counts raw hex, arbitrary text sizes and inline colour styles", () => {
    const src = `<div className="text-[12.5px] text-[#8C2F51]" style={{ color: "#fff" }} />`;
    const r = scanSource(src);
    expect(r.hex).toBe(2);
    expect(r.arbText).toBe(1);
    expect(r.inlineStyle).toBe(1);
  });

  it("counts Tailwind palette colour classes — the old identity", () => {
    const r = scanSource(`"text-red-500 bg-teal-50 border-blue-500/20 border-t-amber-300 text-ink-2 bg-card"`);
    expect(r.palette).toBe(4);
  });

  it("ignores hex values that only appear in comments", () => {
    const src = `// was #A63D63 before the tokens\n/* and #fff here */\nconst a = 1;`;
    expect(scanSource(src).hex).toBe(0);
  });

  it("exempts the token file from hex and palette, not from motion", () => {
    const css = `:root { --primary: #a63d63; } .x { transition: opacity 0.3s ease; }`;
    const r = scanSource(css, { isTokenFile: true });
    expect(r.hex).toBe(0);
    expect(r.motion).toBe(1);
  });

  it("counts raw controls outside the kit, but not inside it", () => {
    const src = `<button onClick={go}>Go</button><input /><select></select><textarea />`;
    expect(scanSource(src).rawButton).toBe(1);
    expect(scanSource(src).rawField).toBe(3);
    const kit = scanSource(src, { isKit: true });
    expect(kit.rawButton).toBe(0);
    expect(kit.rawField).toBe(0);
  });

  it("counts every name imported from lucide-react", () => {
    expect(scanSource(`import { Check, Loader2, X } from "lucide-react";`).lucide).toBe(3);
  });

  it("allows only the standard durations (90 · 150 · 220 ms)", () => {
    expect(scanSource(`"duration-150 duration-220 duration-90"`).motion).toBe(0);
    expect(scanSource(`"duration-300 transition-all duration-75 duration-[400ms]"`).motion).toBe(4);
  });

  it("counts literal timings in inline styles, <style> blocks and CSS", () => {
    expect(scanSource(`<div style={{ transition: "opacity .25s ease, transform 150ms" }} />`).motion).toBe(1);
    expect(scanSource(`.a { animation: deskPageIn .38s ease backwards; transition-duration: 0.15s; }`).motion).toBe(1);
    expect(scanSource(`.b { transition: transform var(--motion-fast) var(--ease-out); }`).motion).toBe(0);
  });

  it("does not count a style object that only sets geometry", () => {
    expect(scanSource(`<div style={{ height: 120, left: "40%" }} />`).inlineStyle).toBe(0);
  });
});

describe("familyOf", () => {
  it("groups tab sections, component folders, the desk, api and lib", () => {
    expect(familyOf("app/(tabs)/health/workouts/page.tsx")).toBe("app/(tabs)/health");
    expect(familyOf("app/(tabs)/settings/design/page.tsx")).toBe("app/(tabs)/settings");
    expect(familyOf("app/(desk)/spirit/hymns/page.tsx")).toBe("app/(desk)");
    expect(familyOf("app/api/health/train/route.ts")).toBe("app/api");
    expect(familyOf("app/globals.css")).toBe("app");
    expect(familyOf("components/spirit/desk/ui.tsx")).toBe("components/spirit");
    expect(familyOf("components/activity-detail.tsx")).toBe("components");
    expect(familyOf("lib/spirit-theme.ts")).toBe("lib");
  });
});

describe("compareToBaseline — the ratchet", () => {
  const baseline = { "app/(tabs)/health/a/page.tsx": { hex: 5, arbText: 2 } };

  it("fails when a family's total rises", () => {
    const { failures } = compareToBaseline({ "app/(tabs)/health/a/page.tsx": m({ hex: 6, arbText: 2 }) }, baseline);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ family: "app/(tabs)/health", metric: "hex", was: 5, now: 6, isNewFamily: false });
  });

  it("passes when counts fall, and reports the fall", () => {
    const { failures, improvements } = compareToBaseline({ "app/(tabs)/health/a/page.tsx": m({ hex: 3, arbText: 2 }) }, baseline);
    expect(failures).toHaveLength(0);
    expect(improvements).toHaveLength(1);
    expect(improvements[0]).toMatchObject({ metric: "hex", was: 5, now: 3 });
  });

  it("lets debt move between files of one family (a split or a rename)", () => {
    const current = {
      "app/(tabs)/health/a/page.tsx": m({ hex: 2, arbText: 2 }),
      "app/(tabs)/health/a/records/page.tsx": m({ hex: 3 }),
    };
    expect(compareToBaseline(current, baseline).failures).toHaveLength(0);
  });

  it("fails a file in the same family that adds debt beyond what moved", () => {
    const current = {
      "app/(tabs)/health/a/page.tsx": m({ hex: 5, arbText: 2 }),
      "app/(tabs)/health/b/page.tsx": m({ rawButton: 1 }),
    };
    const { failures } = compareToBaseline(current, baseline);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ metric: "rawButton", was: 0, now: 1 });
    expect(failures[0].files).toEqual([{ file: "app/(tabs)/health/b/page.tsx", was: 0, now: 1 }]);
  });

  it("fails a new family that carries any debt", () => {
    const current = { "app/(tabs)/health/a/page.tsx": m({ hex: 5, arbText: 2 }), "components/train/x.tsx": m({ hex: 1 }) };
    const { failures } = compareToBaseline(current, baseline);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ family: "components/train", isNewFamily: true });
  });

  it("passes a new family that is clean", () => {
    const current = { "app/(tabs)/health/a/page.tsx": m({ hex: 5, arbText: 2 }), "components/train/x.tsx": m() };
    expect(compareToBaseline(current, baseline).failures).toHaveLength(0);
  });

  it("treats a deleted file as an improvement, not a failure", () => {
    const { failures, improvements } = compareToBaseline({}, baseline);
    expect(failures).toHaveLength(0);
    expect(improvements.map((i) => i.metric).sort()).toEqual(["arbText", "hex"]);
  });
});

describe("familyTotals and compact", () => {
  it("sums per family", () => {
    const t = familyTotals({ "lib/a.ts": { hex: 2 }, "lib/b.ts": { hex: 3, motion: 1 } }) as Record<string, Record<string, number>>;
    expect(t.lib.hex).toBe(5);
    expect(t.lib.motion).toBe(1);
  });

  it("stores only non-zero counts and skips clean files", () => {
    expect(compact({ "a.tsx": m({ hex: 2 }), "b.tsx": m() })).toEqual({ "a.tsx": { hex: 2 } });
  });
});
