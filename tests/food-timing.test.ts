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

// ─── meal words vs the model's noon default (2026-10-18) ─────────────────
import { mealWordHour, reconcileLoggedAtWithMealWord } from "@/lib/food-timing";

describe("mealWordHour", () => {
  it("reads one meal word in either language", () => {
    expect(mealWordHour("yesterday for dinner I had chicken")).toBe(20);
    expect(mealWordHour("anoche comí una bandeja paisa")).toBe(20);
    expect(mealWordHour("para el desayuno dos huevos")).toBe(8);
    expect(mealWordHour("lunch was chicken and rice")).toBe(13);
  });
  it("stays out of it when there is no meal word, or two different ones", () => {
    expect(mealWordHour("200 g chicken with rice")).toBeNull();
    expect(mealWordHour("eggs this morning and a sandwich at lunch")).toBeNull();
  });
});

describe("reconcileLoggedAtWithMealWord — 'yesterday for dinner' is not noon", () => {
  const noonYesterday = "2026-10-16T17:00:00.000Z"; // 12:00 Bogotá
  it("moves a stamp at exactly noon to the meal's hour on the same local day", () => {
    const [it_] = reconcileLoggedAtWithMealWord([{ loggedAt: noonYesterday }], "Yesterday for dinner I had chicken", TZ);
    expect(it_.loggedAt).toBe("2026-10-17T01:00:00.000Z"); // 20:00 Bogotá on Oct 16
  });
  it("leaves a stamp that was actually said alone", () => {
    const said = "2026-10-16T17:30:00.000Z";
    expect(reconcileLoggedAtWithMealWord([{ loggedAt: said }], "dinner at 12:30", TZ)[0].loggedAt).toBe(said);
  });
  it("does nothing without a single meal word, or without a stamp", () => {
    expect(reconcileLoggedAtWithMealWord([{ loggedAt: noonYesterday }], "chicken with rice", TZ)[0].loggedAt).toBe(noonYesterday);
    expect(reconcileLoggedAtWithMealWord([{}], "dinner", TZ)[0]).toEqual({});
  });
});

// ─── a meal is never eaten in the future (2026-10-20) ─────────────────────
import { pullFutureMealsBack } from "@/lib/food-timing";

describe("pullFutureMealsBack — 'at 7pm I ate', said at 8 am, is last night", () => {
  const eightAm = new Date("2026-10-20T13:00:00Z"); // 08:00 Bogotá
  it("moves a stamp hours ahead of now back one day", () => {
    const [it_] = pullFutureMealsBack([{ loggedAt: "2026-10-21T00:00:00.000Z" }], "at 7pm I ate two empanadas", eightAm);
    expect(it_.loggedAt).toBe("2026-10-20T00:00:00.000Z"); // 19:00 Bogotá on Oct 19
  });
  it("leaves a stamp in the past, or within 15 minutes ahead, alone", () => {
    expect(pullFutureMealsBack([{ loggedAt: "2026-10-20T12:30:00.000Z" }], "eggs", eightAm)[0].loggedAt).toBe("2026-10-20T12:30:00.000Z");
    expect(pullFutureMealsBack([{ loggedAt: "2026-10-20T13:10:00.000Z" }], "eggs", eightAm)[0].loggedAt).toBe("2026-10-20T13:10:00.000Z");
  });
  it("respects an explicit date in the message", () => {
    expect(pullFutureMealsBack([{ loggedAt: "2026-10-21T00:00:00.000Z" }], "on 2026-10-20 at 7pm", eightAm)[0].loggedAt).toBe("2026-10-21T00:00:00.000Z");
  });
  it("passes items without a stamp through", () => {
    expect(pullFutureMealsBack([{}], "eggs", eightAm)).toEqual([{}]);
  });
});
