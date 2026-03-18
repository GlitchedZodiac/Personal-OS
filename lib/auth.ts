import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "auth";
const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

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
  return value.replace(/\\r\\n/g, "").replace(/\\n/g, "").replace(/\\r/g, "").trim();
}

export function getConfiguredPin() {
  return cleanPin(process.env.APP_PIN);
}

function getCookieSecret() {
  const configuredPin = getConfiguredPin();
  const baseSecret = process.env.AUTH_COOKIE_SECRET || configuredPin;
  if (!baseSecret) return "";

  return crypto
    .createHash("sha256")
    .update(`${baseSecret}:personal-os:auth-cookie`)
    .digest("hex");
}

export function isPinConfigured() {
  return Boolean(getConfiguredPin());
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

export function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(request: NextRequest, scope: string) {
  const now = Date.now();
  const key = `${scope}:${getClientIdentifier(request)}`;
  const existing = authAttempts.get(key);

  if (!existing || existing.resetAt <= now) {
    authAttempts.set(key, {
      attempts: 0,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      registerFailure: () => registerFailure(key, now),
      reset: () => authAttempts.delete(key),
    };
  }

  if (existing.blockedUntil && existing.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existing.blockedUntil - now) / 1000),
      registerFailure: () => registerFailure(key, now),
      reset: () => authAttempts.delete(key),
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    registerFailure: () => registerFailure(key, now),
    reset: () => authAttempts.delete(key),
  };
}

function registerFailure(key: string, now: number) {
  const existing = authAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    authAttempts.set(key, {
      attempts: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  existing.attempts += 1;
  if (existing.attempts >= 5) {
    existing.blockedUntil = now + RATE_LIMIT_WINDOW_MS;
  }
  authAttempts.set(key, existing);
}
