import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

// One gate for every /api/cron/* route and the admin route (SEC-038, 2026-10).
// Before this, three of the seven crons used `process.env.CRON_SECRET && …`,
// which is falsy when the variable is unset — so with no secret configured
// they ran for anyone who called them. All seven also compared with `!==`.
//
// Rules here: refuse when the secret is unset (fail closed), compare in
// constant time, and say so in the log when the variable is missing, so a
// cron that stops firing is diagnosable from Vercel's logs in one line.

const MIN_RECOMMENDED_LENGTH = 16;
let warnedShort = false;

/** Constant-time equality of two short strings (hash first so lengths differ safely). */
export function secretEquals(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const d = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(d(given), d(expected));
}

/** Does `Authorization: Bearer <x>` carry the configured CRON_SECRET? */
export function cronSecretMatches(
  authorization: string | null | undefined,
  expected: string | undefined = process.env.CRON_SECRET
): boolean {
  const secret = expected?.trim() ?? "";
  if (!secret) return false; // unset → every call refused
  if (secret.length < MIN_RECOMMENDED_LENGTH && !warnedShort) {
    warnedShort = true;
    console.warn(`[cron] CRON_SECRET is shorter than ${MIN_RECOMMENDED_LENGTH} characters — rotate it to a longer value`);
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match) return false;
  return secretEquals(match[1], secret);
}

/**
 * Returns a 401 response when the request is not a legitimate cron call, or
 * null when it is. Usage at the top of a cron handler:
 *   const denied = requireCronSecret(request); if (denied) return denied;
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  if (cronSecretMatches(request.headers.get("authorization"))) return null;
  if (!process.env.CRON_SECRET?.trim()) {
    console.error("[cron] CRON_SECRET is not set — refusing the call (set it in Vercel → Environment Variables)");
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
