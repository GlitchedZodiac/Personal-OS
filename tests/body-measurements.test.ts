import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPOSITION_FIELDS,
  MEASURED_FIELDS,
  TAPE_FIELDS,
  buildFillPatch,
  buildTapeTrend,
  compactMeasurement,
  findNearTwin,
  normalizeBodySample,
  describeMeasurement,
  hasAnyMeasurementWhere,
  hasTapeWhere,
} from "@/lib/body-measurements";

// Regression pins for the 2026-08-26 report: "our AI can't read my
// measurements even though I have them in there."
//
// Two independent causes, both pinned below:
//   1. lib/chat-tools.ts filtered `weightKg: { not: null }`, hiding every
//      tape-only check-in.
//   2. the projection returned 3 of 23 columns.

function orFields(where: { OR?: Record<string, unknown>[] }): string[] {
  return (where.OR ?? []).flatMap((clause) => Object.keys(clause));
}

describe("hasAnyMeasurementWhere", () => {
  it("matches a row that has tape but no weight — the reported bug", () => {
    const fields = orFields(hasAnyMeasurementWhere());
    // If these two ever drop out, tape-only check-ins go invisible again.
    expect(fields).toContain("chestCm");
    expect(fields).toContain("armsCm");
    expect(fields).toContain("waistCm");
  });

  it("covers every measured column, not a subset", () => {
    const fields = orFields(hasAnyMeasurementWhere());
    for (const field of MEASURED_FIELDS) {
      expect(fields).toContain(field);
    }
    expect(fields).toHaveLength(MEASURED_FIELDS.length);
  });

  it("uses `not: null` rather than a truthy test", () => {
    for (const clause of hasAnyMeasurementWhere().OR ?? []) {
      for (const value of Object.values(clause)) {
        expect(value).toEqual({ not: null });
      }
    }
  });
});

describe("hasTapeWhere", () => {
  it("covers all NINE tape dims, including shoulders and forearms", () => {
    const fields = orFields(hasTapeWhere());
    // app/api/health/body/overview/route.ts listed only 7 — a shoulders-only
    // check-in was invisible on his own Body screen.
    expect(fields).toContain("shouldersCm");
    expect(fields).toContain("forearmsCm");
    expect(fields).toHaveLength(9);
    expect(TAPE_FIELDS).toHaveLength(9);
  });

  it("does not match a weight-only row", () => {
    const fields = orFields(hasTapeWhere());
    expect(fields).not.toContain("weightKg");
    expect(fields).not.toContain("bodyFatPct");
  });
});

describe("compactMeasurement", () => {
  it("keeps tape when weight is absent", () => {
    const out = compactMeasurement({
      id: "m1",
      measuredAt: "2026-08-20",
      weightKg: null,
      chestCm: 104,
      armsCm: 38.5,
      waistCm: null,
    });
    expect(out).toEqual({
      id: "m1",
      measuredAt: "2026-08-20",
      chestCm: 104,
      armsCm: 38.5,
    });
    expect(out).not.toHaveProperty("weightKg");
    expect(out).not.toHaveProperty("waistCm");
  });

  it("preserves a genuine zero — the falsy trap", () => {
    // `if (m.bodyFatPct)` would erase both of these.
    const out = compactMeasurement({
      id: "m2",
      visceralFat: 0,
      bodyFatPct: 0,
      weightKg: 82.4,
    });
    expect(out.visceralFat).toBe(0);
    expect(out.bodyFatPct).toBe(0);
    expect(out.weightKg).toBe(82.4);
  });

  it("surfaces smart-scale columns the write path cannot produce", () => {
    const out = compactMeasurement({
      id: "m3",
      weightKg: 81.2,
      muscleMassKg: 36.1,
      boneMassKg: 3.2,
      bmrKcal: 1810,
      metabolicAge: 31,
      source: "vesync",
    });
    for (const field of ["muscleMassKg", "boneMassKg", "bmrKcal", "metabolicAge"]) {
      expect(out).toHaveProperty(field);
    }
    expect(out.source).toBe("vesync");
  });

  it("drops empty notes but keeps real ones", () => {
    expect(compactMeasurement({ id: "a", notes: "" })).not.toHaveProperty("notes");
    expect(compactMeasurement({ id: "b", notes: "fasted" }).notes).toBe("fasted");
  });

  it("emits only what was recorded — a 23-column row with 2 values gives 2", () => {
    const out = compactMeasurement({ id: "m4", weightKg: 80, hipsCm: 96 });
    expect(Object.keys(out).sort()).toEqual(["hipsCm", "id", "weightKg"]);
  });
});

