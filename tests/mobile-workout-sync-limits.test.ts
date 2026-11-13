import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

// POST /api/mobile/workouts/sync under load and under poison (audit 2026-10,
// SEC-024). The watch drains its whole queue in one POST and drops every item
// on any 2xx, so: big real sessions sync whole, one bad item never sinks the
// batch, and a database outage still fails the request (the queue is kept).

vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => ({ id: "sess-1", deviceType: "apple_watch" })),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/planner", () => ({ markPlannedDone: vi.fn(async () => null) }));
vi.mock("@/lib/notification-prefs", () => ({ getNotificationPrefs: vi.fn(async () => ({ prCelebration: false })) }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(), pushConfigured: vi.fn(() => false) }));
vi.mock("@/lib/prs", () => ({ detectAndRecordPRs: vi.fn(async () => []) }));
vi.mock("@/lib/strava", () => ({ buildStreamMetrics: vi.fn(() => ({})) }));
vi.mock("@/lib/user-exercises", () => ({ ensureUserExercisesLoaded: vi.fn(async () => {}) }));
vi.mock("@/lib/mobile-summary", () => ({
  buildHeroMetrics: vi.fn(async () => ({ streakDays: 1 })),
  buildRoutineCoda: vi.fn(async () => null),
}));
vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: vi.fn(async () => "America/Bogota") }));

type Row = { id: string } & Record<string, unknown>;
const { db } = vi.hoisted(() => {
  const db = {
    rows: [] as Array<{ id: string } & Record<string, unknown>>,
    seq: 0,
    // externalId → how create should fail
    poison: new Map<string, "validation-full" | "validation-always" | "outage" | "validation-update">(),
  };
  return { db };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    trail: { findMany: vi.fn(async () => []) },
    workoutLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.externalId != null && db.rows.some((r) => r.externalId === data.externalId)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.0.0" });
        }
        const mode = db.poison.get(String(data.externalId));
        const minimal = !!(data.metricsData as { syncFallback?: unknown } | null)?.syncFallback;
        if (mode === "outage") {
          throw new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: "P1001", clientVersion: "7.0.0" });
        }
        if (mode === "validation-always" || (mode === "validation-full" && !minimal)) {
          throw new Prisma.PrismaClientValidationError("Invalid value for argument", { clientVersion: "7.0.0" });
        }
        const row: Row = { id: `w${++db.seq}`, ...data };
        db.rows.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { externalSource_externalId: { externalId: string } } }) =>
        db.rows.find((r) => r.externalId === where.externalSource_externalId.externalId) ?? null),
      update: vi.fn(async ({ where, data }: { where: { externalSource_externalId: { externalId: string } }; data: Record<string, unknown> }) => {
        const id = where.externalSource_externalId.externalId;
        if (db.poison.get(id) === "validation-update") {
          throw new Prisma.PrismaClientValidationError("Invalid value for argument", { clientVersion: "7.0.0" });
        }
        const row = db.rows.find((r) => r.externalId === id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

import { POST } from "@/app/api/mobile/workouts/sync/route";
import { SYNC_LIMITS } from "@/lib/workout-sync-limits";

function syncRequest(payload: unknown) {
  return new NextRequest("http://localhost/api/mobile/workouts/sync", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "content-type": "application/json", authorization: "Bearer t" },
  });
}
const item = (externalId: string, extra: Record<string, unknown> = {}) => ({
  externalId, externalSource: "app_watch", startedAt: "2026-10-18T07:00:00.000Z",
  durationMinutes: 45, workoutType: "walk", ...extra,
});
const hikePoints = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ lat: 4.6 + i * 1e-6, lng: -74.05 - i * 1e-6, alt: 2600 + (i % 50), t: i }));

