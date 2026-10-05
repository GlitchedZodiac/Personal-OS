import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn() }));

import { encryptBody } from "@/lib/renpho";
import { RenphoError, fetchRenphoRecords } from "@/lib/renpho-client";
import { type SyncRunSummary, renphoAlertFor } from "@/lib/renpho-sync";

const NOW = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const run = (over: Partial<SyncRunSummary> & { h: number }): SyncRunSummary => ({
  ok: true,
  alerted: false,
  error: null,
  startedAt: hoursAgo(over.h),
  ...over,
});

describe("renphoAlertFor", () => {
  const quiet = { lastRenphoAt: hoursAgo(20), undeliveredAppleHealth: [], now: NOW };

  it("stays silent while runs succeed", () => {
    expect(renphoAlertFor({ ...quiet, recentRuns: [run({ h: 1 }), run({ h: 25 })] })).toBeNull();
  });

  it("stays silent after two failures", () => {
    expect(
      renphoAlertFor({
        ...quiet,
        recentRuns: [run({ h: 1, ok: false }), run({ h: 2, ok: false }), run({ h: 3 })],
      })
    ).toBeNull();
  });

  it("alerts on the third failure in a row, naming the error", () => {
    const message = renphoAlertFor({
      ...quiet,
      recentRuns: [
        run({ h: 1, ok: false, error: "RENPHO login: code 40001 — wrong password" }),
        run({ h: 2, ok: false }),
        run({ h: 3, ok: false }),
        run({ h: 4 }),
      ],
    });
    expect(message).toContain("failed 3 times in a row");
    expect(message).toContain("wrong password");
  });

  it("does not repeat the alert within a day", () => {
    expect(
      renphoAlertFor({
        ...quiet,
        recentRuns: [
          run({ h: 1, ok: false }),
          run({ h: 2, ok: false, alerted: true }),
          run({ h: 3, ok: false }),
          run({ h: 4, ok: false }),
        ],
      })
    ).toBeNull();
  });

  it("alerts again once the cooldown has passed and it is still failing", () => {
    expect(
      renphoAlertFor({
        ...quiet,
        recentRuns: [
          run({ h: 1, ok: false }),
          run({ h: 25, ok: false }),
          run({ h: 49, ok: false, alerted: true }),
        ],
      })
    ).toContain("failed 3 times");
  });

  it("alerts when Apple Health has held a weigh-in for 48h that RENPHO never delivered", () => {
    const message = renphoAlertFor({
      recentRuns: [run({ h: 1 })], // the pull "works" — it just returns nothing new
      lastRenphoAt: hoursAgo(24 * 7),
      undeliveredAppleHealth: [hoursAgo(50), hoursAgo(72)],
      now: NOW,
    });
    expect(message).toContain("2 weigh-ins that RENPHO never delivered");
    expect(message).toContain("signed in");
  });

  it("gives RENPHO 48 hours before calling a weigh-in undelivered", () => {
    expect(
      renphoAlertFor({
        recentRuns: [run({ h: 1 })],
        lastRenphoAt: hoursAgo(24 * 7),
        undeliveredAppleHealth: [hoursAgo(30)],
        now: NOW,
      })
    ).toBeNull();
  });

  it("ignores Apple Health weigh-ins older than the last RENPHO reading", () => {
    expect(
      renphoAlertFor({
        recentRuns: [run({ h: 1 })],
        lastRenphoAt: hoursAgo(10),
        undeliveredAppleHealth: [hoursAgo(60)],
        now: NOW,
      })
    ).toBeNull();
  });
});

