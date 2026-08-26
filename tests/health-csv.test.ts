import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HEALTH_CSV_KEYS,
  MEASUREMENT_CSV_HEADERS,
  buildHealthCsv,
  healthCsvFilename,
  isHealthCsvDatasetKey,
} from "@/lib/health-csv";
import type { HealthExportPayload } from "@/lib/health-export";

// Pure-lib convention, matching tests/vesync.test.ts — a hand-built payload,
// no database. The CSV layer is a projection over buildHealthExport's return
// value, so a fixture is a complete test of it.

const TZ = "America/Bogota";

function fixture(): HealthExportPayload {
  return {
    requestedRange: { mode: "all", from: "2026-08-18", to: "2026-08-20", timeZone: TZ },
    dailyRollups: [
      {
        date: "2026-08-18",
        nutrition: { mealCount: 2, calories: 1800, proteinG: 140, carbsG: 150, fatG: 60 },
        workouts: { count: 1, durationMinutes: 45, caloriesBurned: 400, distanceMeters: 0, loggedSteps: 0 },
        hydration: { manualWaterMl: 1500, totalWaterMl: 1500 },
        body: { measurementCount: 1, latestWeightKg: 82.4, latestBodyFatPct: null, latestWaistCm: null },
        activity: { steps: 8000, restingHeartRateBpm: 54, activeEnergyKcal: 500, walkingRunningDistanceMeters: 5000 },
      },
      // NOTE: 2026-08-19 is deliberately absent — the gap the filler must close.
      {
        date: "2026-08-20",
        nutrition: { mealCount: 3, calories: 2100, proteinG: 160, carbsG: 180, fatG: 70 },
        workouts: { count: 0, durationMinutes: 0, caloriesBurned: 0, distanceMeters: 0, loggedSteps: 0 },
        hydration: { manualWaterMl: 2000, totalWaterMl: 2000 },
        body: { measurementCount: 1, latestWeightKg: null, latestBodyFatPct: null, latestWaistCm: 86 },
        activity: { steps: 10000, restingHeartRateBpm: 53, activeEnergyKcal: 600, walkingRunningDistanceMeters: 7000 },
      },
    ],
    rawData: {
      bodyMeasurements: [
        {
          // TAPE-ONLY: exactly the check-in shape the AI used to lose.
          id: "tape-1",
          measuredAt: "2026-08-20T13:30:00.000Z",
          weightKg: null, bodyFatPct: null,
          waistCm: 86, chestCm: 104, armsCm: 38.5, shouldersCm: 121,
          legsCm: null, hipsCm: null, neckCm: null, forearmsCm: null, calvesCm: null,
          bmi: null, fatFreeWeightKg: null, subcutaneousFatPct: null,
          visceralFat: null, bodyWaterPct: null, skeletalMusclePct: null,
          muscleMassKg: null, boneMassKg: null, proteinPct: null,
          bmrKcal: null, metabolicAge: null, heartRateBpm: null,
          skinfoldData: { chest: 8, abdomen: 14, thigh: 10, unexpectedKey: 99 },
          notes: 'Waist "tight", 2 cm down\nmorning fasted',
          source: null,
          createdAt: "2026-08-20T13:31:00.000Z",
          updatedAt: "2026-08-20T13:31:00.000Z",
        },
        {
          // SCALE-ONLY, with a genuine zero.
          id: "scale-1",
          measuredAt: "2026-08-18T11:00:00.000Z",
          weightKg: 82.4, bodyFatPct: 18.2,
          waistCm: null, chestCm: null, armsCm: null, shouldersCm: null,
          legsCm: null, hipsCm: null, neckCm: null, forearmsCm: null, calvesCm: null,
          bmi: 24.1, fatFreeWeightKg: 67.4, subcutaneousFatPct: 15.1,
          visceralFat: 0, bodyWaterPct: 55.2, skeletalMusclePct: 51.3,
          muscleMassKg: 63.9, boneMassKg: 3.4, proteinPct: 18.1,
          bmrKcal: 1810, metabolicAge: 31, heartRateBpm: 62,
          skinfoldData: null, notes: null, source: "vesync",
          createdAt: "2026-08-18T11:01:00.000Z",
          updatedAt: "2026-08-18T11:01:00.000Z",
        },
      ],
      foodLogs: [
        {
          id: "f1", loggedAt: "2026-08-20T13:00:00.000Z", mealType: "lunch",
          foodDescription: "Bandeja paisa, media porción", calories: 900,
          proteinG: 45, carbsG: 80, fatG: 40, source: "chat", notes: null,
        },
      ],
      workoutLogs: [
        {
          id: "w1", startedAt: "2026-08-18T12:00:00.000Z", endedAt: "2026-08-18T12:45:00.000Z",
          durationMinutes: 45, workoutType: "strength", description: "KB EMOM",
          caloriesBurned: 400, distanceMeters: null, stepCount: null,
          avgHeartRateBpm: 132, maxHeartRateBpm: 168, elevationGainM: null,
          exercises: [{ name: "swing" }, { name: "clean" }],
          deviceType: "watch", externalSource: null, syncStatus: "synced",
          stravaActivityId: null, source: "watch",
        },
      ],
      waterLogs: [
        { id: "wa1", loggedAt: "2026-08-20T14:00:00.000Z", amountMl: 500 },
      ],
    },
  } as unknown as HealthExportPayload;
}

function parseHeader(csv: string) {
  return csv.replace(/^﻿/, "").split("\r\n")[0].split(",");
}

