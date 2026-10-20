import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { appSecretProblem, MIN_SECRET_LENGTH } from "@/lib/security";

const AUTH_COOKIE_NAME = "auth";
const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// The PIN-door limiter lives in lib/rate-limit.ts (its counters in Postgres);
// this file keeps the pure pieces it needs: the client bucket and the
// known-device marker.

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function cleanPin(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\r\n/g, "").replace(/\n/g, "").replace(/\r/g, "").trim();
}

/** The bootstrap seed from the environment (see lib/pin-auth.ts). */
export function getConfiguredPin() {
  return cleanPin(process.env.APP_PIN);
}

const isProduction = () => process.env.NODE_ENV === "production";

/** Why AUTH_COOKIE_SECRET is unusable, or null when it is fine. */
export function cookieSecretProblem(): string | null {
  const configured = process.env.AUTH_COOKIE_SECRET?.trim() ?? "";
  if (configured.length >= MIN_SECRET_LENGTH) return null;
  return configured ? `shorter than ${MIN_SECRET_LENGTH} characters` : "not set";
}

export interface SecretProblem {
  variable: "AUTH_COOKIE_SECRET" | "APP_AUTH_SECRET";
  reason: string;
}

/**
 * In production: every signing secret that is missing or too short. Empty
 * outside production, where the legacy derivations still apply with a
 * warning. Routes turn a non-empty list into a loud 503; the build-time
 * preflight (scripts/security-preflight.mjs) is the first line of defence.
 */
export function authSecretProblems(): SecretProblem[] {
  if (!isProduction()) return [];
  const out: SecretProblem[] = [];
  const cookie = cookieSecretProblem();
  if (cookie) out.push({ variable: "AUTH_COOKIE_SECRET", reason: cookie });
  const app = appSecretProblem();
  if (app) out.push({ variable: "APP_AUTH_SECRET", reason: app });
  return out;
}

let loggedMissingCookieSecret = false;
let warnedCookieFallback = false;

// SEC-001 (2026-10): before, the base secret fell back to the PIN when
// AUTH_COOKIE_SECRET was unset, so a 4–8 digit PIN was the whole cookie
// secret and a forged cookie could be tried against any /api route with no
// limiter in the way. Production now refuses to sign or verify without a real
// secret (loudly); development keeps the old fallback with one warning. The
// derivation for a CONFIGURED secret is unchanged, so existing cookies signed
// under a real secret stay valid.
function getCookieSecret() {
  const configured = process.env.AUTH_COOKIE_SECRET ?? "";
  if (configured.trim().length >= MIN_SECRET_LENGTH) {
    return crypto.createHash("sha256").update(`${configured}:personal-os:auth-cookie`).digest("hex");
  }
  if (isProduction()) {
    if (!loggedMissingCookieSecret) {
      loggedMissingCookieSecret = true;
      console.error(
        `[auth] AUTH_COOKIE_SECRET is ${cookieSecretProblem()} — refusing to sign or verify login cookies. Set it in Vercel → Environment Variables (openssl rand -hex 32) and redeploy.`
      );
    }
    return "";
  }
  const baseSecret = configured || getConfiguredPin();
  if (!baseSecret) return "";
  if (!warnedCookieFallback) {
    warnedCookieFallback = true;
    console.warn(
      "[auth] AUTH_COOKIE_SECRET is not set (or is under 32 chars): login cookies are signed with a development fallback. Production refuses."
    );
  }
  return crypto.createHash("sha256").update(`${baseSecret}:personal-os:auth-cookie`).digest("hex");
}

export function createAuthToken() {
  const secret = getCookieSecret();
  if (!secret) return "";

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "personal-os",
    iat: now,
    exp: now + AUTH_TOKEN_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signToken(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string | undefined) {
  if (!token) return false;

  const secret = getCookieSecret();
  if (!secret) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = signToken(encodedPayload, secret);
  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      sub?: string;
      exp?: number;
    };
    if (payload.sub !== "personal-os") return false;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function setAuthCookie(response: NextResponse) {
  const token = createAuthToken();
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: AUTH_TOKEN_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAME);
}

