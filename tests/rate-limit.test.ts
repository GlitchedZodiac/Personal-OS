import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/security-settings", () => ({ getMarkerGeneration: vi.fn(async () => 0), bumpMarkerGeneration: vi.fn(async () => 1) }));
import { NextRequest } from "next/server";
import { clientBucket, createKnownDeviceToken, getClientIdentifier } from "@/lib/auth";
import { checkRateLimit as checkShared } from "@/lib/rate-limit";
import { memoryStore, type RateStore } from "@/lib/rate-limit-store";

// The PIN-door limiter (audit 2026-10, SEC-005; PLAN D2/D2b). These run on the
// memory mirror of the Postgres store — same rules; the Postgres store's
// atomic upsert is exercised against a real database in the session's live
// check (see the audit doc). Header rotation no longer buys guesses: IPv6 is
// bucketed by /64, a door-wide cap locks the door, and during a lock only a
// known device gets a real check.

let store: RateStore = memoryStore();
const checkRateLimit = (request: NextRequest, scope: string) => checkShared(request, scope, store);
const req = (headers: Record<string, string>) => new NextRequest("http://localhost/api/mobile/auth/session", { method: "POST", headers });
const fail = async (headers: Record<string, string>, scope: string) => (await checkRateLimit(req(headers), scope)).registerFailure();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  store = memoryStore();
});

describe("getClientIdentifier", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop, then 'unknown'", () => {
    expect(getClientIdentifier(req({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "10.0.0.1" }))).toBe("198.51.100.1");
    expect(getClientIdentifier(req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(getClientIdentifier(req({}))).toBe("unknown");
  });
});

describe("clientBucket — IPv6 by /64 (review of 3b)", () => {
  it("puts every address of one /64 in one bucket, and keeps IPv4 as is", () => {
    expect(clientBucket("2001:db8:1:2:aaaa::1")).toBe("2001:0db8:0001:0002::/64");
    expect(clientBucket("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:0db8:0001:0002::/64");
    expect(clientBucket("2001:db8:1:3::1")).toBe("2001:0db8:0001:0003::/64");
    expect(clientBucket("[2001:db8::1]")).toBe("2001:0db8:0000:0000::/64");
    expect(clientBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(clientBucket("203.0.113.7")).toBe("203.0.113.7");
  });
  it("so rotating within a /64 does not buy fresh per-client guesses", async () => {
    for (let i = 0; i < 5; i++) await fail({ "x-real-ip": `2001:db8:9:9::${(i + 1).toString(16)}` }, "v6");
    expect((await checkRateLimit(req({ "x-real-ip": "2001:db8:9:9::ffff" }), "v6")).allowed).toBe(false);
    expect((await checkRateLimit(req({ "x-real-ip": "2001:db8:9:a::1" }), "v6")).allowed).toBe(true);
  });
});

describe("checkRateLimit", () => {
  it("blocks one client after 5 failures and frees a different client", async () => {
    for (let i = 0; i < 5; i++) await fail({ "x-real-ip": "1.1.1.1" }, "a");
    expect((await checkRateLimit(req({ "x-real-ip": "1.1.1.1" }), "a")).allowed).toBe(false);
    expect((await checkRateLimit(req({ "x-real-ip": "1.1.1.2" }), "a")).allowed).toBe(true);
  });

  it("rotating the client header does not buy unlimited guesses: the global cap locks the door", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let blockedAt: number | null = null;
    for (let i = 0; i < 60; i++) {
      const check = await checkRateLimit(req({ "x-forwarded-for": `203.0.113.${i}` }), "g");
      if (!check.allowed) {
        blockedAt = i;
        break;
      }
      await check.registerFailure();
    }
    expect(blockedAt).toBe(50);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("50 failed attempts"));
    const blocked = await checkRateLimit(req({ "x-forwarded-for": "198.51.100.200" }), "g");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("exactly one failure reports that it tripped the lock", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let tripped = 0;
    for (let i = 0; i < 55; i++) if ((await fail({ "x-real-ip": `10.9.${i}.1` }, "t")).globalLockTriggered) tripped++;
    expect(tripped).toBe(1);
  });

  it("a success does NOT clear the global count (only time does) — a right PIN cannot reset an attacker's tally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 49; i++) await fail({ "x-real-ip": `10.1.${i}.1` }, "g2");
    await (await checkRateLimit(req({ "x-real-ip": "10.2.0.1" }), "g2")).reset(); // his successful login
    expect((await fail({ "x-real-ip": "10.3.0.1" }, "g2")).globalLockTriggered).toBe(true);
  });

  it("a success resets the client's own bucket", async () => {
    for (let i = 0; i < 4; i++) await fail({ "x-real-ip": "2.2.2.2" }, "r");
    await (await checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), "r")).reset();
    const again = await checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), "r");
    expect(again).toMatchObject({ allowed: true, clientClean: true });
    for (let i = 0; i < 4; i++) await fail({ "x-real-ip": "2.2.2.2" }, "r");
    expect((await checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), "r")).allowed).toBe(true); // 4 < 5 after the reset
  });

  it("during a global lock only a clean KNOWN DEVICE is exemptIfCorrect (PLAN D2b)", async () => {
    vi.stubEnv("AUTH_COOKIE_SECRET", "k".repeat(40));
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 50; i++) await fail({ "x-real-ip": `203.0.113.${i}` }, "x");
    expect(await checkRateLimit(req({ "x-real-ip": "198.51.100.1" }), "x")).toMatchObject({
      allowed: false, globalLocked: true, clientClean: true, knownDevice: false, exemptIfCorrect: false,
    });
    expect(await checkRateLimit(req({ "x-real-ip": "198.51.100.2", cookie: `pitaya_known_device=${createKnownDeviceToken()}` }), "x")).toMatchObject({
      allowed: false, globalLocked: true, clientClean: true, knownDevice: true, exemptIfCorrect: true,
    });
    expect(await checkRateLimit(req({ "x-real-ip": "203.0.113.3", cookie: `pitaya_known_device=${createKnownDeviceToken()}` }), "x")).toMatchObject({
      allowed: false, globalLocked: true, clientClean: false, exemptIfCorrect: false,
    });
  });

  it("D2: two 'instances' sharing one store share one budget (the in-memory version did not)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Two callers, as two serverless instances would be, over the SAME store.
    const instanceA = (h: Record<string, string>) => checkShared(req(h), "shared", store);
    const instanceB = (h: Record<string, string>) => checkShared(req(h), "shared", store);
    for (let i = 0; i < 25; i++) await (await instanceA({ "x-real-ip": `10.20.${i}.1` })).registerFailure();
    for (let i = 0; i < 25; i++) await (await instanceB({ "x-real-ip": `10.21.${i}.1` })).registerFailure();
    expect((await instanceA({ "x-real-ip": "10.22.0.1" })).globalLocked).toBe(true);
    expect((await instanceB({ "x-real-ip": "10.22.0.2" })).globalLocked).toBe(true);
  });
});