beforeEach(() => {
  db.rows.length = 0;
  db.seq = 0;
  db.poison.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("big real sessions sync whole", () => {
  it("43,200 route points (a 12-hour hike at 1 Hz, compact encoding) are stored untouched — the watch's full-precision encoding of the same hike is ~5 MB and is refused by Vercel before the app; splitting the drain is the watch's fix (followups)", async () => {
    const points = hikePoints(43_200);
    const res = await POST(syncRequest({ items: [item("hike-12h", { workoutType: "hike", durationMinutes: 720, routeData: { points } })] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.itemIssues).toEqual([]);
    const stored = db.rows[0].routeData as { points: unknown[] };
    expect(stored.points).toHaveLength(43_200);
    expect((db.rows[0].metricsData as { syncTrimmed?: unknown } | null)?.syncTrimmed).toBeUndefined();
  });

  it("a 120-item queue drain syncs every item", async () => {
    const items = Array.from({ length: 120 }, (_, i) => item(`q-${i}`));
    const res = await POST(syncRequest({ items }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(120);
    expect(body.total).toBe(120);
    expect(body.itemIssues).toEqual([]);
    expect(db.rows).toHaveLength(120);
  });

  it("an over-cap route is downsampled, kept, and the trim is reported and recorded", async () => {
    const points = Array.from({ length: SYNC_LIMITS.maxRoutePoints + 5_000 }, (_, i) => ({ lat: 4.6, lng: -74, t: i }));
    const res = await POST(syncRequest({ items: [item("huge", { workoutType: "hike", routeData: { points } })] }));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.itemIssues).toEqual([
      { index: 0, externalId: "huge", action: "trimmed", reasons: [`routePoints:${points.length}->${SYNC_LIMITS.maxRoutePoints}`] },
    ]);
    expect((db.rows[0].routeData as { points: unknown[] }).points).toHaveLength(SYNC_LIMITS.maxRoutePoints);
    expect((db.rows[0].metricsData as { syncTrimmed: unknown }).syncTrimmed).toEqual({
      routePoints: { from: points.length, to: SYNC_LIMITS.maxRoutePoints },
    });
  });
});

describe("one poison item never sinks the batch", () => {
  it("good items are stored and each bad one is reported — trimmed, stored minimal, or rejected", async () => {
    db.poison.set("refused-json", "validation-full");
    db.poison.set("refused-always", "validation-always");
    const res = await POST(
      syncRequest({
        items: [
          item("good-1"),
          item("malformed", { durationMinutes: "abc", stepCount: 1e15, description: "nul\u0000here" }),
          item("refused-json", { metricsData: { bad: true } }),
          "not an item",
          item("refused-always"),
          item("good-2"),
        ],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const stored = db.rows.map((r) => r.externalId);
    expect(stored).toEqual(expect.arrayContaining(["good-1", "good-2", "malformed", "refused-json"]));
    expect(stored).not.toContain("refused-always");
    expect(body.created).toBe(4);
    expect(body.total).toBe(6);

    type Issue = { index: number; externalId: string | null; action: string; reasons: string[] };
    const byIndex: Record<number, Issue> = Object.fromEntries((body.itemIssues as Issue[]).map((i) => [i.index, i]));
    expect(byIndex[1]).toMatchObject({ externalId: "malformed", action: "trimmed" });
    expect(byIndex[1].reasons).toEqual(expect.arrayContaining(["nul_removed", "durationMinutes:invalid", "stepCount:out_of_range"]));
    expect(byIndex[2]).toMatchObject({ externalId: "refused-json", action: "stored_minimal" });
    expect(byIndex[3]).toMatchObject({ externalId: null, action: "rejected", reasons: ["not_an_object"] });
    expect(byIndex[4]).toMatchObject({ externalId: "refused-always", action: "rejected" });
    expect(byIndex[0]).toBeUndefined();
    expect(byIndex[5]).toBeUndefined();

    // The minimal row keeps the session's facts and says why it is minimal.
    const minimal = db.rows.find((r) => r.externalId === "refused-json")!;
    expect(minimal.durationMinutes).toBe(45);
    expect(minimal.metricsData).toMatchObject({ syncFallback: { reason: "validation" } });
  });

  it("a database outage is NOT an item problem: 500, so the watch keeps its whole queue", async () => {
    db.poison.set("during-outage", "outage");
    const res = await POST(syncRequest({ items: [item("before"), item("during-outage"), item("after")] }));
    expect(res.status).toBe(500);
  });

  it("there is no item-count limit: a 300-item drain stores every item (the byte cap is the bound)", async () => {
    const items = Array.from({ length: 300 }, (_, i) => item(`b-${i}`));
    const res = await POST(syncRequest({ items }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(300);
    expect(body.itemIssues).toEqual([]);
  });

  it("the minimal fallback NEVER overwrites a good row that already exists (second-pass review)", async () => {
    const points = Array.from({ length: 2_880 }, (_, i) => ({ lat: 4.6, lng: -74, t: i }));
    await POST(syncRequest({ items: [item("hike-full", { workoutType: "hike", routeData: { points }, exercises: [{ name: "Hike" }], avgHeartRateBpm: 128 })] }));
    const before = { ...db.rows[0] };
    // The re-send's UPDATE is refused as bad data → fallback → minimal INSERT → duplicate → keep.
    db.poison.set("hike-full", "validation-update");
    const res = await POST(syncRequest({ items: [item("hike-full", { workoutType: "hike", metricsData: { bad: true } })] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemIssues).toEqual([expect.objectContaining({ externalId: "hike-full", action: "kept_existing" })]);
    expect(db.rows).toHaveLength(1);
    expect((db.rows[0].routeData as { points: unknown[] }).points).toHaveLength(2_880);
    expect(db.rows[0].exercises).toEqual(before.exercises);
    expect(db.rows[0].avgHeartRateBpm).toBe(128);
  });

  it("an unreadable start is reported as not stored, never filed under today", async () => {
    const res = await POST(syncRequest({ items: [item("bad-date", { startedAt: "-010000-01-01T00:00:00Z" }), item("ok")] }));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.itemIssues).toEqual([expect.objectContaining({ externalId: "bad-date", action: "rejected", reasons: expect.arrayContaining(["startedAt:invalid"]) })]);
  });

  it("a body over the platform limit is refused before it is read", async () => {
    const res = await POST(syncRequest({ items: [item("x", { description: "d".repeat(SYNC_LIMITS.maxBodyBytes) })] }));
    expect(res.status).toBe(413);
    expect(db.rows).toHaveLength(0);
  });
});
