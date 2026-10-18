import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, getClientIdentifier } from "@/lib/auth";

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

  it("a success resets both the client and the global bucket", () => {
    const scope = `r-${Math.random()}`;
    const c = checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope);
    for (let i = 0; i < 4; i++) c.registerFailure();
    c.reset();
    const again = checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope);
    expect(again.allowed).toBe(true);
    for (let i = 0; i < 4; i++) again.registerFailure();
    expect(checkRateLimit(req({ "x-real-ip": "2.2.2.2" }), scope).allowed).toBe(true); // 4 < 5 after the reset
  });
});
