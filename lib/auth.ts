import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { appSecretProblem, MIN_SECRET_LENGTH } from "@/lib/security";

const AUTH_COOKIE_NAME = "auth";
const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Login limiter (SEC-005, reworked 2026-10): two buckets per scope.
//  - per client: 5 failures in 10 minutes blocks that client for 10 minutes;
//  - GLOBAL: 50 failures in an hour, from anyone, locks the scope for the
//    rest of the hour. Single-user app — fifty wrong PINs is an attack, and a
//    global cap is what header rotation cannot get around.
// Both live in this instance's memory; a DB-backed bucket shared across
// serverless instances is the intake batch (PLAN D2).
const PER_CLIENT_MAX_FAILURES = 5;
const PER_CLIENT_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_MAX_FAILURES = 50;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

type RateLimitEntry = {
  attempts: number;
  resetAt: number;
  blockedUntil?: number;
};

const authAttempts = new Map<string, RateLimitEntry>();

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

export function getAuthCookie(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value;
}

export function isAuthenticatedRequest(request: NextRequest) {
  return verifyAuthToken(getAuthCookie(request));
}

/**
 * Who is calling, for the per-client bucket. `x-real-ip` is what the platform
 * (Vercel) sets from the connecting socket; `x-forwarded-for` is a fallback
 * for other proxies. Locally neither is trustworthy — which is one reason the
 * GLOBAL bucket exists.
 */
export function getClientIdentifier(request: NextRequest) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

function blockedFor(entry: RateLimitEntry | undefined, now: number) {
  return entry?.blockedUntil && entry.blockedUntil > now ? entry.blockedUntil - now : 0;
}

export function checkRateLimit(request: NextRequest, scope: string) {
  const now = Date.now();
  const clientKey = `${scope}:${getClientIdentifier(request)}`;
  const globalKey = `${scope}:*`;

  const waitMs = Math.max(blockedFor(authAttempts.get(clientKey), now), blockedFor(authAttempts.get(globalKey), now));

  return {
    allowed: waitMs === 0,
    retryAfterSeconds: Math.ceil(waitMs / 1000),
    registerFailure: () => {
      registerFailure(clientKey, now, PER_CLIENT_MAX_FAILURES, PER_CLIENT_WINDOW_MS);
      const global = registerFailure(globalKey, now, GLOBAL_MAX_FAILURES, GLOBAL_WINDOW_MS);
      if (global.justBlocked) {
        console.error(
          `[auth] ${scope}: ${GLOBAL_MAX_FAILURES} failed attempts in the last hour across all clients — locked for ${Math.ceil((global.blockedUntil - now) / 60000)} min`
        );
      }
    },
    reset: () => {
      authAttempts.delete(clientKey);
      authAttempts.delete(globalKey);
    },
  };
}

function registerFailure(key: string, now: number, maxFailures: number, windowMs: number) {
  const existing = authAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    authAttempts.set(key, { attempts: 1, resetAt: now + windowMs });
    return { justBlocked: false, blockedUntil: 0 };
  }

  existing.attempts += 1;
  let justBlocked = false;
  if (existing.attempts >= maxFailures && !existing.blockedUntil) {
    existing.blockedUntil = existing.resetAt;
    justBlocked = true;
  }
  authAttempts.set(key, existing);
  return { justBlocked, blockedUntil: existing.blockedUntil ?? 0 };
}