// A scripted stand-in for cloud.renpho.com that answers in their envelope.
function fakeCloud(script: (endpoint: string, headers: Record<string, string>) => unknown) {
  const calls: { endpoint: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const endpoint = String(url).replace("https://cloud.renpho.com/", "");
    const headers = init?.headers as Record<string, string>;
    calls.push({ endpoint, headers });
    const answer = script(endpoint, headers);
    if (answer instanceof Response) return answer;
    const data = answer === null ? "" : encryptBody(Buffer.from(JSON.stringify(answer)));
    return new Response(JSON.stringify({ code: 101, data }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const LOGIN = { login: { token: "tok", id: "__BIG__" } };
// Sent as a BARE 19-digit integer, exactly as their server does.
const loginBody = () =>
  new Response(
    JSON.stringify({
      code: 101,
      data: encryptBody(
        Buffer.from(JSON.stringify(LOGIN).replace('"__BIG__"', "6071354294872801152"))
      ),
    })
  );

describe("fetchRenphoRecords", () => {
  it("logs in, finds the table, and queries with the exact 19-digit user id", async () => {
    const { fetchImpl, calls } = fakeCloud((endpoint) => {
      if (endpoint.endsWith("user/login")) return loginBody();
      if (endpoint.endsWith("device/count")) {
        return { scale: [{ tableName: "measurements_info_0", count: 0 }] };
      }
      return [{ id: 1, weight: 82.75 }];
    });

    const records = await fetchRenphoRecords(
      { email: "a@b.c", password: "pw" },
      { fetchImpl }
    );
    expect(records).toEqual([{ id: 1, weight: 82.75 }]);
    // `count: 0` did not stop the pull, and the id survived JSON parsing.
    expect(calls.at(-1)!.headers.userId).toBe("6071354294872801152");
    expect(calls[0].headers).not.toHaveProperty("token");
  });

  it("pages until a short page, bounded by maxPages", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    let pages = 0;
    const script = (endpoint: string) => {
      if (endpoint.endsWith("user/login")) return loginBody();
      if (endpoint.endsWith("device/count")) return { scale: [{ tableName: "t" }] };
      pages++;
      return pages < 3 ? full : [{ id: "last" }];
    };

    const one = fakeCloud(script);
    expect(await fetchRenphoRecords({ email: "a", password: "b" }, { fetchImpl: one.fetchImpl })).toHaveLength(50);

    pages = 0;
    const all = fakeCloud(script);
    expect(
      await fetchRenphoRecords({ email: "a", password: "b" }, { fetchImpl: all.fetchImpl, maxPages: Infinity })
    ).toHaveLength(101);
  });

  it("probes the shards when reading another user's records", async () => {
    const { fetchImpl, calls } = fakeCloud((endpoint) => {
      if (endpoint.endsWith("user/login")) return loginBody();
      return null; // every shard empty
    });
    await expect(
      fetchRenphoRecords({ email: "svc", password: "pw", targetUserId: "42" }, { fetchImpl })
    ).rejects.toThrow("no measurement table found");
    // Never asked device/count — that only answers for the logged-in account.
    expect(calls.some((c) => c.endpoint.endsWith("device/count"))).toBe(false);
    expect(calls.filter((c) => c.endpoint.includes("queryBodyComposition"))).toHaveLength(16);
  });

  it("reports a rejected login by stage, without the password", async () => {
    const { fetchImpl } = fakeCloud(
      () => new Response(JSON.stringify({ code: 40001, msg: "account or password error" }))
    );
    const error = await fetchRenphoRecords(
      { email: "a@b.c", password: "hunter2" },
      { fetchImpl }
    ).catch((e) => e);
    expect(error).toBeInstanceOf(RenphoError);
    expect((error as RenphoError).stage).toBe("login");
    expect((error as Error).message).toContain("account or password error");
    expect((error as Error).message).not.toContain("hunter2");
  });

  it("names an undecryptable response instead of crashing on it", async () => {
    const { fetchImpl } = fakeCloud(
      () => new Response(JSON.stringify({ code: 101, data: "bm90LWVuY3J5cHRlZA==" }))
    );
    await expect(
      fetchRenphoRecords({ email: "a", password: "b" }, { fetchImpl })
    ).rejects.toThrow("could not be decrypted");
  });
});
