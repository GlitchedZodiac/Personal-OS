import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, clientBucket, createKnownDeviceToken, getClientIdentifier } from "@/lib/auth";

// SEC-005 (audit 2026-10): header rotation used to reset the login limiter;
// a global per-scope cap now makes that pointless, and the platform's
// x-real-ip is preferred over a client-supplied x-forwarded-for.

function req(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/mobile/auth/session", { method: "POST", headers });
}

afterEach(() => vi.restoreAllMocks());

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
  it("so rotating within a /64 does not buy fresh per-client guesses", () => {
    const scope = `v6-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(req({ "x-real-ip": `2001:db8:9:9::${(i + 1).toString(16)}` }), scope).registerFailure();
    expect(checkRateLimit(req({ "x-real-ip": "2001:db8:9:9::ffff" }), scope).allowed).toBe(false);
    expect(checkRateLimit(req({ "x-real-ip": "2001:db8:9:a::1" }), scope).allowed).toBe(true);
  });
});

describe("checkRateLimit", () => {
  it("blocks one client after 5 failures and frees a different client", () => {
    const scope = `t-${Math.random()}`;
    const a = checkRateLimit(req({ "x-real-ip": "1.1.1.1" }), scope);
    for (let i = 0; i < 5; i++) a.registerFailure();
    expect(checkRateLimit(req({ "x-real-ip": "1.1.1.1" }), scope).allowed).toBe(false);
    expect(checkRateLimit(req({ "x-real-ip": "1.1.1.2" }), scope).allowed).toBe(true);
  });

  it("rotating the client header no longer buys unlimited guesses: the global cap locks the scope", () => {
    const scope = `g-${Math.random()}`;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let blockedAt: number | null = null;
    for (let i = 0; i < 60; i++) {
      const ip = `203.0.113.${i}`; // a fresh "client" every time, 1 failure each
      const check = checkRateLimit(req({ "x-forwarded-for": ip }), scope);
      if (!check.allowed) {
        blockedAt = i;
        break;
      }
      check.registerFailure();
    }
    expect(blockedAt).toBe(50);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("50 failed attempts"));
    const blocked = checkRateLimit(req({ "x-forwarded-for": "198.51.100.200" }), scope);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("a success does NOT clear the global count (only time does) — a right PIN cannot reset an attacker's tally", () => {
    const scope = `g2-${Math.random()}`;
    for (let i = 0; i < 49; i++) checkRateLimit(req({ "x-real-ip": `10.1.${i}.1` }), scope).registerFailure();
    checkRateLimit(req({ "x-real-ip": "10.2.0.1" }), scope).reset(); // his successful login
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = checkRateLimit(req({ "x-real-ip": "10.3.0.1" }), scope).registerFailure();
    expect(out.globalLockTriggered).toBe(true); // the 50th failure still trips it
  });

  it("a success resets the client's bucket; the global count decays on its own", () => {
    const scope = `r-${Math.random()}`;
    const c = checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope);
    for (let i = 0; i < 4; i++) c.registerFailure();
    c.reset();
    const again = checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope);
    expect(again.allowed).toBe(true);
    expect(again.clientClean).toBe(true);
    for (let i = 0; i < 4; i++) again.registerFailure();
    expect(checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope).allowed).toBe(true); // 4 < 5 after the reset
  });

  it("during a global lock only a clean KNOWN DEVICE is exemptIfCorrect (PLAN D2b)", () => {
    vi.stubEnv("AUTH_COOKIE_SECRET", "k".repeat(40));
    const scope = `x-${Math.random()}`;
    for (let i = 0; i < 50; i++) checkRateLimit(req({ "x-real-ip": `203.0.113.${i}` }), scope).registerFailure();
    const cleanUnknown = checkRateLimit(req({ "x-real-ip": "198.51.100.1" }), scope);
    expect(cleanUnknown).toMatchObject({ allowed: false, globalLocked: true, clientClean: true, knownDevice: false, exemptIfCorrect: false });
    const marked = checkRateLimit(req({ "x-real-ip": "198.51.100.2", cookie: `pitaya_known_device=${createKnownDeviceToken()}` }), scope);
    expect(marked).toMatchObject({ allowed: false, globalLocked: true, clientClean: true, knownDevice: true, exemptIfCorrect: true });
    const dirty = checkRateLimit(req({ "x-real-ip": "203.0.113.3", cookie: `pitaya_known_device=${createKnownDeviceToken()}` }), scope);
    expect(dirty).toMatchObject({ allowed: false, globalLocked: true, clientClean: false, exemptIfCorrect: false });
    vi.unstubAllEnvs();
    // The failure that trips the lock says so, with the configured numbers.
    const scope2 = `y-${Math.random()}`;
    let tripped = 0;
    for (let i = 0; i < 50; i++) {
      const out = checkRateLimit(req({ "x-real-ip": `10.9.${i}.1` }), scope2).registerFailure();
      if (out.globalLockTriggered) tripped++;
    }
    expect(tripped).toBe(1);
  });
});
