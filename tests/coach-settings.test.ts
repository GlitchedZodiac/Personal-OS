import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Settings → Coach (docs/coach-plan.md §2.4, §2.7): sanitised, merged
// server-side, and owned by the server — the general settings PUT cannot
// overwrite it. Plus the month the budget counts and the new notification
// category.

const h = vi.hoisted(() => ({ stored: { data: {} as Record<string, unknown> }, upserts: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: {
      findUnique: async () => ({ data: h.stored.data }),
      upsert: async (args: { update: { data: Record<string, unknown> } }) => {
        h.upserts.push(args);
        h.stored.data = args.update.data;
        return { data: args.update.data };
      },
    },
  },
}));

import { PUT as putSettings } from "@/app/api/settings/route";
import {
  coachSettingsFrom,
  DEFAULT_COACH_SETTINGS,
  saveCoachSettings,
  sanitizeCoachSettings,
} from "@/lib/coach/settings";
import { monthStartUtc } from "@/lib/coach/spend";
import { CATEGORY_KEYS, DEFAULT_NOTIFICATION_PREFS, sanitizeNotificationPrefs } from "@/lib/notification-prefs";
import { MODEL_TIERS } from "@/lib/openai";

beforeEach(() => {
  h.stored.data = {};
  h.upserts.length = 0;
});

describe("Coach settings", () => {
  it("defaults: on, $3, sol, no journal quoting", () => {
    expect(DEFAULT_COACH_SETTINGS).toEqual({ enabled: true, monthlyBudgetUsd: 3, modelTier: "sol", journalExcerpts: false });
    expect(coachSettingsFrom({})).toEqual(DEFAULT_COACH_SETTINGS);
    expect(coachSettingsFrom(null)).toEqual(DEFAULT_COACH_SETTINGS);
  });

  it("keeps only what is well-formed, and clamps the budget", () => {
    expect(sanitizeCoachSettings({ enabled: "yes", modelTier: "gpt-9", monthlyBudgetUsd: "abc" })).toEqual({});
    expect(sanitizeCoachSettings({ monthlyBudgetUsd: 0 })).toEqual({ monthlyBudgetUsd: 0.5 });
    expect(sanitizeCoachSettings({ monthlyBudgetUsd: 1e6 })).toEqual({ monthlyBudgetUsd: 100 });
    expect(sanitizeCoachSettings({ monthlyBudgetUsd: "4.567", modelTier: "luna", journalExcerpts: true, enabled: false })).toEqual({
      monthlyBudgetUsd: 4.57,
      modelTier: "luna",
      journalExcerpts: true,
      enabled: false,
    });
  });

  it("every tier resolves to a model in the registry", () => {
    expect(Object.keys(MODEL_TIERS).sort()).toEqual(["luna", "sol", "terra"]);
    for (const model of Object.values(MODEL_TIERS)) expect(model).toMatch(/^gpt-/);
  });

  it("saves by merging the one key and leaving the rest of the blob alone", async () => {
    h.stored.data = { units: "metric", coach: { enabled: true, monthlyBudgetUsd: 5 } };
    const saved = await saveCoachSettings({ enabled: false, junk: 1 });
    expect(saved).toEqual({ ...DEFAULT_COACH_SETTINGS, monthlyBudgetUsd: 5, enabled: false });
    expect(h.stored.data).toEqual({ units: "metric", coach: saved });
  });

  it("the general settings PUT cannot overwrite it — a stale client copy is discarded", async () => {
    h.stored.data = { units: "metric", coach: { enabled: false, monthlyBudgetUsd: 2 } };
    const req = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({ units: "imperial", coach: { enabled: true, monthlyBudgetUsd: 99 } }),
    });
    const res = await putSettings(req);
    expect(res.status).toBe(200);
    expect(h.stored.data).toEqual({ units: "imperial", coach: { enabled: false, monthlyBudgetUsd: 2 } });
  });
});

describe("the budget's month", () => {
  it("starts at local midnight on the 1st, in his timezone", () => {
    expect(monthStartUtc(new Date("2026-10-12T00:00:00Z"), "America/Bogota").toISOString()).toBe("2026-10-01T05:00:00.000Z");
    // 22:00 on Oct 31 in Bogotá is already November in UTC — still October here
    expect(monthStartUtc(new Date("2026-11-01T03:00:00Z"), "America/Bogota").toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(monthStartUtc(new Date("2026-10-12T00:00:00Z"), "America/Chicago").toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});

describe("the Coach review notification category", () => {
  it("has its own switch, on by default", () => {
    expect(CATEGORY_KEYS).toContain("coachReview");
    expect(DEFAULT_NOTIFICATION_PREFS.coachReview).toBe(true);
    expect(sanitizeNotificationPrefs({ coachReview: false })).toEqual({ coachReview: false });
  });
});
