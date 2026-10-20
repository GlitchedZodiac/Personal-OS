import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// The global wrong-PIN lock is also a lever against Michael. During a lock
// only a KNOWN DEVICE (a browser carrying the signed marker a successful
// login sets — PLAN D2b) gets a real PIN check; every other caller, however
// many new IPs it brings, gets 429 and the PIN is never looked at (review of
// 3b). Tripping the lock raises a system alert; cap and window come from env.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((fn: () => unknown) => void fn()) };
});
const { notify } = vi.hoisted(() => ({
  notify: vi.fn(async (input: { category: string; title: string; body: string; tag?: string }) => {
    void input;
    return { status: "sent" };
  }),
}));
vi.mock("@/lib/notify", () => ({ notify }));
const { rows } = vi.hoisted(() => ({ rows: {} as Record<string, { pinHash: string }> }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authCredential: {
      findUnique: vi.fn(async () => rows.default ?? null),
      upsert: vi.fn(async ({ create }: { create: { pinHash: string } }) => { rows.default = { pinHash: create.pinHash }; return rows.default; }),
    },
  },
}));

import { attemptPin } from "@/lib/pin-attempt";
import { createKnownDeviceToken } from "@/lib/auth";
import { globalLoginLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");
const req = (ip: string, known = false) =>
  new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { "x-real-ip": ip, ...(known ? { cookie: `pitaya_known_device=${createKnownDeviceToken()}` } : {}) },
  });

beforeEach(() => {
  vi.stubEnv("RATE_LIMIT_STORE", "memory");
  vi.stubEnv("AUTH_COOKIE_SECRET", STRONG);
  vi.stubEnv("APP_AUTH_SECRET", STRONG);
  vi.stubEnv("APP_PIN", "2468");
  vi.stubEnv("AUTH_GLOBAL_MAX_FAILURES", "6");
  vi.stubEnv("AUTH_GLOBAL_WINDOW_MINUTES", "30");
  rows.default = { pinHash: hashPin("2468") };
  notify.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function floodUntilLocked(scope: string) {
  // Six distinct "clients", one wrong guess each → the global cap (6) trips.
  for (let i = 0; i < 6; i++) await attemptPin(req(`198.51.100.${i}`), scope, "0000");
}

describe("attemptPin under a global lock", () => {
  it("reads the cap and window from env", () => {
    expect(globalLoginLimits()).toMatchObject({ maxFailures: 6, windowMinutes: 30 });
    vi.stubEnv("AUTH_GLOBAL_MAX_FAILURES", "nonsense");
    vi.stubEnv("AUTH_GLOBAL_WINDOW_MINUTES", "0");
    expect(globalLoginLimits()).toMatchObject({ maxFailures: 50, windowMinutes: 60 });
  });

  it("tripping the lock raises one system alert that names the door", async () => {
    const scope = `alert-${Math.random()}`;
    await floodUntilLocked(scope);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ category: "systemAlerts", title: "Someone is hammering the PIN", tag: "pin-lockout" });
    expect(notify.mock.calls[0][0].body).toMatch(/6 wrong PINs/);
  });

  it("his own browser — the known-device marker, no wrong guesses of its own — still gets in with the right PIN", async () => {
    const scope = `exempt-${Math.random()}`;
    await floodUntilLocked(scope);
    expect(await attemptPin(req("203.0.113.9", true), scope, "2468")).toEqual({ status: "ok" });
  });

  it("during a lock, N NEW IPs without the marker get ZERO real PIN checks — the right PIN included", async () => {
    const scope = `bound-${Math.random()}`;
    await floodUntilLocked(scope);
    const lookups = vi.mocked(prisma.authCredential.findUnique);
    lookups.mockClear();
    for (let i = 0; i < 200; i++) {
      expect((await attemptPin(req(`2001:db8:${i.toString(16)}::1`), scope, i === 199 ? "2468" : "0000")).status).toBe("locked");
    }
    expect(lookups).not.toHaveBeenCalled(); // the stored PIN was never consulted
  });

  it("a forged or expired marker is no marker", async () => {
    const scope = `forged-${Math.random()}`;
    await floodUntilLocked(scope);
    const forged = new NextRequest("http://localhost/api/auth", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.50", cookie: "pitaya_known_device=eyJzdWIiOiJwaXRheWEta25vd24tZGV2aWNlIn0.forged" },
    });
    expect((await attemptPin(forged, scope, "2468")).status).toBe("locked");
  });

  it("a marked browser's wrong guess during a lock spends its exemption for the rest of the lock", async () => {
    const scope = `spend-${Math.random()}`;
    await floodUntilLocked(scope);
    expect((await attemptPin(req("203.0.113.77", true), scope, "0000")).status).toBe("locked");
    expect((await attemptPin(req("203.0.113.77", true), scope, "2468")).status).toBe("locked");
  });

  it("a client with its own failures in the window is locked out, correct PIN or not, marker or not", async () => {
    const scope = `dirty-${Math.random()}`;
    await attemptPin(req("203.0.113.5", true), scope, "0000");
    await floodUntilLocked(scope);
    expect((await attemptPin(req("203.0.113.5", true), scope, "2468")).status).toBe("locked");
  });

  it("without a lock the usual answers apply, and a success clears only that client", async () => {
    const scope = `plain-${Math.random()}`;
    expect(await attemptPin(req("1.1.1.1"), scope, "0000")).toEqual({ status: "wrong" });
    expect(await attemptPin(req("1.1.1.1"), scope, "2468")).toEqual({ status: "ok" });
    expect(notify).not.toHaveBeenCalled();
  });
});
