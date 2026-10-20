import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Confirming a Coach move happens on the server (review round 3, item 3):
// POST …/moves/[n]/confirm loads the STORED move, refuses what can no longer
// be written, writes it through the existing lib paths and records it, in one
// transaction — and a second confirm returns the first result. PATCH only
// marks a move taken back. Plus the overview's lite form.

const h = vi.hoisted(() => {
  const state = {
    reviews: new Map<string, Record<string, unknown>>(),
    settings: { data: {} as Record<string, unknown> },
    plans: [] as Array<Record<string, unknown>>,
    reminders: [] as Array<Record<string, unknown>>,
    body: [] as Array<Record<string, unknown>>,
    locks: 0,
    seq: 0,
  };
  const prisma = {
    coachReview: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = state.reviews.get(where.id);
        return r ? structuredClone(r) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = state.reviews.get(where.id)!;
        Object.assign(r, data);
        return r;
      },
      findFirst: async () => [...state.reviews.values()].find((r) => r.kind === "live") ?? null,
    },
    userSettings: {
      findUnique: async () => ({ data: state.settings.data }),
      upsert: async ({ update }: { update: { data: Record<string, unknown> } }) => {
        state.settings.data = update.data;
        return { data: update.data };
      },
    },
    plannedWorkout: { create: async ({ data }: { data: Record<string, unknown> }) => (state.plans.push(data), data), deleteMany: async () => ({ count: 0 }) },
    reminder: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `rem${++state.seq}`, ...data }; state.reminders.push(row); return row; } },
    bodyMeasurement: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `bm${++state.seq}`, ...data }; state.body.push(row); return row; } },
    sequence: { findMany: async () => [{ id: "fx-seq-alpha", name: "Routine Alpha" }] },
    trail: { findMany: async () => [{ id: "fx-trail-ridge", name: "Ridge Loop", aliases: [] }] },
    $queryRaw: async () => {
      state.locks++;
      return [];
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { state, prisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/notification-prefs", () => ({ getNotificationPrefs: async () => ({ timeZone: "America/Chicago" }) }));
vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: async () => "America/Bogota" }));

import { POST as confirm } from "@/app/api/health/coach/reviews/[id]/moves/[n]/confirm/route";
import { PATCH } from "@/app/api/health/coach/reviews/[id]/route";
import { GET as overview } from "@/app/api/health/coach/reviews/route";
import { buildWeekFacts } from "@/lib/coach/facts";
import { loadWeekInput } from "@/lib/coach/source";
import type { WeekFacts } from "@/lib/coach/types";
import { fixtureSource } from "@/tests/fixtures/coach-week";

let facts: WeekFacts;

const moves = (next: string[]) => [
  { title: "Plan", why: "", cites: [], action: { kind: "plan_week", replaceWeek: false, days: [{ date: next[1], title: "Strength A", routineName: "Routine Alpha", targetWeightKg: 24 }] } },
  { title: "Targets", why: "", cites: [], action: { kind: "adjust_targets", proteinPct: 30, carbsPct: 45, fatPct: 25 } },
  { title: "Remind", why: "", cites: [], action: { kind: "set_reminder", title: "Weigh in", atLocal: `${next[1]}T07:00` } },
  { title: "Measure", why: "", cites: [], action: { kind: "log_measurement", fields: ["weightKg", "waistCm"] } },
  { title: "Yours", why: "", cites: [], action: { kind: "none" } },
];

function seed(id: string, extra: Record<string, unknown> = {}) {
  h.state.reviews.set(id, {
    id, kind: "live", status: "ready", weekStart: "2026-10-05", weekEnd: "2026-10-11", trigger: "cron", modelTier: "sol",
    model: "gpt-5.6-sol", factsJson: facts, reviewJson: { headline: "Volume up", verdict: "mixed", whatHappened: [], whatItMeans: [], moves: moves(facts.nextWeek.dates) },
    actionsJson: [], costUsd: 0.07, inputTokens: 1, outputTokens: 1, durationMs: 1, generatedAt: new Date("2026-10-12T00:00:00Z"),
    conversationId: null, error: null, ...extra,
  });
}

const post = (id: string, n: number, body: Record<string, unknown> = {}) =>
  confirm(new NextRequest(`http://localhost/x`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id, n: String(n) }) });
