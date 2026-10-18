import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { authSecretProblems, createAuthToken, verifyAuthToken, cookieSecretProblem } from "@/lib/auth";
import {
  appSecretProblem,
  hashOpaqueToken,
  legacyAppSecret,
  legacyHashOpaqueTokens,
  legacySecretCandidates,
  MissingSecretError,
  signCompact,
  verifyCompact,
} from "@/lib/security";
import { mintDcrClientId } from "@/lib/oauth";

// SEC-001 / SEC-002 (audit 2026-10). The cookie secret and the app secret used
// to fall back to the PIN. In production they now refuse without a real
// value; the legacy chain survives only to VERIFY old material (D1a).

const STRONG = crypto.randomBytes(32).toString("hex");

function forgeCookieFromPin(pin: string) {
  const secret = crypto.createHash("sha256").update(`${pin}:personal-os:auth-cookie`).digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: "personal-os", iat: now, exp: now + 3600 })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function recoverPinFromClientId(clientId: string): string | null {
  const blob = clientId.slice("pos1.".length);
  const dot = blob.lastIndexOf(".");
  const body = blob.slice(0, dot);
  const sig = blob.slice(dot + 1);
  for (let n = 0; n <= 9999; n++) {
    const pin = String(n).padStart(4, "0");
    if (crypto.createHmac("sha256", pin).update(body).digest("base64url") === sig) return pin;
  }
  return null;
}

beforeEach(() => {
  vi.stubEnv("APP_PIN", "2468");
  vi.stubEnv("AUTH_COOKIE_SECRET", "");
  vi.stubEnv("APP_AUTH_SECRET", "");
  vi.stubEnv("NEXTAUTH_SECRET", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SEC-001 — the login cookie", () => {
  it("in production with AUTH_COOKIE_SECRET unset: nothing is signed and a PIN-forged cookie is rejected", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(createAuthToken()).toBe("");
    expect(verifyAuthToken(forgeCookieFromPin("2468"))).toBe(false);
    expect(authSecretProblems().map((p) => p.variable)).toEqual(["AUTH_COOKIE_SECRET", "APP_AUTH_SECRET"]);
    expect(cookieSecretProblem()).toBe("not set");
  });
  it("in production a short AUTH_COOKIE_SECRET is refused too (the ≥32 rule)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECRET", "only-twenty-chars!!!");
    expect(createAuthToken()).toBe("");
    expect(cookieSecretProblem()).toMatch(/shorter than 32/);
  });
  it("with a strong secret, knowing the PIN forges nothing — and the real token verifies", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECRET", STRONG);
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    expect(verifyAuthToken(forgeCookieFromPin("2468"))).toBe(false);
    expect(verifyAuthToken(createAuthToken())).toBe(true);
    expect(authSecretProblems()).toEqual([]);
  });
  it("outside production the development fallback still works (one warning)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const token = createAuthToken();
    expect(token).not.toBe("");
    expect(verifyAuthToken(token)).toBe(true);
    expect(authSecretProblems()).toEqual([]);
  });
});

describe("SEC-002 — the app secret and the public DCR client id", () => {
  it("in production with APP_AUTH_SECRET unset, minting refuses loudly instead of signing under the PIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(appSecretProblem()).toBe("not set");
    expect(() => mintDcrClientId(["https://claude.ai/cb"])).toThrow(MissingSecretError);
    expect(() => hashOpaqueToken("t")).toThrow(/APP_AUTH_SECRET is not set/);
    expect(() => signCompact({ a: 1 })).toThrow(MissingSecretError);
  });
  it("with a strong APP_AUTH_SECRET the client id yields no PIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    const clientId = mintDcrClientId(["https://claude.ai/cb"], "x");
    expect(recoverPinFromClientId(clientId)).toBeNull();
    expect(verifyCompact(clientId.slice(5))).toMatchObject({ v: 1 });
  });
  it("the development fallback (no secret) is exactly the old chain — that is what made the oracle", () => {
    vi.stubEnv("NODE_ENV", "test");
    const clientId = mintDcrClientId(["https://claude.ai/cb"], "x");
    // Keys are now DERIVED even in development, so the raw-PIN oracle no longer matches…
    expect(recoverPinFromClientId(clientId)).toBeNull();
    // …but the legacy chain itself is unchanged, so old material still verifies (D1a).
    expect(legacyAppSecret()).toBe("2468");
  });
  it("legacy chain precedence: APP_AUTH_SECRET, then NEXTAUTH_SECRET, then APP_PIN, then the constant", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "leftover-nextauth");
    expect(legacyAppSecret()).toBe("leftover-nextauth");
    vi.stubEnv("APP_AUTH_SECRET", "short");
    expect(legacyAppSecret()).toBe("short");
    vi.stubEnv("APP_AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("APP_PIN", "");
    expect(legacyAppSecret()).toBe("personal-os-local-secret");
  });
  it("a compact signature minted under the legacy chain still verifies during the window", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_SECRET", "leftover-nextauth-secret");
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    const body = Buffer.from(JSON.stringify({ v: 1, ru: ["https://claude.ai/cb"] })).toString("base64url");
    // Old server: HMAC under the raw chain head — here APP_AUTH_SECRET itself (it was never derived).
    const legacySig = crypto.createHmac("sha256", legacyAppSecret()).update(body).digest("base64url");
    expect(verifyCompact(`${body}.${legacySig}`)).toMatchObject({ v: 1 });
    expect(verifyCompact(`${body}.${legacySig}`, new Date("2027-02-01T00:00:00Z"))).toBeNull();
    // And no legacy hash of a token equals its current hash, so dual lookup is required (lib/mobile-session).
    expect(legacyHashOpaqueTokens("tok")).not.toContain(hashOpaqueToken("tok"));
  });
  it("legacy candidates cover EVERY key the old server may have used, once APP_AUTH_SECRET is set", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "leftover-nextauth");
    vi.stubEnv("APP_AUTH_SECRET", STRONG);
    expect(legacySecretCandidates()).toEqual([STRONG, "leftover-nextauth", "2468", "personal-os-local-secret"]);
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(legacySecretCandidates()).toEqual([STRONG, "2468", "personal-os-local-secret"]);
  });
});
