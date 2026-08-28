import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

// The dedupe contract under test: (externalSource, externalId) is DB-unique
// and the route resolves a lost create race (P2002) into an update. The mock
// models the constraint's atomicity — the key check-and-set inside create is
// synchronous, so concurrent creates get exactly one winner, like Postgres.

vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => ({
    id: "sess-1",
    deviceType: "apple_watch",
  })),
}));

type Row = { id: string } & Record<string, unknown>;
const rows: Row[] = [];
const byKey = new Map<string, Row>();
let seq = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workoutLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key =
          data.externalId != null
            ? `${data.externalSource}|${data.externalId}`
            : null;
        if (key && byKey.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`externalSource`,`externalId`)",
            { code: "P2002", clientVersion: "7.0.0" }
          );
        }
        const row: Row = { id: `w${++seq}`, ...data };
        rows.push(row);
        if (key) byKey.set(key, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            externalSource_externalId: {
              externalSource: string;
              externalId: string;
            };
          };
          data: Record<string, unknown>;
        }) => {
          const k = where.externalSource_externalId;
          const row = byKey.get(`${k.externalSource}|${k.externalId}`);
          if (!row) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Record to update not found.",
              { code: "P2025", clientVersion: "7.0.0" }
            );
          }
          Object.assign(row, data);
          return row;
        }
      ),
    },
  },
}));

vi.mock("@/lib/prs", () => ({
  detectAndRecordPRs: vi.fn(async () => []),
}));

vi.mock("@/lib/strava", () => ({
  buildStreamMetrics: vi.fn(() => ({})),
}));

vi.mock("@/lib/mobile-summary", () => ({
  buildHeroMetrics: vi.fn(async () => ({ streakDays: 1 })),
  buildRoutineCoda: vi.fn(async () => null),
}));

vi.mock("@/lib/server-timezone", () => ({
  getUserTimeZone: vi.fn(async () => "America/Bogota"),
}));

import { POST } from "@/app/api/mobile/workouts/sync/route";

function syncRequest(items: unknown[]) {
  return new NextRequest("http://localhost/api/mobile/workouts/sync", {
    method: "POST",
    body: JSON.stringify({ items }),
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
    },
  });
}

function walkItem(externalId: string | undefined, extra?: Record<string, unknown>) {
  return {
    externalId,
    externalSource: "app_watch",
    startedAt: "2026-08-28T12:00:00Z",
    durationMinutes: 41,
    workoutType: "walk",
    caloriesBurned: 166,
    ...extra,
  };
}

beforeEach(() => {
  rows.length = 0;
  byKey.clear();
  seq = 0;
});

describe("POST /api/mobile/workouts/sync dedupe", () => {
  it("a retry of an already-synced item lands as an update, one row", async () => {
    const first = await POST(syncRequest([walkItem("ext-1")]));
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.created).toBe(1);
    expect(firstBody.updated).toBe(0);

    const second = await POST(syncRequest([walkItem("ext-1", { caloriesBurned: 170 })]));
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.created).toBe(0);
    expect(secondBody.updated).toBe(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].caloriesBurned).toBe(170);
  });

  it("two CONCURRENT posts of the same externalId produce exactly one row", async () => {
    const [a, b] = await Promise.all([
      POST(syncRequest([walkItem("ext-race")])),
      POST(syncRequest([walkItem("ext-race")])),
    ]);
    const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // One winner creates, the loser resolves into an update — never two rows.
    expect(bodyA.created + bodyB.created).toBe(1);
    expect(bodyA.updated + bodyB.updated).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("items without externalId are never deduped", async () => {
    const res = await POST(
      syncRequest([walkItem(undefined), walkItem(undefined)])
    );
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it("strips routeData from stationary types and keeps it on GPS types", async () => {
    const route = { summaryPolyline: "abc", points: [{ lat: 1, lng: 2, t: 0 }] };
    const res = await POST(
      syncRequest([
        { ...walkItem("ext-free"), workoutType: "freestyle", routeData: route },
        { ...walkItem("ext-hike"), workoutType: "hike", routeData: route },
      ])
    );
    const body = await res.json();
    expect(body.strippedRoutes).toBe(1);

    const freestyle = rows.find((r) => r.externalId === "ext-free");
    const hike = rows.find((r) => r.externalId === "ext-hike");
    expect(freestyle?.routeData).toBe(Prisma.DbNull);
    expect(hike?.routeData).toEqual(route);
  });

  it("keeps the frozen response contract", async () => {
    const res = await POST(syncRequest([walkItem("ext-contract")]));
    const body = await res.json();
    for (const key of ["created", "updated", "total", "prs", "summary", "routine"]) {
      expect(body).toHaveProperty(key);
    }
    expect(body.total).toBe(1);
  });
});
