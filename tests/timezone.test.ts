import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";

describe("getDateStringInTimeZone", () => {
  it("keeps late evenings on the local day (the food-log bug class)", () => {
    // 8 PM Aug 8 in Bogotá is already Aug 9 in UTC
    const eveningBogota = new Date("2026-08-09T01:00:00Z");
    expect(getDateStringInTimeZone(eveningBogota, "America/Bogota")).toBe(
      "2026-08-08"
    );
  });

  it("rolls over at local midnight, not UTC midnight", () => {
    const justAfterMidnight = new Date("2026-08-09T05:00:01Z"); // 00:00:01 Bogotá
    expect(getDateStringInTimeZone(justAfterMidnight, "America/Bogota")).toBe(
      "2026-08-09"
    );
  });
});

describe("addDaysToDateString", () => {
  it("crosses month boundaries", () => {
    expect(addDaysToDateString("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("crosses year boundaries backwards", () => {
    expect(addDaysToDateString("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles non-leap February", () => {
    expect(addDaysToDateString("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("zonedLocalDateTimeToUtc", () => {
  it("converts Bogotá local time to UTC", () => {
    expect(
      zonedLocalDateTimeToUtc("2026-08-08", "America/Bogota", 20, 0, 0).toISOString()
    ).toBe("2026-08-09T01:00:00.000Z");
  });

  it("survives LOCAL MIDNIGHT (the ICU h24 trap every day-bounds hits)", () => {
    // hour12:false + hourCycle renders midnight as "24" on some ICUs,
    // which shifted every local-day boundary a day early (2026-08-11).
    expect(
      zonedLocalDateTimeToUtc("2026-07-29", "America/Bogota", 0, 0, 0).toISOString()
    ).toBe("2026-07-29T05:00:00.000Z");
  });

  it("respects DST in zones that observe it", () => {
    expect(
      zonedLocalDateTimeToUtc("2026-07-01", "America/New_York", 12, 0, 0).toISOString()
    ).toBe("2026-07-01T16:00:00.000Z"); // EDT −4
    expect(
      zonedLocalDateTimeToUtc("2026-01-15", "America/New_York", 12, 0, 0).toISOString()
    ).toBe("2026-01-15T17:00:00.000Z"); // EST −5
  });
});
