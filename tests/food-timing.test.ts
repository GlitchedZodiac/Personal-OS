import { describe, expect, it } from "vitest";
import {
  inferFoodLoggedAtFromMessage,
  normalizeFoodItemsWithTiming,
  normalizeFoodLoggedAtValue,
} from "@/lib/food-timing";

const TZ = "America/Bogota"; // UTC-5, no DST — the app's home timezone

// 8 PM on Aug 8 in Bogotá — the UTC date is already Aug 9. This is the exact
// window where the original "food logs land on tomorrow" bug lived.
const NOW = new Date("2026-08-09T01:00:00Z");

describe("inferFoodLoggedAtFromMessage", () => {
  it("returns null when the message has no temporal hint", () => {
    expect(inferFoodLoggedAtFromMessage("I had a salad", TZ, NOW)).toBeNull();
  });

  it("anchors 'yesterday at 7pm' to the local yesterday, not UTC", () => {
    const iso = inferFoodLoggedAtFromMessage(
      "I had chicken yesterday at 7pm",
      TZ,
      NOW
    );
    // Aug 7, 19:00 Bogotá = Aug 8, 00:00 UTC
    expect(iso).toBe("2026-08-08T00:00:00.000Z");
  });

  it("understands 'last night' with the dinner default hour", () => {
    const iso = inferFoodLoggedAtFromMessage("last night I had pasta", TZ, NOW);
    // Aug 7, 20:00 Bogotá
    expect(iso).toBe("2026-08-08T01:00:00.000Z");
  });

  it("keeps evening 'today' logs on the local day", () => {
    const iso = inferFoodLoggedAtFromMessage(
      "I had eggs for breakfast today",
      TZ,
      NOW
    );
    // breakfast default 08:00 local on Aug 8 — NOT Aug 9
    expect(iso).toBe("2026-08-08T13:00:00.000Z");
  });

  it("understands Spanish temporal phrases", () => {
    const iso = inferFoodLoggedAtFromMessage("anoche comí una arepa", TZ, NOW);
    expect(iso).toBe("2026-08-08T01:00:00.000Z");
  });

  it("parses explicit ISO dates in the message", () => {
    const iso = inferFoodLoggedAtFromMessage(
      "log lunch for 2026-08-05",
      TZ,
      NOW
    );
    // lunch default 13:00 local
    expect(iso).toBe("2026-08-05T18:00:00.000Z");
  });
});

describe("normalizeFoodLoggedAtValue", () => {
  it("interprets bare local datetimes in the app timezone", () => {
    expect(normalizeFoodLoggedAtValue("2026-08-05 19:30", TZ)).toBe(
      "2026-08-06T00:30:00.000Z"
    );
  });

  it("defaults date-only values to local noon", () => {
    expect(normalizeFoodLoggedAtValue("2026-08-05", TZ)).toBe(
      "2026-08-05T17:00:00.000Z"
    );
  });

  it("passes through full ISO timestamps", () => {
    expect(normalizeFoodLoggedAtValue("2026-08-05T10:00:00.000Z", TZ)).toBe(
      "2026-08-05T10:00:00.000Z"
    );
  });

  it("rejects garbage", () => {
    expect(normalizeFoodLoggedAtValue("not a date", TZ)).toBeNull();
    expect(normalizeFoodLoggedAtValue("", TZ)).toBeNull();
    expect(normalizeFoodLoggedAtValue(42, TZ)).toBeNull();
  });
});

describe("normalizeFoodItemsWithTiming", () => {
  it("prefers an item's explicit loggedAt over message inference", () => {
    const items = normalizeFoodItemsWithTiming(
      [{ foodDescription: "arepa", loggedAt: "2026-08-05 08:00" }],
      "I had an arepa yesterday at 7pm",
      TZ,
      NOW
    ) as Array<{ loggedAt?: string }>;
    expect(items[0].loggedAt).toBe("2026-08-05T13:00:00.000Z");
  });

  it("applies message-level inference when items lack timing", () => {
    const items = normalizeFoodItemsWithTiming(
      [{ foodDescription: "arepa" }, { foodDescription: "eggs" }],
      "yesterday at 7pm I had arepa and eggs",
      TZ,
      NOW
    ) as Array<{ loggedAt?: string }>;
    expect(items[0].loggedAt).toBe("2026-08-08T00:00:00.000Z");
    expect(items[1].loggedAt).toBe("2026-08-08T00:00:00.000Z");
  });

  it("leaves items untouched when nothing implies timing", () => {
    const items = normalizeFoodItemsWithTiming(
      [{ foodDescription: "salad" }],
      "I had a salad",
      TZ,
      NOW
    ) as Array<{ loggedAt?: string }>;
    expect(items[0].loggedAt).toBeUndefined();
  });

  it("returns [] for non-array input", () => {
    expect(normalizeFoodItemsWithTiming(null, "x", TZ, NOW)).toEqual([]);
  });
});
