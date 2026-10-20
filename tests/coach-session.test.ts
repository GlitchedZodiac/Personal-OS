import { beforeEach, describe, expect, it, vi } from "vitest";

// "Talk to this review" (docs/coach-plan.md §2.5): the chat is created
// LAZILY on the first tap, in one transaction, named so the AI namer leaves
// it alone, and the stream route's lookup gives that chat — and only that
// chat — the review's facts. Plus the planner's new optional source.

const h = vi.hoisted(() => {
  const state = {
    reviews: new Map<string, Record<string, unknown>>(),
    conversations: [] as Array<Record<string, unknown>>,
    messages: [] as Array<Record<string, unknown>>,
    plans: [] as Array<Record<string, unknown>>,
    txRuns: 0,
    findByConversation: 0,
  };
  const prisma = {
    coachReview: {
      findUnique: async ({ where }: { where: { id?: string; conversationId?: string } }) => {
        if (where.conversationId !== undefined) {
          state.findByConversation++;
          return [...state.reviews.values()].find((r) => r.conversationId === where.conversationId) ?? null;
        }
        return state.reviews.get(where.id as string) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = state.reviews.get(where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    chatConversation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `c${state.conversations.length + 1}`, ...data };
        state.conversations.push(row);
        return row;
      },
    },
    chatMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.messages.push(data);
        return data;
      },
    },
    plannedWorkout: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.plans.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.txRuns++;
      return fn(prisma);
    },
  };
  return { state, prisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));

import { buildCoachChatContext, coachChatContext } from "@/lib/coach/chat-context";
import { conversationTitle, ensureReviewConversation } from "@/lib/coach/conversation";
import { buildWeekFacts } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import { planWeek } from "@/lib/planner";
import { fixtureSource } from "@/tests/fixtures/coach-week";

const NOW = new Date("2026-10-12T13:00:00Z");

function seed(id: string, extra: Record<string, unknown> = {}) {
  h.state.reviews.set(id, {
    id,
    kind: "live",
    status: "ready",
    weekStart: "2026-10-05",
    weekEnd: "2026-10-11",
    markdown: "# More training, protein still short\n## What happened\n- 6 sessions [f4]",
    conversationId: null,
    factsJson: null,
    ...extra,
  });
}

beforeEach(() => {
  h.state.reviews.clear();
  h.state.conversations.length = 0;
  h.state.messages.length = 0;
  h.state.plans.length = 0;
  h.state.txRuns = 0;
  h.state.findByConversation = 0;
});

describe("the review's chat is created on the first tap", () => {
  it("creates the chat, its first message and the link in one transaction", async () => {
    seed("rv1");
    const result = await ensureReviewConversation("rv1", NOW);
    expect(result).toEqual({ ok: true, conversationId: "c1", created: true });
    expect(h.state.txRuns).toBe(1);
    expect(h.state.conversations[0]).toMatchObject({
      title: "Coach · Oct 5 – Oct 11",
      titleSource: "user", // writeAiTitle only renames "auto" titles
      lastMessageAt: NOW,
    });
    expect(h.state.messages[0]).toMatchObject({
      role: "assistant",
      conversationId: "c1",
      content: expect.stringContaining("# More training"),
      meta: { source: "coach", reviewId: "rv1" },
    });
    expect(h.state.reviews.get("rv1")!.conversationId).toBe("c1");
  });

  it("the second tap opens the same chat and creates nothing", async () => {
    seed("rv1", { conversationId: "c9" });
    expect(await ensureReviewConversation("rv1", NOW)).toEqual({ ok: true, conversationId: "c9", created: false });
    expect(h.state.conversations).toHaveLength(0);
    expect(h.state.txRuns).toBe(0);
  });

  it("refuses a test review, an unwritten review, and an unknown id", async () => {
    seed("t1", { kind: "test" });
    seed("g1", { status: "generating", markdown: null });
    expect(await ensureReviewConversation("t1")).toEqual({ ok: false, error: "test_review" });
    expect(await ensureReviewConversation("g1")).toEqual({ ok: false, error: "not_ready" });
    expect(await ensureReviewConversation("nope")).toEqual({ ok: false, error: "not_found" });
    expect(h.state.conversations).toHaveLength(0);
  });

  it("names the chat by its week", () => {
    expect(conversationTitle("2026-09-28", "2026-10-04")).toBe("Coach · Sep 28 – Oct 4");
  });
});

describe("what a review's chat knows", () => {
  it("carries the review and the facts by id — without provenance UUIDs", async () => {
    const input = await loadWeekInput(fixtureSource("full"), {
      weekStart: "2026-10-05",
      timeZone: "America/Bogota",
      now: new Date("2026-10-12T00:00:00Z"),
    });
    const facts = buildWeekFacts(input);
    const ctx = buildCoachChatContext({ id: "rv1", weekStart: "2026-10-05", weekEnd: "2026-10-11", markdown: "# Headline", factsJson: facts });
    expect(ctx.reviewId).toBe("rv1");
    expect(ctx.context).toContain("COACH REVIEW CONTEXT");
    expect(ctx.context).toContain("# Headline");
    expect(ctx.context).toContain('"id":"f1"');
    expect(ctx.context).toContain("nothing is written without his tap");
    expect(ctx.context).not.toContain('"ids"'); // provenance arrays stay on the stored facts
    expect(ctx.context).not.toContain("fx-w1"); // and no row id rides in a note either
  });

  it("an ordinary chat gets nothing — and no chat id means no query at all", async () => {
    expect(await coachChatContext(null)).toBeNull();
    expect(h.state.findByConversation).toBe(0);
    expect(await coachChatContext("c-ordinary")).toBeNull();
    expect(h.state.findByConversation).toBe(1);
    seed("rv1", { conversationId: "c-coach" });
    const ctx = await coachChatContext("c-coach");
    expect(ctx?.reviewId).toBe("rv1");
    expect(ctx?.context).toContain("THE FACTS:\n[]"); // unreadable facts degrade to an empty list
  });
});

describe("the planner's optional source", () => {
  it("defaults to chat and records coach when asked", async () => {
    await planWeek({ days: [{ date: "2026-10-13", title: "Strength A" }], timeZone: "America/Bogota" });
    await planWeek({ days: [{ date: "2026-10-14", title: "Ridge Loop" }], timeZone: "America/Bogota", source: "coach" });
    expect(h.state.plans.map((p) => p.source)).toEqual(["chat", "coach"]);
  });
});