describe("describeMeasurement", () => {
  it("names tape dims and units a tape-only row", () => {
    const line = describeMeasurement({ chestCm: 104, waistCm: 86 });
    expect(line).toBe("chest 104cm, waist 86cm");
  });

  it("returns an empty string for a row with no readings", () => {
    expect(describeMeasurement({ id: "x", notes: "nothing measured" })).toBe("");
  });

  it("includes a zero reading", () => {
    expect(describeMeasurement({ visceralFat: 0 })).toContain("0");
  });
});

describe("buildTapeTrend", () => {
  it("walks each dimension independently", () => {
    // He does not tape every dim on every check-in: chest's previous value is
    // two check-ins back while waist's is the last one.
    const rows = [
      { measuredAt: "2026-08-20", waistCm: 86, chestCm: 104 },
      { measuredAt: "2026-08-13", waistCm: 87 },
      { measuredAt: "2026-08-06", chestCm: 102 },
    ];
    const trend = buildTapeTrend(rows);
    const waist = trend.find((t) => t.field === "waistCm");
    const chest = trend.find((t) => t.field === "chestCm");

    expect(waist).toMatchObject({ latest: 86, previous: 87, deltaCm: -1 });
    expect(chest).toMatchObject({
      latest: 104,
      previous: 102,
      previousAt: "2026-08-06",
      deltaCm: 2,
    });
  });

  it("reports a dim measured only once with a null delta", () => {
    const trend = buildTapeTrend([{ measuredAt: "2026-08-20", neckCm: 39 }]);
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({ latest: 39, previous: null, deltaCm: null });
  });

  it("omits dims that were never measured", () => {
    const trend = buildTapeTrend([{ measuredAt: "2026-08-20", weightKg: 82 }]);
    expect(trend).toHaveLength(0);
  });
});

describe("schema parity", () => {
  // Adding a numeric column to BodyMeasurement without adding it here would
  // silently hide it from the AI again. Fail at CI instead.
  it("MEASURED_FIELDS covers every nullable numeric column in the schema", () => {
    const schemaPath = fileURLToPath(
      new URL("../prisma/schema.prisma", import.meta.url)
    );
    const schema = readFileSync(schemaPath, "utf8");
    const block = schema.match(/model BodyMeasurement \{([\s\S]*?)\n\}/);
    expect(block).not.toBeNull();

    const numericColumns: string[] = [];
    for (const line of block![1].split("\n")) {
      const match = line.trim().match(/^(\w+)\s+(Float|Int)\?/);
      if (match) numericColumns.push(match[1]);
    }

    expect(numericColumns.length).toBeGreaterThan(20);
    for (const column of numericColumns) {
      expect(MEASURED_FIELDS).toContain(column);
    }
    expect(MEASURED_FIELDS).toHaveLength(numericColumns.length);
    expect(TAPE_FIELDS.length + COMPOSITION_FIELDS.length + 2).toBe(
      numericColumns.length
    );
  });
});

// ————————————————————————————————————————————————————————————————————
// Apple Health ingest. The daily route had no test at all before this.
// ————————————————————————————————————————————————————————————————————

const NEAR_MS = 10 * 60_000;
const NEAR_KG = 0.3;

