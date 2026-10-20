import { beforeEach, describe, expect, it, vi } from "vitest";

// One run of the Coach (docs/coach-plan.md §2.4, §2.7). The Prisma double
// RECORDS every delegate call (model, method, inside a transaction or not),
// keeps coach_reviews in memory with the database's own rules (the unique on
// liveWeekStart, and the CHECK that live ⇔ liveWeekStart = weekStart), and
// answers everything else with nothing. The proof the brief asks for is then
// a statement about calls actually made: a Test run writes nothing outside
// coach_reviews and ai_usage_events, and reads no table of his data.

const h = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
  const state = {
    reviews: [] as Row[],
    calls: [] as Array<{ model: string; method: string; inTx: boolean }>,
    inTx: false,
    settingsData: {} as Record<string, unknown>,
    seq: 0,
    /** plants a competing run's live row as a supersede transaction begins — the lost race */
    raceOnce: null as null | (() => void),
  };
  const p2002 = () => Object.assign(new Error("Unique constraint failed on liveWeekStart"), { code: "P2002" });
  const checkRow = (r: Row) => {
    const live = r.kind === "live";
    if (live !== (r.liveWeekStart != null)) throw new Error("violates check constraint coach_reviews_live_week_check");
    if (r.liveWeekStart != null && r.liveWeekStart !== r.weekStart) throw new Error("violates check constraint coach_reviews_live_week_check");
  };
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "gte" in (v as object)) return (row[k] as Date) >= (v as { gte: Date }).gte;
      if (v && typeof v === "object" && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
      return row[k] === v;
    });
  const coachReview: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    create: async ({ data }) => {
      const d = data as Row;
      const row: Row = {
        kind: "live",
        liveWeekStart: null,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        error: null,
        reviewJson: null,
        markdown: null,
        checksJson: null,
        actionsJson: [],
        conversationId: null,
        generatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...d,
        id: `rv${++state.seq}`,
      };
      checkRow(row);
      if (row.liveWeekStart != null && state.reviews.some((r) => r.liveWeekStart === row.liveWeekStart)) throw p2002();
      state.reviews.push(row);
      return { ...row };
    },
    findUnique: async ({ where }) => {
      const r = state.reviews.find((x) => matches(x, where as Record<string, unknown>));
      return r ? { ...r } : null;
    },
    findFirst: async ({ where }) => {
      const r = state.reviews.filter((x) => matches(x, (where ?? {}) as Record<string, unknown>)).at(-1);
      return r ? { ...r } : null;
    },
    findMany: async () => state.reviews.map((r) => ({ ...r })),
    update: async ({ where, data }) => {
      const r = state.reviews.find((x) => x.id === (where as { id: string }).id);
      if (!r) throw new Error("record not found");
      const next: Row = { ...r, ...(data as Row), updatedAt: new Date() };
      checkRow(next);
      if (next.liveWeekStart != null && state.reviews.some((o) => o !== r && o.liveWeekStart === next.liveWeekStart)) throw p2002();
      Object.assign(r, next);
      return { ...r };
    },
    count: async ({ where }) => state.reviews.filter((x) => matches(x, where as Record<string, unknown>)).length,
    aggregate: async ({ where }) => {
      const rows = state.reviews.filter((x) => matches(x, where as Record<string, unknown>));
      return { _sum: { costUsd: rows.reduce((s, r) => s + Number(r.costUsd), 0) }, _count: rows.length };
    },
  };
  const impls: Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>> = {
    coachReview,
    aIUsageEvent: {
      create: async () => ({}),
      aggregate: async () => ({ _sum: { costUsd: 0 }, _count: 0 }),
    },
    userSettings: { findUnique: async () => ({ data: state.settingsData }) },
  };
  const fallback = (method: string): unknown =>
    method === "findMany" ? [] : method === "count" ? 0 : method === "aggregate" ? { _sum: {}, _count: 0 } : method.startsWith("find") ? null : {};
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== "string" || method === "then") return undefined;
          return async (args: Record<string, unknown> = {}) => {
            state.calls.push({ model, method, inTx: state.inTx });
            const impl = impls[model]?.[method];
            return impl ? impl(args) : fallback(method);
          };
        },
      }
    );
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (prop === "$transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) => {
            state.calls.push({ model: "$transaction", method: "run", inTx: false });
            if (state.raceOnce) {
              const plant = state.raceOnce;
              state.raceOnce = null;
              plant();
            }
            state.inTx = true;
            try {
              return await fn(prisma);
            } finally {
              state.inTx = false;
            }
          };
        }
        return delegate(prop);
      },
    }
  );
  return { state, prisma, WRITES };
});
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));

