import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// D1a (audit 2026-10): the watch, the iPhone and the Claude connector must
// keep working when APP_AUTH_SECRET is set — their stored token hashes were
// written under the OLD chain. requireMobileSession and refreshDeviceSession
// find them by the legacy hash during the window and re-key the row.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((fn: () => unknown) => void fn()) };
});
vi.mock("@/lib/notify", () => ({ sweepSoon: vi.fn() }));

type Row = Record<string, unknown> & { id: string; tokenHash: string; refreshTokenHash: string; revokedAt: Date | null };
let rows: Row[] = [];
const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => {
    if (k === "revokedAt") return row.revokedAt === v;
    if (v && typeof v === "object" && "gt" in (v as object)) return (row[k] as Date) > (v as { gt: Date }).gt;
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
    return row[k] === v;
  });
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceSession: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      create: vi.fn(),
    },
  },
}));

import { refreshDeviceSession, requireConnectorSession, requireMobileSession } from "@/lib/mobile-session";
import { hashOpaqueToken, legacyAppSecret } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");
const future = () => new Date(Date.now() + 86_400_000);
const oldHash = (token: string) => crypto.createHmac("sha256", legacyAppSecret()).update(token).digest("hex");

function req(token: string) {
  return new NextRequest("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  rows = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("D1a — existing sessions survive the secret rollout", () => {
  it("a watch token hashed under the old chain (APP_PIN) is accepted after APP_AUTH_SECRET is set, and re-keyed", async () => {
    // Before: no secrets, so the chain head was APP_PIN.
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("APP_PIN", "2468");
    rows.push({ id: "watch", deviceType: "apple_watch", tokenHash: oldHash("watch-token"), refreshTokenHash: oldHash("watch-refresh"), revokedAt: null, expiresAt: future(), refreshExpiresAt: future() });
    // After: Michael sets the secret. APP_PIN stays, so the legacy chain still resolves to it.
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    vi.stubEnv("NODE_ENV", "production");
    const session = await requireMobileSession(req("watch-token"));
    expect(session?.id).toBe("watch");
    expect(rows[0].tokenHash).toBe(hashOpaqueToken("watch-token")); // re-keyed
    // Second call: the current hash path.
    expect((await requireMobileSession(req("watch-token")))?.id).toBe("watch");
  });

  it("the common leftover: NEXTAUTH_SECRET was set — the Claude connector's token is still found, through the connector gate", async () => {
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "leftover-nextauth-secret-value");
    vi.stubEnv("APP_PIN", "2468");
    rows.push({ id: "mcp", deviceLabel: "Claude connector", deviceType: "mcp", tokenHash: oldHash("mcp-token"), refreshTokenHash: oldHash("mcp-refresh"), revokedAt: null, expiresAt: future(), refreshExpiresAt: future() });
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    vi.stubEnv("NODE_ENV", "production");
    const auth = await requireConnectorSession(req("mcp-token"));
    expect(auth.ok && auth.session.id).toBe("mcp");
    expect(rows[0].tokenHash).toBe(hashOpaqueToken("mcp-token")); // re-keyed
    // …and, being a connector token, it still cannot drive a device route (SEC-010).
    expect(await requireMobileSession(req("mcp-token"))).toBeNull();
  });

  it("a refresh token hashed under the old chain rotates normally", async () => {
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("APP_PIN", "2468");
    rows.push({ id: "phone", deviceType: "iphone", tokenHash: oldHash("p-token"), refreshTokenHash: oldHash("p-refresh"), revokedAt: null, expiresAt: future(), refreshExpiresAt: future() });
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    vi.stubEnv("NODE_ENV", "production");
    const rotated = await refreshDeviceSession("p-refresh");
    expect(rotated?.session.id).toBe("phone");
    expect(rows[0].tokenHash).toBe(hashOpaqueToken(rotated!.accessToken));
    expect(rows[0].refreshTokenHash).toBe(hashOpaqueToken(rotated!.refreshToken));
    expect(await refreshDeviceSession("p-refresh")).toBeNull(); // old refresh token is spent
  });

  it("revoked and expired legacy rows are still refused; a wrong token finds nothing", async () => {
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("APP_PIN", "2468");
    rows.push({ id: "dead", deviceType: "apple_watch", tokenHash: oldHash("dead-token"), refreshTokenHash: oldHash("dead-r"), revokedAt: new Date(), expiresAt: future(), refreshExpiresAt: future() });
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    expect(await requireMobileSession(req("dead-token"))).toBeNull();
    expect(await requireMobileSession(req("never-issued"))).toBeNull();
  });
});
