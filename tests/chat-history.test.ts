import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_CHAT_GAP_HOURS,
  LEGACY_SPLIT_TIME_ZONE,
  buildSnippet,
  deriveTitle,
  groupByRecency,
  isStale,
  itemNamesFromMeta,
  likePattern,
  normalizeGapHours,
  planLegacySplit,
  recencyOf,
  rowStamp,
  sanitizeTitle,
  type LegacyMessage,
} from "@/lib/chat-history";

const msg = (id: string, iso: string, role = "user", content = id, meta?: unknown): LegacyMessage => ({
  id,
  role,
  content,
  createdAt: new Date(iso),
  meta,
});

describe("planLegacySplit — the old endless thread, one chat per day", () => {
  it("files every message exactly once and keeps the original order", () => {
    const messages = [
      msg("c", "2026-10-04T18:05:00Z"),
      msg("a", "2026-10-03T13:00:00Z"),
      msg("b", "2026-10-03T23:40:00Z"),
      msg("d", "2026-10-04T18:06:00Z", "proposal"),
    ];
    const plans = planLegacySplit(messages);
    expect(plans.map((p) => p.day)).toEqual(["2026-10-03", "2026-10-04"]);
    expect(plans.flatMap((p) => p.messageIds)).toEqual(["a", "b", "c", "d"]);
    // nothing dropped, nothing duplicated
    expect(new Set(plans.flatMap((p) => p.messageIds)).size).toBe(messages.length);
  });

  it("splits on the BOGOTÁ day, not the UTC day", () => {
    // 9:30 pm Saturday in Bogotá is already Sunday in UTC. It belongs with
    // Saturday's dinner, not with Sunday's breakfast.
    const plans = planLegacySplit([
      msg("dinner", "2026-10-04T02:30:00Z"), // Sat Oct 3, 9:30 pm Bogotá
      msg("breakfast", "2026-10-04T13:00:00Z"), // Sun Oct 4, 8:00 am Bogotá
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ day: "2026-10-03", messageIds: ["dinner"] });
    expect(plans[1]).toMatchObject({ day: "2026-10-04", messageIds: ["breakfast"] });
    expect(LEGACY_SPLIT_TIME_ZONE).toBe("America/Bogota");
  });

  it("records each day's first and last instant, in UTC", () => {
    const [plan] = planLegacySplit([
      msg("x", "2026-09-01T14:00:00Z"),
      msg("y", "2026-09-01T22:15:00Z"),
    ]);
    expect(plan.firstAt.toISOString()).toBe("2026-09-01T14:00:00.000Z");
    expect(plan.lastAt.toISOString()).toBe("2026-09-01T22:15:00.000Z");
  });

  it("names a day from its first words", () => {
    const [plan] = planLegacySplit([
      msg("p", "2026-09-01T14:00:00Z", "proposal", "Here's what I heard."),
      msg("u", "2026-09-01T14:00:01Z", "user", "480 grams of chicken and pasta."),
    ]);
    expect(plan.title).toBe("480 grams of chicken and pasta");
  });

  it("an empty thread is an empty plan", () => {
    expect(planLegacySplit([])).toEqual([]);
  });
});

describe("deriveTitle", () => {
  const at = new Date("2026-10-04T18:05:00Z");
  const timeZone = "America/Bogota";

  it("borrows the food on the card when a photo was sent with no words", () => {
    expect(
      deriveTitle({
        firstUserText: "(photo — log what you see)",
        itemNames: ["Unsweetened grape juice in water (~2 medium glasses)"],
        at,
        timeZone,
      })
    ).toBe("Unsweetened grape juice in water");
    expect(
      deriveTitle({
        firstUserText: "(3 photos — log what you see)",
        itemNames: ["Sancocho de gallina broth only, ~1 bowl", "Egg salad", "Boiled potato"],
        at,
        timeZone,
      })
    ).toBe("Sancocho de gallina broth only + Egg salad +1");
  });

  it("falls back to the day when there is nothing to quote", () => {
    expect(deriveTitle({ firstUserText: "(photo — log what you see)", at, timeZone })).toBe(
      "Sun, Oct 4"
    );
    expect(deriveTitle({ firstUserText: "   ", at, timeZone })).toBe("Sun, Oct 4");
  });

  it("does not quote the freestyle hand-off's machine preamble", () => {
    expect(
      deriveTitle({
        firstUserText: "Freestyle session to describe: id=abc duration=1800 hr=142",
        at,
        timeZone,
      })
    ).toBe("Freestyle session");
  });

  it("cuts a long first message on a word, with an ellipsis", () => {
    const title = deriveTitle({
      firstUserText:
        "I had a matcha ice cream, it was protein, so it was one serving of vanilla protein which is thirty grams",
      at,
      timeZone,
    });
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });
});