import { estimateChatCostUsdConservative, recordAIUsage } from "@/lib/ai-usage";
import { defaultReviewWeek, isHealthy, runCoachReview, STALE_GENERATING_MS, TEST_RUNS_PER_DAY } from "@/lib/coach/run";
import type { GenerateFn } from "@/lib/coach/review";
import { DEFAULT_COACH_SETTINGS } from "@/lib/coach/settings";
import type { WeekFacts } from "@/lib/coach/types";
import { goodReview } from "@/tests/fixtures/coach-review";
import { fixtureSource } from "@/tests/fixtures/coach-week";

const NOW = new Date("2026-10-12T00:00:00Z"); // Sunday Oct 11, 19:00 Bogotá
const WEEK = "2026-10-05";

/** A model stand-in that answers from the facts it was sent, and meters like the real one. */
const generate = vi.fn(async (args: Parameters<GenerateFn>[0]) => {
  recordAIUsage({ surface: args.surface ?? "coach", model: args.model ?? "gpt-5.6-sol", inputTokens: 5000, outputTokens: 1200 });
  const sent = JSON.parse(args.messages[1].content) as WeekFacts;
  return { text: JSON.stringify(goodReview(sent)), finishReason: "stop", usage: { inputTokens: 5000, outputTokens: 1200, calls: 1 } };
});

const writes = () => h.state.calls.filter((c) => h.WRITES.has(c.method));
const touched = () => new Set(h.state.calls.map((c) => c.model));

beforeEach(() => {
  h.state.reviews.length = 0;
  h.state.calls.length = 0;
  h.state.seq = 0;
  h.state.raceOnce = null;
  h.state.settingsData = { timeZone: "America/Bogota", coach: { ...DEFAULT_COACH_SETTINGS } };
  generate.mockClear();
});

describe("Test mode never touches his rows", () => {
  it("writes nothing outside coach_reviews and ai_usage_events, and reads no table of his data", async () => {
    const result = await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate });

    expect(result.outcome).toBe("ran");
    const writtenModels = new Set(writes().map((c) => c.model));
    expect([...writtenModels].sort()).toEqual(["aIUsageEvent", "coachReview"]);
    // reads: only the settings row (switch, budget, timezone) — never food, workouts, body…
    expect([...touched()].sort()).toEqual(["aIUsageEvent", "coachReview", "userSettings"]);
    expect(h.state.calls.filter((c) => c.model === "userSettings").every((c) => c.method === "findUnique")).toBe(true);

    const row = h.state.reviews[0];
    expect(row).toMatchObject({ kind: "test", liveWeekStart: null, status: "ready", trigger: "manual", conversationId: null, weekStart: WEEK });
    expect(Number(row.costUsd)).toBeGreaterThan(0);
    expect(row.inputTokens).toBe(5000);
  });

  it("runs past an exhausted budget when he taps it, without even checking the spend", async () => {
    h.state.reviews.push({ id: "old", kind: "superseded", liveWeekStart: null, weekStart: "2026-09-28", costUsd: 9, generatedAt: new Date("2026-10-02T12:00:00Z") });
    const result = await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate });
    expect(result.outcome).toBe("ran");
    expect(h.state.calls.some((c) => c.method === "aggregate")).toBe(false);
  });

  it("runs even with the Coach switched off — it is the diagnostic", async () => {
    h.state.settingsData = { timeZone: "America/Bogota", coach: { ...DEFAULT_COACH_SETTINGS, enabled: false } };
    const result = await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate });
    expect(result.outcome).toBe("ran");
  });

  it("any number of test rows can share a week", async () => {
    await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate });
    await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate });
    expect(h.state.reviews.filter((r) => r.kind === "test")).toHaveLength(2);
  });
});