describe("normalizeBodySample", () => {
  it("rejects an unparseable timestamp instead of stamping now", () => {
    // The old route fell back to `new Date()`. Harmless at one sample a day;
    // during a historical backfill it would fabricate hundreds of rows dated
    // today. This is the single most damaging bug in that loop.
    expect(normalizeBodySample({ measuredAt: "not-a-date", weightKg: 82 })).toBeNull();
    expect(normalizeBodySample({ weightKg: 82 })).toBeNull();
    expect(normalizeBodySample({ measuredAt: null, weightKg: 82 })).toBeNull();
  });

  it("rejects a sample with no usable weight", () => {
    const at = "2026-08-20T12:00:00.000Z";
    expect(normalizeBodySample({ measuredAt: at })).toBeNull();
    expect(normalizeBodySample({ measuredAt: at, weightKg: 0 })).toBeNull();
    expect(normalizeBodySample({ measuredAt: at, weightKg: -5 })).toBeNull();
    expect(normalizeBodySample({ measuredAt: at, weightKg: "abc" })).toBeNull();
  });

  it("carries composition through and rounds the integer columns", () => {
    const out = normalizeBodySample({
      measuredAt: "2026-08-20T12:00:00.000Z",
      weightKg: 82.4,
      bodyFatPct: 18.2,
      bmi: 24.1,
      fatFreeWeightKg: 67.4,
      visceralFat: 7.6,
      heartRateBpm: 61.4,
      waistCm: 86,
    })!;
    expect(out.weightKg).toBe(82.4);
    expect(out.fields.bodyFatPct).toBe(18.2);
    expect(out.fields.bmi).toBe(24.1);
    expect(out.fields.visceralFat).toBe(8);
    expect(out.fields.heartRateBpm).toBe(61);
    expect(out.fields.waistCm).toBe(86);
  });

  it("accepts a Date as well as an ISO string", () => {
    const out = normalizeBodySample({
      measuredAt: new Date("2026-08-20T12:00:00.000Z"),
      weightKg: 80,
    });
    expect(out?.measuredAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });
});

describe("findNearTwin", () => {
  const stored = [
    {
      id: "existing",
      measuredAt: new Date("2026-08-20T12:00:00.000Z"),
      weightKg: 82.4,
      fields: { bodyFatPct: null, bmi: 24.1 } as Record<string, number | null>,
    },
  ];
  const sampleAt = (iso: string, kg: number) =>
    normalizeBodySample({ measuredAt: iso, weightKg: kg })!;

  it("matches the same weigh-in reported twice", () => {
    const twin = findNearTwin(
      stored, sampleAt("2026-08-20T12:03:00.000Z", 82.5), NEAR_MS, NEAR_KG
    );
    expect(twin?.id).toBe("existing");
  });

  it("does not match outside the time window", () => {
    expect(
      findNearTwin(stored, sampleAt("2026-08-20T12:30:00.000Z", 82.4), NEAR_MS, NEAR_KG)
    ).toBeNull();
  });

  it("does not match a genuinely different weight in the window", () => {
    expect(
      findNearTwin(stored, sampleAt("2026-08-20T12:03:00.000Z", 84.0), NEAR_MS, NEAR_KG)
    ).toBeNull();
  });
});

describe("buildFillPatch", () => {
  const twin = {
    id: "t",
    measuredAt: new Date("2026-08-20T12:00:00.000Z"),
    weightKg: 82.4,
    fields: { bodyFatPct: null, bmi: 24.1, waistCm: 86 } as Record<string, number | null>,
  };

  it("fills a blank but never overwrites a stored value", () => {
    // A number he typed himself must always beat one the scale inferred.
    const sample = normalizeBodySample({
      measuredAt: "2026-08-20T12:01:00.000Z",
      weightKg: 82.4,
      bodyFatPct: 18.2,
      bmi: 99,
      waistCm: 99,
    })!;
    expect(buildFillPatch(twin, sample)).toEqual({ bodyFatPct: 18.2 });
  });

  it("returns nothing when the twin already has everything — a pure duplicate", () => {
    const sample = normalizeBodySample({
      measuredAt: "2026-08-20T12:01:00.000Z",
      weightKg: 82.4,
      bmi: 24.1,
    })!;
    expect(buildFillPatch(twin, sample)).toEqual({});
  });
});

describe("implausible tape deltas", () => {
  it("flags a convention change instead of reporting it as body change", () => {
    // Real data, 2026-08-26: shoulders 118.5 cm (circumference) then 50.9 cm
    // (width). A -67.6 cm "change" is a different tape, not a smaller man.
    const trend = buildTapeTrend([
      { measuredAt: "2026-08-20", shouldersCm: 50.9 },
      { measuredAt: "2026-07-01", shouldersCm: 118.5 },
    ]);
    expect(trend[0].deltaCm).toBe(-67.6);
    expect(trend[0].suspectMethodChange).toBe(true);
  });

  it("leaves a believable change unflagged", () => {
    const trend = buildTapeTrend([
      { measuredAt: "2026-08-20", waistCm: 87.4 },
      { measuredAt: "2026-07-01", waistCm: 89.8 },
    ]);
    expect(trend[0].deltaCm).toBe(-2.4);
    expect(trend[0].suspectMethodChange).toBeUndefined();
  });
});
