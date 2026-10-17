import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// POST /api/mobile/health/activity — the iPhone app's own Health activity
// push (2026-10-17). Same day rules as the Shortcut's route; the device
// session is the credential.

let sessionValid = true;
vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => (sessionValid ? { id: "sess-1", deviceType: "iphone" } : null)),
}));

const executed: { sql: string; params: unknown[] }[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      executed.push({ sql, params });
      return (params[0] as unknown[]).length;
    }),
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/mobile/health/activity/route");
  const res = await POST(
    new NextRequest("http://localhost/api/mobile/health/activity", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer device-token" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  sessionValid = true;
  executed.length = 0;
});

describe("POST /api/mobile/health/activity", () => {
  it("needs a device session", async () => {
    sessionValid = false;
    const res = await post({ days: [{ date: "2026-10-16", steps: 100 }] });
    expect(res.status).toBe(401);
    expect(executed).toHaveLength(0);
  });

  it("stores what the app sends — and only the keys it sends", async () => {
    // The app's encoder leaves a nil metric out of the JSON entirely.
    const res = await post({
      days: [
        { date: "2026-10-15", steps: 9120, active_energy_kcal: 512.4, resting_energy_kcal: 1890.2, walking_running_distance_km: 6.41 },
        { date: "2026-10-16", steps: 3291, walking_running_distance_km: 2.44 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      upserted: 2,
      skipped: 0,
      rejected: 0,
      firstDate: "2026-10-15",
      lastDate: "2026-10-16",
    });
    // Two field-sets, two statements; the partial day never names kcal.
    expect(executed).toHaveLength(2);
    const partial = executed.find((e) => (e.params[0] as string[]).includes("2026-10-16"))!;
    expect(partial.sql).toContain('"steps", "walking_running_distance_km", "received_at"');
    expect(partial.sql).not.toContain("active_energy_kcal");
  });

  it("takes a whole history in one push", async () => {
    const days = Array.from({ length: 2000 }, (_, i) => ({
      date: new Date(Date.UTC(2021, 0, 1 + i)).toISOString().slice(0, 10),
      steps: 4000 + i,
    }));
    const res = await post({ days });
    expect(res.json.upserted).toBe(2000);
    expect(res.json.firstDate).toBe("2021-01-01");
  });

  it("counts empty days and bad days instead of failing the push", async () => {
    const res = await post({
      days: [
        { date: "2026-10-14", steps: 0 },
        { date: "2026-13-01", steps: 50 },
        { date: "2026-10-16", steps: 7000 },
      ],
    });
    expect(res.json).toMatchObject({ upserted: 1, skipped: 1, rejected: 1 });
  });

  it("400s on a body that is not a list of days", async () => {
    expect((await post("nope")).status).toBe(400);
    expect((await post({ days: [] })).status).toBe(400);
  });
});
