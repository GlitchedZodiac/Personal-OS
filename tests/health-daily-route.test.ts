import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// POST /api/health/daily — the Health Shortcut's push (2026-10-17). The mock
// table enforces the one thing that matters: `date` is unique, so an upsert
// either overwrites its day or creates it, never a second row.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  // Run post-response hooks inline so the heartbeat can be asserted.
  return { ...actual, after: vi.fn((fn: () => unknown) => void fn()) };
});

const recordSync = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ recordSync: (...a: unknown[]) => recordSync(...(a as [])) }));

type Row = Record<string, unknown> & { id: string; date: string };
const table = new Map<string, Row>();
let seq = 0;

// The route writes with one INSERT … ON CONFLICT ("date") per set of fields
// (lib/daily-activity.ts buildUpsertStatements; its SQL runs against real
// Postgres in the self-smoke). The mock applies the same contract: the
// statement's column list says which fields are written, $1 holds the
// dates, then one array per column, then received_at.
const CAMEL: Record<string, string> = {
  steps: "steps",
  active_energy_kcal: "activeEnergyKcal",
  resting_energy_kcal: "restingEnergyKcal",
  walking_running_distance_km: "walkingRunningDistanceKm",
  source: "source",
};

function applyUpsert(sql: string, params: unknown[]) {
  const cols = /\("id", "date"((?:, "[a-z_]+")*), "received_at"\)/.exec(sql)![1]
    .split(", ")
    .filter(Boolean)
    .map((c) => c.replaceAll('"', ""));
  const dates = params[0] as string[];
  const receivedAt = new Date(params[params.length - 1] as string);
  dates.forEach((date, i) => {
    const row: Row = table.get(date) ?? { id: `a${++seq}`, date };
    cols.forEach((col, j) => {
      row[CAMEL[col]] = (params[j + 1] as unknown[])[i];
    });
    row.receivedAt = receivedAt;
    table.set(date, row);
  });
  return dates.length;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => applyUpsert(sql, params)),
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const TOKEN = "test-token-0123456789abcdef";