const patch = (id: string, action: Record<string, unknown>) =>
  PATCH(new NextRequest(`http://localhost/x`, { method: "PATCH", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  if (!facts) {
    facts = buildWeekFacts(await loadWeekInput(fixtureSource("full"), { weekStart: "2026-10-05", timeZone: "America/Bogota", now: new Date("2026-10-12T00:00:00Z") }));
  }
  h.state.reviews.clear();
  h.state.plans.length = 0;
  h.state.reminders.length = 0;
  h.state.body.length = 0;
  h.state.locks = 0;
  h.state.seq = 0;
  h.state.settings.data = { calorieTarget: 2500, proteinPct: 25, carbsPct: 50, fatPct: 25, units: "metric" };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T13:00:00Z")); // Monday 08:00 Bogotá: the planned Tuesday is still ahead
});

describe("POST …/moves/[n]/confirm — the one path that writes", () => {
  it("plans the STORED days under a row lock, without reminders, and records it", async () => {
    seed("rv1");
    const res = await post("rv1", 0, { days: [{ date: "2030-01-01", title: "client says otherwise" }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({ created: 1, weekDates: [facts.nextWeek.dates[1]] });
    expect(h.state.plans).toEqual([
      expect.objectContaining({ localDate: facts.nextWeek.dates[1], title: "Strength A", sequenceId: "fx-seq-alpha", targetWeightKg: 24, source: "coach" }),
    ]);
    expect(h.state.reminders).toHaveLength(0);
    expect(h.state.locks).toBe(1);
    expect(body.actions).toEqual([expect.objectContaining({ index: 0, kind: "plan_week" })]);
  });

  it("is idempotent: a second confirm writes nothing and returns the first result", async () => {
    seed("rv1");
    await post("rv1", 0);
    const again = await (await post("rv1", 0)).json();
    expect(again).toMatchObject({ duplicate: true, result: { created: 1 } });
    expect(h.state.plans).toHaveLength(1);
  });

  it("merges new targets into the settings, keeping what it replaced", async () => {
    seed("rv1");
    const body = await (await post("rv1", 1)).json();
    expect(body.result).toEqual({
      before: { calorieTarget: 2500, proteinPct: 25, carbsPct: 50, fatPct: 25 },
      after: { calorieTarget: 2500, proteinPct: 30, carbsPct: 45, fatPct: 25 },
    });
    expect(h.state.settings.data).toEqual({ calorieTarget: 2500, proteinPct: 30, carbsPct: 45, fatPct: 25, units: "metric" });
  });

  it("converts the reminder's local time on the SERVER, in his device's zone", async () => {
    seed("rv1");
    const body = await (await post("rv1", 2)).json();
    // 07:00 in Chicago (CDT, UTC−5) is 12:00Z
    expect(body.result).toMatchObject({ remindAt: `${facts.nextWeek.dates[1]}T12:00:00.000Z`, timeZone: "America/Chicago" });
    expect(h.state.reminders[0]).toMatchObject({ title: "Weigh in", body: "From the Coach", url: "/health/coach?review=rv1" });
  });

  it("writes a measurement only with every value he typed, validated", async () => {
    seed("rv1");
    expect((await post("rv1", 3, { values: { weightKg: 90.2 } })).status).toBe(400);
    expect((await post("rv1", 3, { values: { weightKg: 90.2, waistCm: -1 } })).status).toBe(400);
    const body = await (await post("rv1", 3, { values: { weightKg: 90.2, waistCm: 88, sneaky: 1 } })).json();
    expect(h.state.body).toEqual([expect.objectContaining({ weightKg: 90.2, waistCm: 88, source: "manual" })]);
    expect(h.state.body[0]).not.toHaveProperty("sneaky");
    expect(body.result).toMatchObject({ measurementId: "bm1", values: { weightKg: 90.2, waistCm: 88 } });
  });

  it("refuses what can no longer be written, a Test review, a text-only move, and an unknown id", async () => {
    seed("rv1");
    seed("t1", { kind: "test" });
    vi.setSystemTime(new Date("2026-10-15T15:00:00Z")); // the planned Tuesday has passed
    const stale = await post("rv1", 0);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatch(/has passed/);
    expect(h.state.plans).toHaveLength(0);
    expect((await post("t1", 0)).status).toBe(409);
    expect((await post("rv1", 4)).status).toBe(400);
    expect((await post("nope", 0)).status).toBe(404);
  });
});

describe("PATCH /api/health/coach/reviews/[id] — marking a move taken back", () => {
  it("marks the confirmed record undone, and refuses anything else", async () => {
    seed("rv1");
    await post("rv1", 1);
    const undone = await (await patch("rv1", { index: 1, undo: true })).json();
    expect(undone.actions[0].undoneAt).toEqual(expect.any(String));
    expect((await patch("rv1", { index: 1, undo: true })).status).toBe(409); // nothing left to undo
    expect((await patch("rv1", { index: 0, kind: "plan_week" })).status).toBe(400); // confirmations live at …/confirm
    // taken back, it can be confirmed again
    expect((await (await post("rv1", 1)).json()).actions).toHaveLength(2);
  });
});

describe("GET /api/health/coach/reviews?lite=1", () => {
  it("answers Today's row with the latest live summary and the switch only", async () => {
    seed("rv1");
    h.state.settings.data = { coach: { enabled: false } };
    const body = await (await overview(new NextRequest("http://localhost/api/health/coach/reviews?lite=1"))).json();
    expect(Object.keys(body).sort()).toEqual(["enabled", "latest"]);
    expect(body).toMatchObject({ enabled: false, latest: { id: "rv1", headline: "Volume up" } });
  });
});

