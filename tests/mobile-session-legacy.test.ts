import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// D1a (audit 2026-10) and the review of the 3a fix: the watch, the iPhone and
// the Claude connector keep working when APP_AUTH_SECRET is set — their
// stored hashes were written under the OLD chain (in production: APP_PIN).
// Lookups find them during the window; ONLY a production server with an
// explicit secret re-keys them; the re-key cannot revive a rotated token;
// expired, revoked and post-window rows are never found; and removing APP_PIN
// while rows still depend on it is exactly what the legacy count warns about.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((fn: () => unknown) => void fn()) };
});
vi.mock("@/lib/notify", () => ({ sweepSoon: vi.fn() }));

type Row = Record<string, unknown> & {
  id: string; tokenHash: string; refreshTokenHash: string; revokedAt: Date | null;
  keyVersion: number; refreshKeyVersion: number;
};
const { state } = vi.hoisted(() => ({ state: { rows: [] as Array<Record<string, unknown>>, beforeUpdate: null as null | (() => void) } }));
const rows = () => state.rows as Row[];
const fieldMatches = (row: Row, k: string, v: unknown): boolean => {
  if (k === "revokedAt") return row.revokedAt === v;
  if (k === "OR") return (v as Array<Record<string, unknown>>).some((alt) => Object.entries(alt).every(([kk, vv]) => fieldMatches(row, kk, vv)));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { gt?: Date; lt?: number; in?: unknown[] };
    if (o.gt !== undefined) return (row[k] as Date) > o.gt;
    if (o.lt !== undefined) return (row[k] as number) < o.lt;
    if (o.in !== undefined) return o.in.includes(row[k]);
  }
  return row[k] === v;
};
const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => fieldMatches(row, k, v));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceSession: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows().find((r) => matches(r, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows().find((r) => r.id === where.id) ?? null),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows().filter((r) => matches(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.beforeUpdate?.();
        const hit = rows().filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows().find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      create: vi.fn(),
    },
  },
}));

import { countLegacyKeySessions, refreshDeviceSession, requireConnectorSession, requireMobileSession } from "@/lib/mobile-session";
import { hashOpaqueToken, LEGACY_SECRET_UNTIL } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");
const future = () => new Date(Date.now() + 86_400_000);
const hmac = (key: string, token: string) => crypto.createHmac("sha256", key).update(token).digest("hex");
const req = (token: string) => new NextRequest("http://localhost/api/mobile/summary", { headers: { authorization: `Bearer ${token}` } });

function seed(id: string, deviceType: string, oldKey: string, extra: Partial<Row> = {}) {
  rows().push({
    id, deviceLabel: id, deviceType, tokenHash: hmac(oldKey, `${id}-token`), refreshTokenHash: hmac(oldKey, `${id}-refresh`),
    revokedAt: null, expiresAt: future(), refreshExpiresAt: future(), keyVersion: 1, refreshKeyVersion: 1, ...extra,
  } as Row);
}
/** What Michael does: set the secret on a production server, APP_PIN untouched. */
function afterRollout() {
  vi.stubEnv("APP_AUTH_SECRET", STRONG);
  vi.stubEnv("NODE_ENV", "production");
}

beforeEach(() => {
  state.rows = [];
  state.beforeUpdate = null;
  vi.stubEnv("APP_AUTH_SECRET", "");
  vi.stubEnv("NEXTAUTH_SECRET", "");
  vi.stubEnv("APP_AUTH_SECRET_PREVIOUS", "");
  vi.stubEnv("APP_PIN", "2468");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the rollout: nothing he owns needs re-pairing", () => {
  it("a watch token hashed under APP_PIN is accepted after APP_AUTH_SECRET is set, and re-keyed", async () => {
    seed("watch", "apple_watch", "2468");
    afterRollout();
    expect((await requireMobileSession(req("watch-token")))?.id).toBe("watch");
    expect(rows()[0].tokenHash).toBe(hashOpaqueToken("watch-token"));
    expect(rows()[0].keyVersion).toBe(2);
    expect((await requireMobileSession(req("watch-token")))?.id).toBe("watch");
  });

  it("a leftover NEXTAUTH_SECRET: the Claude connector's token is found through the connector gate", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "leftover-nextauth-secret-value");
    seed("mcp", "mcp", "leftover-nextauth-secret-value");
    afterRollout();
    const auth = await requireConnectorSession(req("mcp-token"));
    expect(auth.ok && auth.session.id).toBe("mcp");
    expect(rows()[0].tokenHash).toBe(hashOpaqueToken("mcp-token"));
    expect(await requireMobileSession(req("mcp-token"))).toBeNull(); // a connector token, not a device one
  });

  it("refresh hashes stay legacy until the device refreshes — and the count says so", async () => {
    seed("phone", "iphone", "2468");
    afterRollout();
    await requireMobileSession(req("phone-token"));
    expect(rows()[0]).toMatchObject({ keyVersion: 2, refreshKeyVersion: 1 });
    expect(await countLegacyKeySessions()).toBe(1);
    const rotated = await refreshDeviceSession("phone-refresh");
    expect(rotated?.session.id).toBe("phone");
    expect(rows()[0]).toMatchObject({ keyVersion: 2, refreshKeyVersion: 2 });
    expect(rows()[0].tokenHash).toBe(hashOpaqueToken(rotated!.accessToken));
    expect(await countLegacyKeySessions()).toBe(0);
    expect(await refreshDeviceSession("phone-refresh")).toBeNull(); // spent
  });

  it("APP_AUTH_SECRET_PREVIOUS: replacing an existing secret keeps sessions hashed under the old one", async () => {
    const old = crypto.randomBytes(32).toString("hex");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_AUTH_SECRET", old);
    const minted = hashOpaqueToken("ipad-token"); // written by the new code under the OLD secret
    rows().push({ id: "ipad", deviceType: "iphone", tokenHash: minted, refreshTokenHash: "x", revokedAt: null, expiresAt: future(), refreshExpiresAt: future(), keyVersion: 2, refreshKeyVersion: 2 } as Row);
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    expect(await requireMobileSession(req("ipad-token"))).toBeNull(); // without the hatch: gone
    vi.stubEnv("APP_AUTH_SECRET_PREVIOUS", old);
    expect((await requireMobileSession(req("ipad-token")))?.id).toBe("ipad");
    expect(rows()[0].tokenHash).toBe(hashOpaqueToken("ipad-token"));
  });
});

