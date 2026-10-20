import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// GET /api/cron/coach-weekly (docs/coach-plan.md §2.8): constant-time,
// fail-closed auth; the week named by the clock; one notice per written
// review, one per paused week, none otherwise.

const h = vi.hoisted(() => ({
  run: vi.fn(),
  notify: vi.fn(async () => ({ status: "sent", sent: 1, failed: 0 })),
  settings: { enabled: true, monthlyBudgetUsd: 3, modelTier: "sol", journalExcerpts: false },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/coach/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coach/run")>()),
  runCoachReview: (...a: unknown[]) => h.run(...a),
}));
vi.mock("@/lib/coach/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/coach/settings")>()),
  getCoachSettings: async () => h.settings,
}));
vi.mock("@/lib/notify", () => ({ notify: (...a: unknown[]) => (h.notify as (...b: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: async () => "America/Bogota" }));

import { GET } from "@/app/api/cron/coach-weekly/route";
import { cronAuthorized } from "@/lib/coach/cron-auth";

const SECRET = "lane-b-synthetic-cron-secret";
const call = (auth?: string) =>
  GET(new NextRequest("http://localhost/api/cron/coach-weekly", auth ? { headers: { authorization: auth } } : {}));
const readyRow = { id: "rv1", status: "ready", reviewJson: { headline: "Volume up, protein slipped" }, costUsd: 0.07, error: null };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T00:00:00Z")); // Sunday 19:00 Bogotá
  h.run.mockReset();
  h.notify.mockClear();
  h.settings.enabled = true;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe("cronAuthorized", () => {
  it("accepts only the exact bearer, fails closed without a secret, and never throws on length", () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronAuthorized("Bearer", SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("GET /api/cron/coach-weekly", () => {
  it("401 without the secret, with a wrong one, and when CRON_SECRET is unset — nothing runs", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("reviews the week ending tonight and announces it once", async () => {
    h.run.mockResolvedValue({ outcome: "ran", review: readyRow });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, weekStart: "2026-10-05", reviewId: "rv1", status: "ready", pushed: "sent" });
    expect(h.run).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "cron", kind: "live", weekStart: "2026-10-05", onExisting: "supersede_if_unhealthy" })
    );
    expect(h.notify).toHaveBeenCalledWith({
      category: "coachReview",
      title: "The Coach · Oct 5 – Oct 11",
      body: "Volume up, protein slipped",
      url: "/health/coach?review=rv1",
      tag: "coach-review-2026-10-05",
      dedupeKey: "coach-review:2026-10-05",
    });
  });

  it("the Monday catch-up names the same week", async () => {
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z")); // Monday 07:00 Bogotá
    h.run.mockResolvedValue({ outcome: "skipped", reason: "exists", review: readyRow });
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toMatchObject({ skipped: "exists", weekStart: "2026-10-05" });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("switched off: no run, no notice", async () => {
    h.settings.enabled = false;
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ skipped: "coach off" });
    expect(h.run).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("paused by the budget: one notice for the week", async () => {
    h.run.mockResolvedValue({ outcome: "skipped", reason: "budget", spend: { blocked: true }, review: null });
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toMatchObject({ skipped: "budget", weekStart: "2026-10-05" });
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ category: "coachReview", title: "The Coach is paused", dedupeKey: "coach-paused:2026-10-05" })
    );
  });

  it("a failed run is reported, not announced", async () => {
    h.run.mockResolvedValue({ outcome: "ran", review: { ...readyRow, status: "failed", error: "model down", reviewJson: null } });
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toMatchObject({ ok: false, status: "failed", error: "model down", pushed: null });
    expect(h.notify).not.toHaveBeenCalled();
  });
});
