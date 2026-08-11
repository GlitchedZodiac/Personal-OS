import { describe, expect, it } from "vitest";
import {
  detectDateFormat,
  parseCSV,
  parseVeSyncTime,
  parseVeSyncValue,
} from "@/lib/vesync";

// The VeSync export's date format is locale-dependent and ambiguous row by
// row — importing "08/11/2026" as DD/MM silently lands weigh-ins on wrong
// dates. These tests pin the whole-file detection and the timezone rule
// (scale timestamps are local clock time, stored as exact UTC instants).

const TZ = "America/Bogota"; // UTC-5, no DST

describe("detectDateFormat", () => {
  it("detects US format when any second field exceeds 12", () => {
    expect(
      detectDateFormat(['"08/11/2026, 6:46 AM"', '"07/28/2026, 7:14 AM"'])
    ).toBe("MDY");
  });

  it("detects day-first when any first field exceeds 12", () => {
    expect(
      detectDateFormat(['"15/02/2026, 7:41 AM"', '"03/02/2026, 8:00 AM"'])
    ).toBe("DMY");
  });

  it("defaults fully ambiguous files to US format", () => {
    expect(detectDateFormat(['"08/11/2026, 6:46 AM"', '"01/02/2026, 7:00 AM"'])).toBe(
      "MDY"
    );
  });

  it("flags files with conflicting evidence", () => {
    expect(
      detectDateFormat(['"28/07/2026, 7:14 AM"', '"07/28/2026, 7:14 AM"'])
    ).toBe("conflict");
  });
});

describe("parseVeSyncTime", () => {
  it("stores local scale time as the exact UTC instant (user tz, not server)", () => {
    const d = parseVeSyncTime('"08/11/2026, 6:46 AM"', "MDY", TZ);
    expect(d?.toISOString()).toBe("2026-08-11T11:46:00.000Z");
  });

  it("keeps a 2 AM weigh-in on its own local day", () => {
    // Matches the instant the original Feb import stored for this reading —
    // re-imports must dedupe against it exactly.
    const d = parseVeSyncTime('"02/02/2026, 2:16 AM"', "MDY", TZ);
    expect(d?.toISOString()).toBe("2026-02-02T07:16:00.000Z");
  });

  it("parses PM times and day-first format", () => {
    expect(parseVeSyncTime('"12/24/2025, 2:49 PM"', "MDY", TZ)?.toISOString()).toBe(
      "2025-12-24T19:49:00.000Z"
    );
    expect(parseVeSyncTime('"15/02/2026, 7:41 AM"', "DMY", TZ)?.toISOString()).toBe(
      "2026-02-15T12:41:00.000Z"
    );
  });

  it("rejects impossible dates instead of guessing", () => {
    expect(parseVeSyncTime('"15/02/2026, 7:41 AM"', "MDY", TZ)).toBeNull(); // month 15
    expect(parseVeSyncTime("garbage", "MDY", TZ)).toBeNull();
  });

  it("normalizes the narrow no-break space VeSync puts before AM/PM", () => {
    const d = parseVeSyncTime('"08/11/2026, 6:46 AM"', "MDY", TZ);
    expect(d?.toISOString()).toBe("2026-08-11T11:46:00.000Z");
  });
});

describe("parseVeSyncValue", () => {
  it("strips units and treats -- as absent", () => {
    expect(parseVeSyncValue("82.20kg")).toBe(82.2);
    expect(parseVeSyncValue("21.1%")).toBe(21.1);
    expect(parseVeSyncValue("1850kcal")).toBe(1850);
    expect(parseVeSyncValue("101bpm")).toBe(101);
    expect(parseVeSyncValue("--")).toBeNull();
    expect(parseVeSyncValue("")).toBeNull();
  });
});

describe("parseCSV", () => {
  it("parses the export's quoted-time rows into typed readings", () => {
    const csv = [
      "Time,Weight,BMI,Body Fat,Fat-Free Body Weight,Subcutaneous Fat,Visceral Fat,Body Water,Skeletal Muscles,Muscle Mass,Bone Mass,Protein,BMR,Metabolic Age,Heart Rate",
      '"07/28/2026, 7:14 AM",82.25kg,26.6,20.7%,65.21kg,18.0%,9,57.2%,51.1%,61.89kg,3.25kg,18.0%,1850kcal,33,--',
      '"08/10/2026, 8:37 PM",82.20kg,26.5,--,--,--,--,--,--,--,--,--,--,--,--',
    ].join("\n");
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].weightKg).toBe(82.25);
    expect(rows[0].bodyFatPct).toBe(20.7);
    expect(rows[0].visceralFat).toBe(9);
    expect(rows[0].bmrKcal).toBe(1850);
    expect(rows[0].heartRateBpm).toBeNull();
    expect(rows[1].weightKg).toBe(82.2);
    expect(rows[1].bodyFatPct).toBeNull();
  });
});
