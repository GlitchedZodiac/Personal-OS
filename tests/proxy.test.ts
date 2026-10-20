import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// The API gate. The Health Shortcut's route is open (it checks its own
// bearer token) by EXACT path — its neighbours with the same prefix must
// stay behind the cookie.

function status(path: string, method = "GET") {
  const res = proxy(new NextRequest(`http://localhost${path}`, { method }));
  return res.status;
}

describe("proxy", () => {
  it("lets the Shortcut's ingest route through to verify its own token", () => {
    expect(status("/api/health/daily", "POST")).toBe(200);
  });

  it("keeps the routes that merely share its prefix gated", () => {
    expect(status("/api/health/daily-log")).toBe(401);
    expect(status("/api/health/daily-brief")).toBe(401);
    expect(status("/api/health/daily/extra")).toBe(401);
  });

  it("keeps the activity read API gated", () => {
    expect(status("/api/health/activity")).toBe(401);
  });

  it("still opens the existing self-authenticating prefixes", () => {
    expect(status("/api/mobile/health/daily", "POST")).toBe(200);
    expect(status("/api/cron/reminder-push")).toBe(200);
  });

  // SEC-009 (audit 2026-10): `/api/auth` is an EXACT entry now. As a prefix it
  // also opened /api/auth/update-pin, which must need the cookie too.
  it("opens the login itself but keeps the PIN-change route behind the cookie", () => {
    expect(status("/api/auth", "POST")).toBe(200);
    expect(status("/api/auth", "GET")).toBe(200);
    expect(status("/api/auth", "DELETE")).toBe(200);
    expect(status("/api/auth/update-pin", "POST")).toBe(401);
    expect(status("/api/authx")).toBe(401);
  });
});

// Review of 3a: production without its signing secrets answers a NAMED 503 on
// every route that needs them (cookie, device bearer, connector, OAuth) —
// never a bare 401 or an unnamed 500. Crons and the Health Shortcut keep
// working on their own secrets.
describe("proxy — production with a signing secret missing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("names the missing variables on gated and bearer routes, and lets the self-secret routes through", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["/api/health/summary", "/api/mobile/summary", "/api/mcp", "/api/oauth/token", "/api/auth"]) {
      const res = proxy(new NextRequest(`http://localhost${path}`, { method: "POST" }));
      expect(res.status, path).toBe(503);
      const body = await res.json();
      expect(body.missing).toEqual(["AUTH_COOKIE_SECRET", "APP_AUTH_SECRET"]);
      expect(body.error).toMatch(/APP_AUTH_SECRET is not set/);
    }
    expect(status("/api/cron/reminder-push")).toBe(200);
    expect(status("/api/health/daily", "POST")).toBe(200);
  });
});
