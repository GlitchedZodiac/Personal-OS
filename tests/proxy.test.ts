import { describe, expect, it } from "vitest";
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
});
