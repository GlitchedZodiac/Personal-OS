import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// /api/auth and /api/auth/update-pin (audit 2026-10): the PIN is checked
// against auth_credentials; production refuses LOUDLY while a signing secret
// is missing; a PIN change writes the row and nothing else.

const rows: Record<string, { pinHash: string }> = {};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authCredential: {
      findUnique: vi.fn(async () => rows.default ?? null),
      upsert: vi.fn(async ({ create, update }: { create: { pinHash: string }; update: { pinHash: string } }) => {
        rows.default = { pinHash: rows.default ? update.pinHash : create.pinHash };
        return rows.default;
      }),
    },
  },
}));

import { POST as login, GET as status } from "@/app/api/auth/route";
import { POST as changePin } from "@/app/api/auth/update-pin/route";
import { verifyAuthToken, verifyKnownDeviceToken } from "@/lib/auth";
import { hashPin } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");

function post(path: string, body: unknown, ip = "9.9.9.9") {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("RATE_LIMIT_STORE", "memory");
  delete rows.default;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_PIN", "2468");
  vi.stubEnv("AUTH_COOKIE_SECRET", STRONG);
  vi.stubEnv("APP_AUTH_SECRET", STRONG);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth", () => {
  it("503 naming the variable when AUTH_COOKIE_SECRET is missing in production — never a silent 401", async () => {
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    const res = await login(post("/api/auth", { pin: "2468" }, "1.2.3.4"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/AUTH_COOKIE_SECRET is not set/);
    expect(body.missing).toEqual(["AUTH_COOKIE_SECRET"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("AUTH_COOKIE_SECRET is not set"));
    const probe = await status(new NextRequest("http://localhost/api/auth"));
    expect(probe.status).toBe(503);
  });
  it("logs in against the stored row (seeded from APP_PIN on first use) and sets a verifiable cookie", async () => {
    const res = await login(post("/api/auth", { pin: "2468" }, "1.2.3.5"));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get("auth")?.value;
    expect(cookie).toBeTruthy();
    expect(verifyAuthToken(cookie)).toBe(true);
    // The known-device marker (PLAN D2b) rides every successful sign-in, and
    // is not usable as a session cookie.
    const marker = res.cookies.get("pitaya_known_device")?.value;
    expect(verifyKnownDeviceToken(marker)).toBe(true);
    expect(verifyAuthToken(marker)).toBe(false);
    expect(verifyKnownDeviceToken(cookie)).toBe(false);
    expect(rows.default?.pinHash.startsWith("scrypt$1$")).toBe(true);
    const wrong = await login(post("/api/auth", { pin: "0000" }, "1.2.3.5"));
    expect(wrong.status).toBe(401);
  });
  it("uses the row, not the env, once a row exists (SEC-004: web and devices share one PIN)", async () => {
    rows.default = { pinHash: hashPin("1357") };
    expect((await login(post("/api/auth", { pin: "2468" }, "1.2.3.6"))).status).toBe(401);
    expect((await login(post("/api/auth", { pin: "1357" }, "1.2.3.6"))).status).toBe(200);
  });
  it("503 when there is neither a row nor APP_PIN", async () => {
    vi.stubEnv("APP_PIN", "");
    const res = await login(post("/api/auth", { pin: "1234" }, "1.2.3.7"));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/auth/update-pin", () => {
  it("changes the stored PIN, requires the current one, and touches no file", async () => {
    rows.default = { pinHash: hashPin("2468") };
    const bad = await changePin(post("/api/auth/update-pin", { currentPin: "0000", newPin: "135791" }, "5.5.5.1"));
    expect(bad.status).toBe(401);
    const shape = await changePin(post("/api/auth/update-pin", { currentPin: "2468", newPin: "12" }, "5.5.5.1"));
    expect(shape.status).toBe(400);
    // D12: a new PIN is 6–8 digits; a 4-digit one is refused with a message that says so.
    const four = await changePin(post("/api/auth/update-pin", { currentPin: "2468", newPin: "1357" }, "5.5.5.1"));
    expect(four.status).toBe(400);
    expect((await four.json()).error).toBe("New PIN must be 6 to 8 digits");
    const ok = await changePin(post("/api/auth/update-pin", { currentPin: "2468", newPin: "135791" }, "5.5.5.1"));
    expect(ok.status).toBe(200);
    expect((await login(post("/api/auth", { pin: "135791" }, "5.5.5.2"))).status).toBe(200);
    expect((await login(post("/api/auth", { pin: "2468" }, "5.5.5.2"))).status).toBe(401);
    // The old handler imported fs/promises and called writeFile on .env.local; both are gone.
    const src = await import("node:fs").then((fs) => fs.readFileSync("app/api/auth/update-pin/route.ts", "utf8"));
    expect(src).not.toMatch(/from "fs\/promises"|from "node:fs|writeFile\(|readFile\(/);
  });
});