describe("sanitizeTitle", () => {
  it("strips the wrapping a model likes to add", () => {
    expect(sanitizeTitle('"Grape juice, two glasses."')).toBe("Grape juice, two glasses");
    expect(sanitizeTitle("**Morning weigh-in**\n")).toBe("Morning weigh-in");
    expect(sanitizeTitle("  ")).toBe("");
    expect(sanitizeTitle(null)).toBe("");
  });
});

describe("itemNamesFromMeta", () => {
  it("reads food names off a card and ignores everything else", () => {
    expect(
      itemNamesFromMeta({ kind: "food", data: { items: [{ foodDescription: "Arepa" }, {}] } })
    ).toEqual(["Arepa"]);
    expect(itemNamesFromMeta({ kind: "measurement", data: { weightKg: 82.8 } })).toEqual([]);
    expect(itemNamesFromMeta({ data: { items: "not an array" } })).toEqual([]);
    expect(itemNamesFromMeta(null)).toEqual([]);
  });
});

describe("isStale — a new chat after a quiet gap", () => {
  const now = new Date("2026-10-04T20:00:00Z");

  it("defaults to six hours", () => {
    expect(DEFAULT_NEW_CHAT_GAP_HOURS).toBe(6);
  });

  it("lunch to dinner stays one chat; overnight starts a new one", () => {
    expect(isStale("2026-10-04T15:00:00Z", now, 6)).toBe(false); // 5 h
    expect(isStale("2026-10-04T14:00:00Z", now, 6)).toBe(false); // exactly 6 h
    expect(isStale("2026-10-04T13:59:59Z", now, 6)).toBe(true);
    expect(isStale("2026-10-04T03:00:00Z", now, 6)).toBe(true); // last night
  });

  it("0 means never", () => {
    expect(isStale("2020-01-01T00:00:00Z", now, 0)).toBe(false);
  });

  it("a chat with no activity on record is not stale — there is nothing to split from", () => {
    expect(isStale(null, now, 6)).toBe(false);
    expect(isStale("garbage", now, 6)).toBe(false);
  });

  it("a bad setting falls back to the default rather than to 'always'", () => {
    expect(normalizeGapHours("abc")).toBe(6);
    expect(normalizeGapHours(-3)).toBe(6);
    expect(normalizeGapHours("3")).toBe(3);
    expect(normalizeGapHours(0)).toBe(0);
  });
});