describe("the live review of a week", () => {
  const live = (extra: Partial<Parameters<typeof runCoachReview>[0]> = {}) =>
    runCoachReview({
      trigger: "cron",
      kind: "live",
      now: NOW,
      generate,
      source: fixtureSource("full", { weekStart: WEEK }),
      ...extra,
    });

  it("claims the week, writes the review, and creates NO conversation (that waits for his tap)", async () => {
    const result = await live();
    expect(result.outcome).toBe("ran");
    const row = h.state.reviews[0];
    expect(row).toMatchObject({ kind: "live", liveWeekStart: WEEK, status: "ready", trigger: "cron", conversationId: null });
    expect((row.reviewJson as { moves: unknown[] }).moves).toHaveLength(3);
    expect(String(row.markdown)).toContain("## Three moves for next week");
    expect([...new Set(writes().map((c) => c.model))].sort()).toEqual(["aIUsageEvent", "coachReview"]);
    expect(touched().has("chatConversation")).toBe(false);
  });

  it("a second run of the same week stops at the unique — no second model call", async () => {
    await live();
    const again = await live();
    expect(again).toMatchObject({ outcome: "skipped", reason: "exists" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(h.state.reviews).toHaveLength(1);
  });

  it("'run again' supersedes inside ONE transaction — never two live rows, never none", async () => {
    await live();
    h.state.calls.length = 0;
    const again = await live({ trigger: "manual", onExisting: "supersede" });
    expect(again.outcome).toBe("ran");
    const [old, fresh] = h.state.reviews;
    expect(old).toMatchObject({ kind: "superseded", liveWeekStart: null, status: "ready" });
    expect(fresh).toMatchObject({ kind: "live", liveWeekStart: WEEK, status: "ready", trigger: "manual" });
    const inTx = h.state.calls.filter((c) => c.inTx).map((c) => `${c.model}.${c.method}`);
    expect(inTx).toEqual(["coachReview.update", "coachReview.create"]);
  });

  it("the catch-up leaves a good review alone and replaces a failed or dead one", async () => {
    await live();
    expect(await live({ onExisting: "supersede_if_unhealthy" })).toMatchObject({ outcome: "skipped", reason: "exists" });

    h.state.reviews[0].status = "failed";
    expect((await live({ onExisting: "supersede_if_unhealthy" })).outcome).toBe("ran");
    expect(h.state.reviews.map((r) => r.kind)).toEqual(["superseded", "live"]);

    const stale = h.state.reviews[1];
    stale.status = "generating";
    stale.generatedAt = new Date(NOW.getTime() - STALE_GENERATING_MS - 1000);
    expect((await live({ onExisting: "supersede_if_unhealthy" })).outcome).toBe("ran");
    expect(h.state.reviews.filter((r) => r.kind === "live")).toHaveLength(1);
  });

  it("a model failure leaves a failed row with the reason — and the facts, for the screen", async () => {
    const broken = vi.fn(async () => {
      throw new Error("OpenAI is having a moment");
    });
    const result = await live({ generate: broken as unknown as GenerateFn });
    expect(result.outcome).toBe("ran");
    const row = h.state.reviews[0];
    expect(row).toMatchObject({ status: "failed", error: "OpenAI is having a moment", kind: "live" });
    expect((row.factsJson as WeekFacts).facts.length).toBeGreaterThan(50);
  });

  it("switched off: nothing is read or written", async () => {
    h.state.settingsData = { timeZone: "America/Bogota", coach: { ...DEFAULT_COACH_SETTINGS, enabled: false } };
    const result = await live();
    expect(result).toEqual({ outcome: "skipped", reason: "coach_off" });
    expect(writes()).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("the budget", () => {
  const seedSpend = (usd: number) =>
    h.state.reviews.push({ id: "spent", kind: "superseded", liveWeekStart: null, weekStart: "2026-09-28", costUsd: usd, generatedAt: new Date("2026-10-02T12:00:00Z") });

  it("blocks the live run before any model call, and leaves one marker row that never stacks", async () => {
    seedSpend(3.2);
    const blocked = await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full") });
    expect(blocked).toMatchObject({ outcome: "skipped", reason: "budget" });
    expect(generate).not.toHaveBeenCalled();
    if (blocked.outcome === "skipped" && blocked.reason === "budget") {
      expect(blocked.spend).toMatchObject({ reviewsUsd: 3.2, budgetUsd: 3, blocked: true, remainingUsd: 0 });
    }
    expect(h.state.reviews.find((r) => r.kind === "live")).toMatchObject({ status: "blocked_budget", liveWeekStart: WEEK });

    await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full") });
    expect(h.state.reviews.filter((r) => r.status === "blocked_budget")).toHaveLength(1);
  });

  it("never replaces a good review with a 'paused' marker", async () => {
    await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full") });
    seedSpend(5);
    const again = await runCoachReview({ trigger: "manual", kind: "live", now: NOW, generate, source: fixtureSource("full"), onExisting: "supersede" });
    expect(again).toMatchObject({ outcome: "skipped", reason: "budget" });
    expect(h.state.reviews.find((r) => r.kind === "live")).toMatchObject({ status: "ready" });
  });

  it("a raised budget lets the next run replace the marker", async () => {
    seedSpend(3.2);
    await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full") });
    h.state.settingsData = { timeZone: "America/Bogota", coach: { ...DEFAULT_COACH_SETTINGS, monthlyBudgetUsd: 10 } };
    const result = await runCoachReview({
      trigger: "manual",
      kind: "live",
      now: NOW,
      generate,
      source: fixtureSource("full"),
      onExisting: "supersede_if_unhealthy",
    });
    expect(result.outcome).toBe("ran");
    expect(h.state.reviews.find((r) => r.kind === "live")).toMatchObject({ status: "ready" });
  });

  it("counts only the calendar month in his timezone", async () => {
    h.state.reviews.push({ id: "september", kind: "superseded", liveWeekStart: null, weekStart: "2026-09-21", costUsd: 50, generatedAt: new Date("2026-10-01T04:59:00Z") }); // Sep 30 23:59 Bogotá
    const result = await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full") });
    expect(result.outcome).toBe("ran");
  });
});

describe("which week, and what is healthy", () => {
  it("Sunday reviews the week ending today; any other day, the week that last ended", () => {
    expect(defaultReviewWeek(new Date("2026-10-12T00:00:00Z"), "America/Bogota")).toBe("2026-10-05"); // Sun 19:00
    expect(defaultReviewWeek(new Date("2026-10-12T12:00:00Z"), "America/Bogota")).toBe("2026-10-05"); // Mon 07:00
    expect(defaultReviewWeek(new Date("2026-10-15T15:00:00Z"), "America/Bogota")).toBe("2026-10-05"); // Thu
    expect(defaultReviewWeek(new Date("2026-10-19T00:30:00Z"), "America/Bogota")).toBe("2026-10-12"); // the next Sunday
  });

  it("ready is healthy; a fresh generating is; failed, blocked and a dead generating are not", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms);
    expect(isHealthy({ status: "ready", generatedAt: at(10 * 86_400_000) }, NOW)).toBe(true);
    expect(isHealthy({ status: "generating", generatedAt: at(30_000) }, NOW)).toBe(true);
    expect(isHealthy({ status: "generating", generatedAt: at(STALE_GENERATING_MS + 1) }, NOW)).toBe(false);
    expect(isHealthy({ status: "failed", generatedAt: at(0) }, NOW)).toBe(false);
    expect(isHealthy({ status: "blocked_budget", generatedAt: at(0) }, NOW)).toBe(false);
  });
});

describe("money: nothing is paid for twice, and nothing paid for goes unrecorded", () => {
  const live = (extra: Partial<Parameters<typeof runCoachReview>[0]> = {}) =>
    runCoachReview({ trigger: "manual", kind: "live", now: NOW, generate, source: fixtureSource("full", { weekStart: WEEK }), ...extra });

  it("a failed run records the tokens and cost of the calls it made", async () => {
    let n = 0;
    const flaky = vi.fn(async (args: Parameters<GenerateFn>[0]) => {
      n++;
      if (n === 1) return { text: "not json", finishReason: "stop", usage: { inputTokens: 6000, outputTokens: 800, calls: 1 } };
      throw Object.assign(new Error("model timed out"), { usage: { inputTokens: 6100, outputTokens: 0, calls: 1 }, model: args.model });
    });
    const result = await live({ generate: flaky as unknown as GenerateFn });
    expect(result.outcome).toBe("ran");
    const row = h.state.reviews[0];
    expect(row).toMatchObject({ status: "failed", inputTokens: 12100, outputTokens: 800 });
    expect(Number(row.costUsd)).toBeCloseTo((12100 / 1e6) * 5 + (800 / 1e6) * 30, 6);
  });

  it("a run in flight is returned, never replaced — even by 'run again'", async () => {
    h.state.reviews.push({ id: "busy", kind: "live", liveWeekStart: WEEK, weekStart: WEEK, status: "generating", trigger: "manual", costUsd: 0, generatedAt: new Date(NOW.getTime() - 5_000), factsJson: {} });
    const again = await live({ onExisting: "supersede" });
    expect(again).toMatchObject({ outcome: "skipped", reason: "exists", review: { id: "busy" } });
    expect(generate).not.toHaveBeenCalled();
    expect(h.state.reviews).toHaveLength(1);
  });

  it("a lost supersede race returns the winner's row — no second model call, no error", async () => {
    await live();
    generate.mockClear();
    h.state.raceOnce = () => {
      const current = h.state.reviews.find((r) => r.kind === "live")!;
      current.kind = "superseded";
      current.liveWeekStart = null;
      h.state.reviews.push({ id: "winner", kind: "live", liveWeekStart: WEEK, weekStart: WEEK, status: "generating", trigger: "manual", costUsd: 0, generatedAt: NOW, factsJson: {} });
    };
    const loser = await live({ onExisting: "supersede" });
    expect(loser).toMatchObject({ outcome: "skipped", reason: "exists", review: { id: "winner" } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("Test spend never blocks a review — and Tests are capped per day instead", async () => {
    h.state.reviews.push({ id: "pricey-test", kind: "test", liveWeekStart: null, weekStart: WEEK, costUsd: 9, generatedAt: new Date("2026-10-11T15:00:00Z") });
    expect((await live()).outcome).toBe("ran");
    for (let i = 0; i < TEST_RUNS_PER_DAY - 1; i++) {
      expect((await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate })).outcome).toBe("ran");
    }
    expect(await runCoachReview({ trigger: "manual", kind: "test", now: NOW, generate })).toEqual({ outcome: "skipped", reason: "test_limit", limit: 5 });
  });

  it("an unknown model is priced at the highest tier, and says it is an estimate", () => {
    expect(estimateChatCostUsdConservative("gpt-5.6-terra", 1e6, 1e6)).toEqual({ usd: 14, estimated: false });
    expect(estimateChatCostUsdConservative("gpt-9-mystery", 1e6, 1e6)).toEqual({ usd: 35, estimated: true });
  });
});

describe("a Sunday-morning preview gives way to the scheduled review", () => {
  const preview = () =>
    h.state.reviews.push({
      id: "preview", kind: "live", liveWeekStart: WEEK, weekStart: WEEK, status: "ready", trigger: "manual", costUsd: 0.07,
      generatedAt: new Date("2026-10-11T14:00:00Z"), factsJson: { coverage: { complete: false } },
    });

  it("the cron replaces a manual review written before the week ended, keeping it as replaced", async () => {
    preview();
    const result = await runCoachReview({
      trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full", { weekStart: WEEK }),
      onExisting: "supersede_if_unhealthy", scheduled: true,
    });
    expect(result.outcome).toBe("ran");
    expect(h.state.reviews.find((r) => r.id === "preview")).toMatchObject({ kind: "superseded", liveWeekStart: null });
    expect(h.state.reviews.find((r) => r.kind === "live")).toMatchObject({ trigger: "cron", status: "ready" });
  });

  it("but not a review the scheduled run wrote, nor a manual one of a finished week", async () => {
    preview();
    h.state.reviews[0].trigger = "cron";
    expect(
      await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full"), onExisting: "supersede_if_unhealthy", scheduled: true })
    ).toMatchObject({ outcome: "skipped", reason: "exists" });
    h.state.reviews[0].trigger = "manual";
    h.state.reviews[0].factsJson = { coverage: { complete: true } };
    expect(
      await runCoachReview({ trigger: "cron", kind: "live", now: NOW, generate, source: fixtureSource("full"), onExisting: "supersede_if_unhealthy", scheduled: true })
    ).toMatchObject({ outcome: "skipped", reason: "exists" });
  });
});