async function post(body: unknown, auth: string | null = `Bearer ${TOKEN}`) {
  const { POST } = await import("@/app/api/health/daily/route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  const res = await POST(
    new NextRequest("http://localhost/api/health/daily", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

/** The last 7 days before 17 Oct, as the nightly Shortcut sends them. */
function week(stepsFor: (i: number) => number) {
  return Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(10 + i).padStart(2, "0")}`,
    steps: String(stepsFor(i)),
    active_energy_kcal: "400",
    resting_energy_kcal: "1800",
    walking_running_distance_km: "5.5",
    source: "mixed",
  }));
}

beforeEach(() => {
  table.clear();
  seq = 0;
  recordSync.mockClear();
  vi.stubEnv("HEALTH_INGEST_TOKEN", TOKEN);
});

describe("auth", () => {
  it("rejects a request with no token", async () => {
    const res = await post(week(() => 100), null);
    expect(res.status).toBe(401);
    expect(table.size).toBe(0);
  });

  it("rejects a wrong token", async () => {
    const res = await post(week(() => 100), "Bearer not-the-token-at-all-000");
    expect(res.status).toBe(401);
    expect(table.size).toBe(0);
  });

  it("rejects everything when HEALTH_INGEST_TOKEN is unset", async () => {
    vi.stubEnv("HEALTH_INGEST_TOKEN", "");
    const res = await post(week(() => 100));
    expect(res.status).toBe(401);
    expect(table.size).toBe(0);
  });

  it("does not record a heartbeat for an unauthenticated caller", async () => {
    await post(week(() => 100), null);
    expect(recordSync).not.toHaveBeenCalled();
  });
});

describe("validation", () => {
  it("400s on a body that is not JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/JSON/);
  });

  it("400s when no day is valid, and says why", async () => {
    const res = await post([{ date: "yesterday", steps: 5 }]);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/YYYY-MM-DD/);
    expect(table.size).toBe(0);
    expect(recordSync).toHaveBeenCalledWith(
      "health_shortcut",
      expect.objectContaining({ ok: false })
    );
  });

  it("stores the good days and reports the bad ones", async () => {
    const res = await post([...week(() => 100), { date: "2026-10-09", steps: "abc" }]);
    expect(res.status).toBe(200);
    expect(res.json.upserted).toBe(7);
    expect(res.json.rejected).toHaveLength(1);
    expect(res.json.rejected[0]).toMatchObject({ index: 7, date: "2026-10-09" });
    expect(table.size).toBe(7);
  });
});

describe("upsert", () => {
  it("returns the count of days upserted and records the heartbeat", async () => {
    const res = await post(week(() => 8000));
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ upserted: 7, skippedEmpty: [], rejected: [] });
    expect(res.json.dates).toEqual([
      "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13",
      "2026-10-14", "2026-10-15", "2026-10-16",
    ]);
    expect(table.get("2026-10-16")).toMatchObject({
      steps: 8000,
      activeEnergyKcal: 400,
      restingEnergyKcal: 1800,
      walkingRunningDistanceKm: 5.5,
      source: "mixed",
    });
    expect(recordSync).toHaveBeenCalledWith(
      "health_shortcut",
      expect.objectContaining({ ok: true, heartbeat: true })
    );
  });

  it("is idempotent: re-sending the week overwrites, never duplicates", async () => {
    await post(week(() => 8000));
    const firstIds = [...table.values()].map((r) => r.id).sort();

    // The next night: the same days again, with the last one now complete.
    const res = await post(week((i) => (i === 6 ? 9500 : 8000)));
    expect(res.json.upserted).toBe(7);
    expect(table.size).toBe(7);
    expect([...table.values()].map((r) => r.id).sort()).toEqual(firstIds);
    expect(table.get("2026-10-16")?.steps).toBe(9500);

    // And the identical payload a third time changes nothing.
    await post(week((i) => (i === 6 ? 9500 : 8000)));
    expect(table.size).toBe(7);
  });

  it("a locked-phone run (all empty) never overwrites good days", async () => {
    await post(week(() => 8000));
    const locked = week(() => 0).map((d) => ({
      ...d,
      steps: "",
      active_energy_kcal: "",
      resting_energy_kcal: "",
      walking_running_distance_km: "",
    }));
    const res = await post(locked);
    expect(res.status).toBe(200);
    expect(res.json.upserted).toBe(0);
    expect(res.json.skippedEmpty).toHaveLength(7);
    expect(res.json.note).toMatch(/locked/);
    expect(table.get("2026-10-16")?.steps).toBe(8000);
    // ...and it does not count as the pipeline being alive.
    expect(recordSync).toHaveBeenCalledTimes(1);
  });

  it("stamps receivedAt on every write", async () => {
    await post(week(() => 8000));
    const first = table.get("2026-10-16")?.receivedAt as Date;
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 5));
    await post(week(() => 8100));
    expect((table.get("2026-10-16")?.receivedAt as Date).getTime()).toBeGreaterThan(first.getTime());
  });

  it("a push of one metric leaves the others alone (the history Shortcut)", async () => {
    await post(week(() => 8000));
    const res = await post(
      week(() => 0).map((d) => ({ date: d.date, walking_running_distance_km: "7,25" }))
    );
    expect(res.json.upserted).toBe(7);
    expect(table.get("2026-10-16")).toMatchObject({
      steps: 8000,
      activeEnergyKcal: 400,
      restingEnergyKcal: 1800,
      walkingRunningDistanceKm: 7.25,
      source: "mixed",
    });
  });

  it("a key sent empty clears that field — the nightly run still overwrites the day", async () => {
    await post(week(() => 8000));
    const res = await post(week(() => 9000).map((d) => ({ ...d, resting_energy_kcal: "" })));
    expect(res.json.upserted).toBe(7);
    expect(table.get("2026-10-16")).toMatchObject({ steps: 9000, restingEnergyKcal: null });
  });

  it("takes ten years of one metric in one push", async () => {
    const days = Array.from({ length: 3650 }, (_, i) => ({
      date: new Date(Date.UTC(2016, 9, 18 + i)).toISOString().slice(0, 10),
      steps: String(5000 + (i % 7) * 100),
    }));
    const res = await post(days);
    expect(res.status).toBe(200);
    expect(res.json.upserted).toBe(3650);
    expect(table.size).toBe(3650);
  });
});