// ── Known-device marker (PLAN D2b) ────────────────────────────────────────
// Set on every successful PIN sign-in, signed with the cookie secret, and
// distinct from the session cookie by its `sub`, so neither can stand in for
// the other. It grants nothing on its own: it only lets this browser present
// the correct PIN while a global wrong-PIN lock is on. Logging out keeps it —
// it marks the device, not the session.
const KNOWN_DEVICE_COOKIE = "pitaya_known_device";
const KNOWN_DEVICE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
const KNOWN_DEVICE_SUB = "pitaya-known-device";

export function createKnownDeviceToken() {
  const secret = getCookieSecret();
  if (!secret) return "";
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({ sub: KNOWN_DEVICE_SUB, iat: now, exp: now + KNOWN_DEVICE_MAX_AGE_SECONDS, n: crypto.randomBytes(8).toString("hex") })
  );
  return `${payload}.${signToken(payload, secret)}`;
}

export function verifyKnownDeviceToken(token: string | undefined): boolean {
  if (!token) return false;
  const secret = getCookieSecret();
  if (!secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = signToken(payload, secret);
  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }
  try {
    const body = JSON.parse(base64UrlDecode(payload)) as { sub?: string; exp?: number };
    return body.sub === KNOWN_DEVICE_SUB && typeof body.exp === "number" && body.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function setKnownDeviceCookie(response: NextResponse) {
  const token = createKnownDeviceToken();
  if (!token) return;
  response.cookies.set(KNOWN_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: KNOWN_DEVICE_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function isKnownDevice(request: NextRequest): boolean {
  return verifyKnownDeviceToken(request.cookies.get(KNOWN_DEVICE_COOKIE)?.value);
}

export function getAuthCookie(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value;
}

export function isAuthenticatedRequest(request: NextRequest) {
  return verifyAuthToken(getAuthCookie(request));
}

/** Expand an IPv6 address to its 8 hextets, or null when it is not one. */
function ipv6Hextets(ip: string): string[] | null {
  const bare = ip.replace(/^\[|\]$/g, "").split("%")[0];
  if (!bare.includes(":")) return null;
  const halves = bare.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  // An embedded IPv4 tail ("::ffff:1.2.3.4") counts as two hextets.
  const last = tail.length ? tail[tail.length - 1] : head[head.length - 1];
  const v4 = last && last.includes(".") ? 1 : 0;
  const fill = 8 - head.length - tail.length - v4;
  if (halves.length === 1 && fill !== 0) return null;
  const all = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...tail];
  if (!all.every((h) => /^[0-9a-f]{1,4}$/i.test(h) || h.includes("."))) return null;
  return all.map((h) => (h.includes(".") ? h : h.toLowerCase().padStart(4, "0")));
}

/**
 * The bucket a caller's address falls in. IPv6 is bucketed by /64 — one
 * subscriber typically holds a whole /64, so keying on the full /128 gave an
 * attacker unlimited "clients" (review of 3b). An IPv4-mapped IPv6 address
 * is its IPv4 address.
 */
export function clientBucket(ip: string): string {
  const hextets = ipv6Hextets(ip.trim());
  if (!hextets) return ip.trim() || "unknown";
  const last = hextets[hextets.length - 1];
  if (last.includes(".") && hextets.slice(0, 5).every((h) => h === "0000") && hextets[5] === "ffff") return last;
  return `${hextets.slice(0, 4).join(":")}::/64`;
}

/**
 * Who is calling, for the per-client bucket. `x-real-ip` is what the platform
 * (Vercel) sets from the connecting socket; `x-forwarded-for` is a fallback
 * for other proxies. Locally neither is trustworthy — which is one reason the
 * GLOBAL bucket exists.
 */
export function getClientIdentifier(request: NextRequest) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return clientBucket(realIp);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return clientBucket(forwardedFor.split(",")[0]?.trim() || "unknown");
  }
  return "unknown";
}
