import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

// SEC-003 / SEC-004 / SEC-065 (audit 2026-10): one PIN, in auth_credentials,
// scrypt + salt + pepper; APP_PIN only seeds a missing row; no "1234".

type Cred = { pinHash: string; keyVersion?: number; resetConsumedFor?: string | null };
const { rows, upsert, notify } = vi.hoisted(() => {
  const rows: Record<string, Cred> = {};
  const upsert = vi.fn(async ({ create, update }: { create: Cred; update: Cred }) => {
    rows.default = rows.default ? { ...rows.default, ...update } : { ...create };
    return rows.default;
  });
  const notify = vi.fn(async (input: { title: string }) => {
    void input;
    return { status: "sent" };
  });
  return { rows, upsert, notify };
});
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authCredential: {
      findUnique: vi.fn(async () => rows.default ?? null),
      upsert,
    },
  },
}));

import { pinConfigured, updatePin, verifyPin } from "@/lib/pin-auth";
import { checkPinHash, hashPin, isLegacyPinHash, legacyAppSecret } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");

function legacyHash(pin: string) {
  return crypto.createHmac("sha256", legacyAppSecret()).update(pin).digest("hex");
}

beforeEach(() => {
  delete rows.default;
  upsert.mockClear();
  notify.mockClear();
  // Rewrites (re-hash, re-seed) happen only on a production server with an
  // explicit secret — the default here; the dev-mode test overrides it.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_AUTH_SECRET", STRONG);
  vi.stubEnv("APP_PIN", "2468");
  vi.stubEnv("APP_PIN_RESET", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hashPin / checkPinHash", () => {
  it("produces a salted scrypt record; two hashes of one PIN differ; wrong PIN fails", () => {
    const a = hashPin("2468");
    const b = hashPin("2468");
    expect(a).toMatch(/^scrypt\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(checkPinHash("2468", a)).toBe("ok");
    expect(checkPinHash("2469", a)).toBe("no");
    expect(isLegacyPinHash(a)).toBe(false);
  });
  it("recognises the pre-audit HMAC form as 'legacy' during the window and refuses it after", () => {
    const old = legacyHash("2468");
    expect(isLegacyPinHash(old)).toBe(true);
    expect(checkPinHash("2468", old)).toBe("legacy");
    expect(checkPinHash("2469", old)).toBe("no");
    expect(checkPinHash("2468", old, new Date("2027-02-01T00:00:00Z"))).toBe("no");
  });
  it("a hash under one pepper does not verify under another (rotation needs APP_PIN_RESET)", () => {
    const h = hashPin("2468");
    vi.stubEnv("APP_AUTH_SECRET", crypto.randomBytes(32).toString("hex"));
    expect(checkPinHash("2468", h)).toBe("no");
  });
});

describe("verifyPin — SEC-065: no row and no seed means nobody gets in", () => {
  it("rejects '1234' (the old default) when APP_PIN is unset and the table is empty, writing nothing", async () => {
    vi.stubEnv("APP_PIN", "");
    expect(await pinConfigured()).toBe(false);
    expect(await verifyPin("1234")).toBe(false);
    expect(await verifyPin("")).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("seeds the row from APP_PIN on the first correct login, then the seed is no longer consulted", async () => {
    expect(await verifyPin("0000")).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
    expect(await verifyPin("2468")).toBe(true);
    expect(rows.default?.pinHash.startsWith("scrypt$1$")).toBe(true);
    // Env changes afterwards do not create a second valid PIN.
    vi.stubEnv("APP_PIN", "9999");
    expect(await verifyPin("9999")).toBe(false);
    expect(await verifyPin("2468")).toBe(true);
  });
});

describe("verifyPin — D1a legacy row and the one-time transition", () => {
  it("a legacy-format row verifies and is re-hashed to scrypt on first use", async () => {
    rows.default = { pinHash: legacyHash("2468") };
    expect(await verifyPin("2468")).toBe(true);
    expect(rows.default.pinHash.startsWith("scrypt$1$")).toBe(true);
    expect(await verifyPin("2468")).toBe(true);
  });
  it("NEXTAUTH_SECRET leftover: a row hashed under it still verifies after APP_AUTH_SECRET is set", async () => {
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "a-leftover-nextauth-secret");
    rows.default = { pinHash: legacyHash("2468") }; // written by the old chain = NEXTAUTH_SECRET
    vi.stubEnv("APP_AUTH_SECRET", STRONG); // Michael sets the new secret; NEXTAUTH stays
    expect(await verifyPin("2468")).toBe(true);
    expect(rows.default.pinHash.startsWith("scrypt$1$")).toBe(true);
  });
  it("while the row is still legacy, a mismatching seed re-takes it once (web used to trust APP_PIN)", async () => {
    rows.default = { pinHash: legacyHash("1111") }; // pairing row from long ago
    vi.stubEnv("APP_PIN", "2468"); // what the web login has accepted until now
    expect(await verifyPin("2468")).toBe(true);
    expect(rows.default.pinHash.startsWith("scrypt$1$")).toBe(true);
    expect(await verifyPin("1111")).toBe(false); // the old row's PIN is gone
    vi.stubEnv("APP_PIN", "5555"); // once in the new format the seed is inert
    expect(await verifyPin("5555")).toBe(false);
  });
  it("APP_PIN_RESET=1 is the explicit recovery: re-seed from APP_PIN once, with an alert", async () => {
    rows.default = { pinHash: hashPin("2468"), keyVersion: 2 };
    vi.stubEnv("APP_PIN", "7777");
    expect(await verifyPin("7777")).toBe(false);
    vi.stubEnv("APP_PIN_RESET", "1");
    expect(await verifyPin("7777")).toBe(true);
    expect(await verifyPin("2468")).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].title).toMatch(/reset from APP_PIN/);
    expect(rows.default.resetConsumedFor).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.default.resetConsumedFor).not.toContain("7777");
  });

  it("APP_PIN_RESET left on is NOT a standing second PIN: it cannot undo a later PIN change", async () => {
    rows.default = { pinHash: hashPin("2468"), keyVersion: 2 };
    vi.stubEnv("APP_PIN", "7777");
    vi.stubEnv("APP_PIN_RESET", "1");
    expect(await verifyPin("7777")).toBe(true); // consumed
    expect(await updatePin("7777", "1357")).toBe(true); // he changes it in Settings
    expect(await verifyPin("7777")).toBe(false); // the forgotten flag does not bring it back
    expect(await verifyPin("1357")).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    vi.stubEnv("APP_PIN", "8888"); // a NEW value is a new, single reset
    expect(await verifyPin("8888")).toBe(true);
    expect(await verifyPin("8888")).toBe(true); // now it is simply the stored PIN
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("a development server verifies a legacy row but rewrites nothing (it could be pointed at prod)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_AUTH_SECRET", "");
    rows.default = { pinHash: legacyHash("2468") };
    const before = rows.default.pinHash;
    expect(await verifyPin("2468")).toBe(true);
    expect(rows.default.pinHash).toBe(before);
    vi.stubEnv("APP_PIN_RESET", "1");
    vi.stubEnv("APP_PIN", "9999");
    expect(await verifyPin("9999")).toBe(false); // no re-seed in development
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a scrypt row written under a PREVIOUS secret verifies via APP_AUTH_SECRET_PREVIOUS and is re-hashed", async () => {
    const old = crypto.randomBytes(32).toString("hex");
    vi.stubEnv("APP_AUTH_SECRET", old);
    rows.default = { pinHash: hashPin("2468"), keyVersion: 2 };
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    expect(await verifyPin("2468")).toBe(false);
    vi.stubEnv("APP_AUTH_SECRET_PREVIOUS", old);
    expect(await verifyPin("2468")).toBe(true);
    expect(checkPinHash("2468", rows.default.pinHash)).toBe("ok"); // now under the new pepper
  });
});

describe("updatePin — SEC-004: durable, one place, devices follow", () => {
  it("requires the current PIN and writes the new scrypt hash that both web and pairing read", async () => {
    rows.default = { pinHash: hashPin("2468") };
    expect(await updatePin("0000", "1357")).toBe(false);
    expect(await updatePin("2468", "1357")).toBe(true);
    expect(await verifyPin("2468")).toBe(false);
    expect(await verifyPin("1357")).toBe(true);
    expect(checkPinHash("1357", rows.default.pinHash)).toBe("ok");
  });
});