describe("where the legacy path must NOT reach", () => {
  it("a development server verifies legacy rows but never rewrites them (it could be pointed at prod)", async () => {
    seed("watch", "apple_watch", "2468");
    const before = rows()[0].tokenHash;
    vi.stubEnv("NODE_ENV", "development"); // no APP_AUTH_SECRET, like the main checkout
    expect((await requireMobileSession(req("watch-token")))?.id).toBe("watch");
    expect(rows()[0].tokenHash).toBe(before);
    expect(rows()[0].keyVersion).toBe(1);
  });

  it("production WITHOUT an explicit secret does not rewrite either", async () => {
    seed("watch", "apple_watch", "2468");
    const before = rows()[0].tokenHash;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_AUTH_SECRET", "too-short");
    // (hashOpaqueToken throws MissingSecretError here; the proxy answers 503 first in real traffic)
    await expect(requireMobileSession(req("watch-token"))).rejects.toThrow(/APP_AUTH_SECRET/);
    expect(rows()[0].tokenHash).toBe(before);
  });

  it("after LEGACY_SECRET_UNTIL a legacy row is no longer found", async () => {
    seed("watch", "apple_watch", "2468");
    afterRollout();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(LEGACY_SECRET_UNTIL.getTime() + 60_000));
    rows()[0].expiresAt = new Date(LEGACY_SECRET_UNTIL.getTime() + 86_400_000);
    expect(await requireMobileSession(req("watch-token"))).toBeNull();
  });

  it("expired (not revoked) and revoked legacy rows are refused; an unknown token finds nothing", async () => {
    seed("expired", "apple_watch", "2468", { expiresAt: new Date(Date.now() - 1000) });
    seed("revoked", "apple_watch", "2468", { revokedAt: new Date() });
    afterRollout();
    expect(await requireMobileSession(req("expired-token"))).toBeNull();
    expect(await requireMobileSession(req("revoked-token"))).toBeNull();
    expect(await requireMobileSession(req("never-issued"))).toBeNull();
  });

  it("removing APP_PIN while rows depend on it logs them out — the hazard the count and the README rule guard", async () => {
    seed("watch", "apple_watch", "2468");
    afterRollout();
    expect(await countLegacyKeySessions()).toBe(1);
    vi.stubEnv("APP_PIN", "");
    expect(await requireMobileSession(req("watch-token"))).toBeNull();
  });
});

describe("the re-key race", () => {
  it("a re-key that loses to a concurrent refresh does NOT revive the rotated token", async () => {
    seed("phone", "iphone", "2468");
    afterRollout();
    // Interleave: between the legacy lookup and the re-key, the device refreshes.
    state.beforeUpdate = () => {
      state.beforeUpdate = null;
      rows()[0].tokenHash = hashOpaqueToken("rotated-access");
      rows()[0].refreshTokenHash = hashOpaqueToken("rotated-refresh");
    };
    expect(await requireMobileSession(req("phone-token"))).toBeNull();
    expect(rows()[0].tokenHash).toBe(hashOpaqueToken("rotated-access"));
  });

  it("two concurrent uses of the same legacy token both succeed (the loser finds the re-keyed row)", async () => {
    seed("watch", "apple_watch", "2468");
    afterRollout();
    const [a, b] = await Promise.all([requireMobileSession(req("watch-token")), requireMobileSession(req("watch-token"))]);
    expect(a?.id).toBe("watch");
    expect(b?.id).toBe("watch");
  });

  it("two concurrent refreshes with one token: exactly one wins", async () => {
    seed("phone", "iphone", "2468");
    afterRollout();
    const [a, b] = await Promise.all([refreshDeviceSession("phone-refresh"), refreshDeviceSession("phone-refresh")]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});
