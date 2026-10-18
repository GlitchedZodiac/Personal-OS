import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// The global wrong-PIN lock is also a lever against Michael (review of 3a):
// a clean client with the CORRECT PIN still gets in during a lock; a wrong
// guess from a clean client spends its exemption; tripping the lock raises a
// system alert; the cap and window come from env.

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
import { globalLoginLimits } from "@/lib/auth";
import { hashPin } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");
const req = (ip: string) => new NextRequest("http://localhost/api/auth", { method: "POST", headers: { "x-real-ip": ip } });

beforeEach(() => {
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

  it("his own device — no wrong guesses of its own — still gets in with the correct PIN", async () => {
    const scope = `exempt-${Math.random()}`;
    await floodUntilLocked(scope);
    expect(await attemptPin(req("203.0.113.9"), scope, "2468")).toEqual({ status: "ok" });
  });

  it("the attacker's clean client gets one wrong guess, answered as locked, then is blocked for the lock", async () => {
    const scope = `spend-${Math.random()}`;
    await floodUntilLocked(scope);
    const first = await attemptPin(req("203.0.113.77"), scope, "0000");
    expect(first.status).toBe("locked"); // not "wrong": nothing learned
    const second = await attemptPin(req("203.0.113.77"), scope, "2468");
    expect(second.status).toBe("locked"); // even the right PIN now waits
  });

  it("a client with its own failures in the window is locked out, correct PIN or not", async () => {
    const scope = `dirty-${Math.random()}`;
    await attemptPin(req("203.0.113.5"), scope, "0000"); // one of the attacker's hops was 'us'
    await floodUntilLocked(scope);
    expect((await attemptPin(req("203.0.113.5"), scope, "2468")).status).toBe("locked");
  });

  it("without a lock the usual answers apply, and a success clears only that client", async () => {
    const scope = `plain-${Math.random()}`;
    expect(await attemptPin(req("1.1.1.1"), scope, "0000")).toEqual({ status: "wrong" });
    expect(await attemptPin(req("1.1.1.1"), scope, "2468")).toEqual({ status: "ok" });
    expect(notify).not.toHaveBeenCalled();
  });
});
