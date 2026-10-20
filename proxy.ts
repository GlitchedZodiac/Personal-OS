import { NextRequest, NextResponse } from "next/server";
import { authSecretProblems, isAuthenticatedRequest } from "@/lib/auth";

/**
 * Server-side gate for the API surface. Before this existed, every /api route
 * was publicly reachable — the PIN gate was client-side only.
 *
 * Routes that carry their own credentials stay open here and keep
 * self-verifying:
 *  - /api/auth            PIN login (rate-limited internally) — EXACT path;
 *                           /api/auth/update-pin stays cookie-gated.
 *  - /api/cron/*          Vercel crons — verify `Bearer CRON_SECRET` themselves
 *  - /api/mobile/*        iOS/watch — verify bearer device-session tokens
 *  - /api/mcp             Claude connector — verifies the same bearer tokens
 *  - /api/oauth/token     OAuth exchange — its credential is the PKCE code /
 *  - /api/oauth/register    rotating refresh token; register is policy-gated.
 *                           (/api/oauth/approve is NOT here — cookie-gated.)
 *  - OAuth callbacks      arrive from Strava/Google without our cookie
 *  - /api/health/daily    iPhone Shortcut — verifies HEALTH_INGEST_TOKEN.
 *                           EXACT match only: as a prefix it would also open
 *                           /api/health/daily-log and /api/health/daily-brief.
 */
// `/api/auth` is EXACT too (2026-10, SEC-009): as a prefix it also opened
// /api/auth/update-pin, which must require the cookie as well as the PIN.
const PUBLIC_API_EXACT = ["/api/auth", "/api/health/daily"];

const PUBLIC_API_PREFIXES = [
  "/api/cron/",
  "/api/mobile/",
  "/api/mcp",
  "/api/oauth/token",
  "/api/oauth/register",
  "/api/strava/callback",
  "/api/finance/google/callback",
];

// Once per instance: if production is missing a signing secret, say so in the
// log the first time anything hits the API (SEC-001/002).
let loggedSecretProblems = false;
/** Routes that authenticate with their own secret, not the signing secrets. */
const SECRET_INDEPENDENT = ["/api/cron/", "/api/health/daily"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Production without its signing secrets cannot sign, verify or hash
  // anything. Say so by NAME on every route that needs them — the cookie
  // routes, the device and connector bearer routes, OAuth — instead of a
  // bare 401 or an unnamed 500 (review of 3a). Crons and the Health
  // Shortcut use their own secrets and keep working.
  const problems = authSecretProblems();
  if (problems.length > 0 && !SECRET_INDEPENDENT.some((p) => pathname === p || pathname.startsWith(p))) {
    const line = problems.map((p) => `${p.variable} is ${p.reason}`).join("; ");
    if (!loggedSecretProblems) {
      loggedSecretProblems = true;
      console.error(`[proxy] ${line} — answering 503 until it is set in Vercel (openssl rand -hex 32, 32+ characters) and redeployed.`);
    }
    return NextResponse.json(
      { error: `Server is not configured: ${line}. Set it in Vercel and redeploy.`, missing: problems.map((p) => p.variable) },
      { status: 503 }
    );
  }

  const isPublic =
    PUBLIC_API_EXACT.includes(pathname) ||
    PUBLIC_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix)
    );
  if (isPublic) {
    return NextResponse.next();
  }

  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};
