import { describe, expect, it } from "vitest";
import {
  MAX_DAYS_PER_REQUEST,
  buildUpsertStatements,
  classifySource,
  isCalendarDay,
  isIngestAuthorized,
  parseActivityPayload,
  parseMetric,
} from "@/lib/daily-activity";

// The pure half of the Health Shortcut ingest (2026-10-17). The route's
// database behaviour is in health-daily-route.test.ts.

const TOKEN = "a".repeat(32);
// 18:00 UTC = 13:00 Chicago on 17 Oct 2026.
const NOW = new Date("2026-10-17T18:00:00Z");

function parse(body: unknown) {
  const result = parseActivityPayload(body, NOW);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
}

describe("isIngestAuthorized", () => {
  it("accepts the exact bearer token", () => {
    expect(isIngestAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isIngestAuthorized(`bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("refuses a missing, wrong or malformed header", () => {
    expect(isIngestAuthorized(null, TOKEN)).toBe(false);
    expect(isIngestAuthorized("", TOKEN)).toBe(false);
    expect(isIngestAuthorized(TOKEN, TOKEN)).toBe(false); // no "Bearer"
    expect(isIngestAuthorized(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(isIngestAuthorized(`Bearer ${TOKEN.slice(1)}`, TOKEN)).toBe(false);
    expect(isIngestAuthorized(`Basic ${TOKEN}`, TOKEN)).toBe(false);
  });

  it("fails closed when the env var is unset or a placeholder", () => {
    expect(isIngestAuthorized(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(isIngestAuthorized("Bearer ", "")).toBe(false);
    expect(isIngestAuthorized("Bearer 1234", "1234")).toBe(false); // too short to be a secret
  });
});

describe("parseMetric", () => {
  it("takes numbers and numeric text, including a decimal comma", () => {
    expect(parseMetric(8123, "steps", 1e6)).toEqual({ ok: true, value: 8123 });
    expect(parseMetric("8123", "steps", 1e6)).toEqual({ ok: true, value: 8123 });
    expect(parseMetric(" 6.42 ", "km", 500)).toEqual({ ok: true, value: 6.42 });
    expect(parseMetric("6,42", "km", 500)).toEqual({ ok: true, value: 6.42 });
  });

  it("treats empty as missing, not zero (an empty Health query)", () => {
    expect(parseMetric("", "steps", 1e6)).toEqual({ ok: true, value: null });
    expect(parseMetric(null, "steps", 1e6)).toEqual({ ok: true, value: null });
    expect(parseMetric(undefined, "steps", 1e6)).toEqual({ ok: true, value: null });
  });

  it("refuses what it would have to guess at", () => {
    expect(parseMetric("12.345,6", "kcal", 1e6).ok).toBe(false);
    expect(parseMetric("1,234,567", "steps", 1e7).ok).toBe(false);
    expect(parseMetric("lots", "steps", 1e6).ok).toBe(false);
    expect(parseMetric(true, "steps", 1e6).ok).toBe(false);
    expect(parseMetric(NaN, "steps", 1e6).ok).toBe(false);
    expect(parseMetric(-5, "steps", 1e6).ok).toBe(false);
    expect(parseMetric(250_001, "steps", 200_000).ok).toBe(false);
  });
});

describe("isCalendarDay", () => {
  it("wants a real YYYY-MM-DD day", () => {
    expect(isCalendarDay("2026-10-16")).toBe(true);
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("10/16/2026")).toBe(false);
    expect(isCalendarDay("2026-10-16T00:00:00Z")).toBe(false);
    expect(isCalendarDay(20261016)).toBe(false);
  });
});

describe("classifySource", () => {
  it("takes the three words directly", () => {
    expect(classifySource("phone")).toBe("phone");
    expect(classifySource("Watch")).toBe("watch");
    expect(classifySource("mixed")).toBe("mixed");
  });

  it("works it out from Health's device names", () => {
    expect(classifySource("Michael’s iPhone")).toBe("phone");
    expect(classifySource("Michael's Apple Watch")).toBe("watch");
    expect(classifySource("Michael's Apple Watch, Michael's iPhone")).toBe("mixed");
    expect(classifySource(["Michael's iPhone", "Strava", "Michael's Apple Watch"])).toBe("mixed");
  });

  it("returns null when nothing is recognisable", () => {
    expect(classifySource("Strava")).toBeNull();
    expect(classifySource("")).toBeNull();
    expect(classifySource(undefined)).toBeNull();
    expect(classifySource(42)).toBeNull();
  });
});

describe("parseActivityPayload", () => {
  const day = {
    date: "2026-10-16",
    steps: 8123,
    active_energy_kcal: 512.44,
    resting_energy_kcal: "1890",
    walking_running_distance_km: "6,4237",
    source: "mixed",
  };

  it("normalises a day the way the Shortcut sends it", () => {
    const { days, empty, rejected } = parse([day]);
    expect(rejected).toEqual([]);
    expect(empty).toEqual([]);
    expect(days).toEqual([
      {
        date: "2026-10-16",
        steps: 8123,
        activeEnergyKcal: 512.4,
        restingEnergyKcal: 1890,
        walkingRunningDistanceKm: 6.424,
        source: "mixed",
        fields: ["steps", "activeEnergyKcal", "restingEnergyKcal", "walkingRunningDistanceKm", "source"],
      },
    ]);
  });

  it("accepts {days: [...]} and a single bare day", () => {
    expect(parse({ days: [day] }).days).toHaveLength(1);
    expect(parse(day).days).toHaveLength(1);
  });

  it("ignores unknown fields", () => {
    const { days, rejected } = parse([{ ...day, heartRate: 70, note: "hi", nested: { a: 1 } }]);
    expect(rejected).toEqual([]);
    expect(Object.keys(days[0]).sort()).toEqual(
      ["activeEnergyKcal", "date", "fields", "restingEnergyKcal", "source", "steps", "walkingRunningDistanceKm"]
    );
  });

  it("converts miles and metres to km", () => {
    const { days } = parse([
      { date: "2026-10-14", steps: 100, walking_running_distance_mi: "1" },
      { date: "2026-10-15", steps: 100, walking_running_distance_m: 4357 },
    ]);
    expect(days[0].walkingRunningDistanceKm).toBe(1.609);
    expect(days[1].walkingRunningDistanceKm).toBe(4.357);
  });

  it("rounds steps to whole steps (Shortcuts sends 8123.0)", () => {
    expect(parse([{ date: "2026-10-16", steps: "8123.4" }]).days[0].steps).toBe(8123);
  });

  it("keeps the last copy of a date sent twice", () => {
    const { days } = parse([
      { date: "2026-10-16", steps: 100 },
      { date: "2026-10-15", steps: 50 },
      { date: "2026-10-16", steps: 300 },
    ]);
    expect(days.map((d) => [d.date, d.steps])).toEqual([
      ["2026-10-15", 50],
      ["2026-10-16", 300],
    ]);
  });

  it("skips empty days — the locked-phone run never overwrites real data", () => {
    const { days, empty } = parse([
      { date: "2026-10-15", steps: "", active_energy_kcal: "", resting_energy_kcal: "", walking_running_distance_km: "" },
      { date: "2026-10-16", steps: 0, active_energy_kcal: 0, resting_energy_kcal: 0, walking_running_distance_km: 0 },
      { date: "2026-10-14", steps: 0, resting_energy_kcal: 1750 },
    ]);
    expect(empty).toEqual(["2026-10-15", "2026-10-16"]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-14"]); // some data is still data
  });

  it("rejects a bad day on its own and keeps the good ones", () => {
    const { days, rejected } = parse([
      day,
      { date: "2026-02-30", steps: 10 },
      { date: "2026-10-12", steps: "lots" },
      { date: "2026-10-13", steps: -1 },
      "not a day",
      { steps: 10 },
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-16"]);
    expect(rejected.map((r) => r.index)).toEqual([1, 2, 3, 4, 5]);
    expect(rejected[0].errors[0]).toMatch(/YYYY-MM-DD/);
    expect(rejected[1].errors[0]).toMatch(/steps is not a number/);
    expect(rejected[2].errors[0]).toMatch(/negative/);
    expect(rejected[3]).toEqual({ index: 4, date: null, errors: ["not an object"] });
  });

  it("refuses days in the future but allows a phone already on tomorrow", () => {
    const { days, rejected } = parse([
      { date: "2026-10-18", steps: 10 }, // Chicago is on the 17th; a phone east of it may be on the 18th
      { date: "2026-10-19", steps: 10 },
      { date: "2014-08-31", steps: 10 },
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-18"]);
    expect(rejected.map((r) => r.date)).toEqual(["2026-10-19", "2014-08-31"]);
  });

  it("refuses bodies that are not a list of days", () => {
    for (const body of [null, 42, "hi", {}, { days: "x" }, []]) {
      expect(parseActivityPayload(body, NOW).ok).toBe(false);
    }
  });

  it("records which fields a day carried — absent is not the same as empty", () => {
    const { days } = parse([
      { date: "2026-10-14", steps: "5000" },
      { date: "2026-10-15", walking_running_distance_mi: "2", sources: "Michael's iPhone" },
      { date: "2026-10-16", steps: "5000", resting_energy_kcal: "" },
    ]);
    expect(days.map((d) => d.fields)).toEqual([
      ["steps"],
      ["walkingRunningDistanceKm", "source"],
      ["steps", "restingEnergyKcal"],
    ]);
  });

  it("takes a six-month backfill but not an unbounded one", () => {
    const backfill = Array.from({ length: 185 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 17 - i));
      return { date: d.toISOString().slice(0, 10), steps: 1000 + i };
    });
    expect(parse(backfill).days).toHaveLength(185);
    const decade = Array.from({ length: 3650 }, (_, i) => ({
      date: new Date(Date.UTC(2016, 9, 18 + i)).toISOString().slice(0, 10),
      steps: "1",
    }));
    expect(parse(decade).days).toHaveLength(3650);
    const tooMany = Array.from({ length: MAX_DAYS_PER_REQUEST + 1 }, () => day);
    expect(parseActivityPayload(tooMany, NOW).ok).toBe(false);
  });
});

describe("buildUpsertStatements", () => {
  const at = new Date("2026-10-17T22:05:00Z");

  it("writes one statement per set of fields, never a column that was not sent", () => {
    const { days } = parse([
      { date: "2026-10-14", steps: "5000" },
      { date: "2026-10-15", steps: "6000" },
      { date: "2026-10-16", steps: "7000", active_energy_kcal: "300" },
    ]);
    const stmts = buildUpsertStatements(days, at);
    expect(stmts).toHaveLength(2);

    const [stepsOnly, both] = stmts;
    expect(stepsOnly.dates).toEqual(["2026-10-14", "2026-10-15"]);
    expect(stepsOnly.sql).toContain('("id", "date", "steps", "received_at")');
    expect(stepsOnly.sql).toContain('ON CONFLICT ("date") DO UPDATE SET "steps" = EXCLUDED."steps", "received_at"');
    expect(stepsOnly.sql).not.toContain("active_energy_kcal");
    expect(stepsOnly.params).toEqual([["2026-10-14", "2026-10-15"], [5000, 6000], "2026-10-17T22:05:00.000Z"]);

    expect(both.sql).toContain('"steps", "active_energy_kcal", "received_at"');
    expect(both.params).toEqual([["2026-10-16"], [7000], [300], "2026-10-17T22:05:00.000Z"]);
  });

  it("types every array and stores received_at as UTC", () => {
    const { days } = parse([
      {
        date: "2026-10-16",
        steps: 8123,
        active_energy_kcal: 512,
        resting_energy_kcal: 1890,
        walking_running_distance_km: 6.4,
        source: "mixed",
      },
    ]);
    const [stmt] = buildUpsertStatements(days, at);
    expect(stmt.sql).toContain(
      "unnest($1::text[], $2::int4[], $3::float8[], $4::float8[], $5::float8[], $6::text[])"
    );
    expect(stmt.sql).toContain("($7::timestamptz AT TIME ZONE 'UTC')");
    expect(stmt.params).toHaveLength(7);
  });
});