/** Split a CSV into records, respecting quoted fields containing newlines. */
function records(csv: string): string[][] {
  const text = csv.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell); cell = ""; rows.push(row); row = []; i++;
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe("measurements.csv", () => {
  const { csv, rowCount } = buildHealthCsv(fixture(), "measurements");
  const rows = records(csv);
  const header = rows[0];
  const byId = (id: string) => rows.find((r) => r[0] === id)!;

  it("emits one row per check-in", () => {
    expect(rowCount).toBe(2);
    expect(rows).toHaveLength(3); // header + 2
  });

  it("has one cell per header on every row", () => {
    for (const row of rows) expect(row).toHaveLength(header.length);
  });

  it("carries all 23 measured columns", () => {
    for (const column of [
      "weightKg", "bodyFatPct", "chestCm", "armsCm", "shouldersCm",
      "forearmsCm", "muscleMassKg", "boneMassKg", "bmrKcal", "metabolicAge",
      "visceralFat", "bodyWaterPct",
    ]) {
      expect(header).toContain(column);
    }
  });

  it("keeps a tape-only row's values and leaves weight EMPTY, not 0", () => {
    const row = byId("tape-1");
    const at = (name: string) => row[header.indexOf(name)];
    expect(at("chestCm")).toBe("104");
    expect(at("waistCm")).toBe("86");
    expect(at("shouldersCm")).toBe("121");
    expect(at("weightKg")).toBe("");
    expect(at("bmi")).toBe("");
  });

  it("writes a genuine zero as 0, not empty", () => {
    const row = byId("scale-1");
    expect(row[header.indexOf("visceralFat")]).toBe("0");
  });

  it("unpacks skinfolds and keeps the raw JSON so a new key is never lost", () => {
    const row = byId("tape-1");
    const at = (name: string) => row[header.indexOf(name)];
    expect(at("skinfoldChestMm")).toBe("8");
    expect(at("skinfoldAbdomenMm")).toBe("14");
    expect(at("skinfoldTricepsMm")).toBe("");
    expect(at("skinfoldDataJson")).toContain("unexpectedKey");
  });

  it("survives a note containing a comma, a quote and a newline", () => {
    const notes = byId("tape-1")[header.indexOf("notes")];
    expect(notes).toBe('Waist "tight", 2 cm down\nmorning fasted');
  });

  it("dates the row by local day, not UTC", () => {
    // 2026-08-18T11:00Z is 06:00 in Bogota — same day here, but the row must
    // come from the timezone helper, not a UTC slice.
    expect(byId("scale-1")[header.indexOf("date")]).toBe("2026-08-18");
  });
});

describe("daily.csv", () => {
  const { csv, rowCount } = buildHealthCsv(fixture(), "daily");
  const rows = records(csv);

  it("fills the calendar so a gap is a zero row, not a missing row", () => {
    // Without this, charting in Sheets compresses the gap into one segment.
    expect(rowCount).toBe(3);
    expect(rows[1][0]).toBe("2026-08-18");
    expect(rows[2][0]).toBe("2026-08-19");
    expect(rows[3][0]).toBe("2026-08-20");
  });

  it("marks the filled day as unlogged", () => {
    const header = parseHeader(csv);
    expect(rows[2][header.indexOf("loggedAnything")]).toBe("0");
    expect(rows[1][header.indexOf("loggedAnything")]).toBe("1");
  });
});

describe("the other datasets", () => {
  it("food, workouts and water all serialise", () => {
    for (const key of ["food-logs", "workouts", "water-logs"] as const) {
      const { rowCount } = buildHealthCsv(fixture(), key);
      expect(rowCount).toBe(1);
    }
  });

  it("derives exerciseCount without leaking the exercises JSON", () => {
    const { csv } = buildHealthCsv(fixture(), "workouts");
    const header = parseHeader(csv);
    expect(header).toContain("exerciseCount");
    expect(header).not.toContain("exercises");
    expect(header).not.toContain("routeData");
    expect(records(csv)[1][header.indexOf("exerciseCount")]).toBe("2");
  });

  it("quotes a Spanish description containing a comma", () => {
    const { csv } = buildHealthCsv(fixture(), "food-logs");
    expect(csv).toContain('"Bandeja paisa, media porción"');
  });
});

describe("dataset keys", () => {
  it("validates keys and builds stable filenames", () => {
    expect(isHealthCsvDatasetKey("measurements")).toBe(true);
    expect(isHealthCsvDatasetKey("nope")).toBe(false);
    expect(isHealthCsvDatasetKey(null)).toBe(false);
    expect(healthCsvFilename("measurements", "2026-08-26")).toBe(
      "personal-os-health-measurements-2026-08-26.csv"
    );
  });

  it("every advertised key actually builds", () => {
    for (const key of HEALTH_CSV_KEYS) {
      expect(() => buildHealthCsv(fixture(), key)).not.toThrow();
    }
  });
});

describe("no field left behind", () => {
  // Adding a column to BodyMeasurement without adding it to the CSV would
  // silently drop it from every export. Fail at CI instead.
  it("measurements.csv has a column for every schema column", () => {
    const schema = readFileSync(
      fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
      "utf8"
    );
    const block = schema.match(/model BodyMeasurement \{([\s\S]*?)\n\}/)![1];
    const skip = new Set(["id", "createdAt", "updatedAt", "measuredAt", "skinfoldData"]);
    const columns = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0])
      .filter((name) => /^\w+$/.test(name) && !skip.has(name));

    for (const column of columns) {
      expect(
        MEASUREMENT_CSV_HEADERS.includes(column as never),
        `measurements.csv is missing a column for "${column}"`
      ).toBe(true);
    }
  });
});