describe("the shelves", () => {
  // Sunday Oct 4 2026, 1:05 pm in Bogotá. The week is Mon Sep 28 – Sun Oct 4.
  const now = new Date("2026-10-04T18:05:00Z");
  const tz = "America/Bogota";

  it("places each instant on exactly one shelf", () => {
    expect(recencyOf("2026-10-04T13:00:00Z", now, tz)).toBe("today");
    expect(recencyOf("2026-10-03T23:00:00Z", now, tz)).toBe("thisWeek"); // Sat
    expect(recencyOf("2026-09-28T12:00:00Z", now, tz)).toBe("thisWeek"); // Mon
    expect(recencyOf("2026-09-27T23:00:00Z", now, tz)).toBe("lastWeek"); // Sun
    expect(recencyOf("2026-09-21T12:00:00Z", now, tz)).toBe("lastWeek"); // Mon
    expect(recencyOf("2026-09-20T23:00:00Z", now, tz)).toBe("lastMonth");
    expect(recencyOf("2026-09-01T12:00:00Z", now, tz)).toBe("lastMonth");
    expect(recencyOf("2026-08-31T12:00:00Z", now, tz)).toBe("older");
  });

  it("uses the device's day, so late last night is not 'today'", () => {
    // 04:30Z on Oct 4 is 11:30 pm Saturday in Bogotá…
    expect(recencyOf("2026-10-04T04:30:00Z", now, tz)).toBe("thisWeek");
    // …and the same instant IS today for a device in Madrid.
    expect(recencyOf("2026-10-04T04:30:00Z", now, "Europe/Madrid")).toBe("today");
  });

  it("re-sorts by itself when he changes timezone — nothing stored moves", () => {
    // 05:30Z Oct 4: 12:30 am Sunday in Bogotá (UTC−5), still Saturday in
    // Los Angeles (UTC−7). Same row, same UTC instant, different shelf.
    const at = "2026-10-04T05:30:00Z";
    expect(recencyOf(at, now, "America/Bogota")).toBe("today");
    expect(recencyOf(at, new Date("2026-10-04T18:05:00Z"), "America/Los_Angeles")).toBe(
      "thisWeek"
    );
  });

  it("keeps early-month days on 'Last month' rather than jumping over them", () => {
    // Late in the month, Oct 3 is neither this week nor last week.
    const late = new Date("2026-10-25T18:00:00Z");
    expect(recencyOf("2026-10-03T18:00:00Z", late, tz)).toBe("lastMonth");
    expect(recencyOf("2026-09-01T18:00:00Z", late, tz)).toBe("lastMonth");
    expect(recencyOf("2026-08-31T18:00:00Z", late, tz)).toBe("older");
  });

  it("crosses a year boundary", () => {
    const jan = new Date("2027-01-02T18:00:00Z");
    expect(recencyOf("2026-12-05T18:00:00Z", jan, tz)).toBe("lastMonth");
    expect(recencyOf("2026-11-30T18:00:00Z", jan, tz)).toBe("older");
  });

  it("groups newest-first and leaves empty shelves out", () => {
    const groups = groupByRecency(
      [
        { id: "old", lastMessageAt: "2026-07-01T12:00:00Z" },
        { id: "today-early", lastMessageAt: "2026-10-04T13:00:00Z" },
        { id: "today-late", lastMessageAt: "2026-10-04T18:00:00Z" },
        { id: "sat", lastMessageAt: "2026-10-03T20:00:00Z" },
      ],
      now,
      tz
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "This week", "Older"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["today-late", "today-early"]);
  });

  it("stamps a row with a time today, a weekday this fortnight, a date before", () => {
    expect(rowStamp("2026-10-04T18:05:00Z", now, tz)).toBe("1:05 PM");
    expect(rowStamp("2026-10-03T20:00:00Z", now, tz)).toBe("Sat 3");
    expect(rowStamp("2026-09-12T20:00:00Z", now, tz)).toBe("Sep 12");
    expect(rowStamp("2025-12-24T20:00:00Z", now, tz)).toBe("Dec 24, 2025");
  });
});

describe("search", () => {
  it("escapes LIKE wildcards so '100%' means one hundred percent", () => {
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("  salmon ")).toBe("%salmon%");
  });

  it("shows the words around the hit, case-insensitively", () => {
    const snippet = buildSnippet(
      "Log dinner — salmon, a cup of rice, and the greens from meal prep",
      "RICE",
      10
    );
    expect(snippet).toEqual({ before: "… a cup of ", match: "rice", after: ", and the …" });
  });

  it("returns nothing when there is nothing to show", () => {
    expect(buildSnippet("no match here", "salmon")).toBeNull();
    expect(buildSnippet(null, "salmon")).toBeNull();
    expect(buildSnippet("salmon", "  ")).toBeNull();
  });
});
