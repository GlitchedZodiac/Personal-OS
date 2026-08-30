import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";

/**
 * Server-side gate for the API surface. Before this existed, every /api route
 * was publicly reachable — the PIN gate was client-side only.
 *
 * Routes that carry their own credentials stay open here and keep
 * self-verifying:
 *  - /api/auth            PIN login (rate-limited internally)
 *  - /api/cron/*          Vercel crons — verify `Bearer CRON_SECRET` themselves
 *  - /api/mobile/*        iOS/watch — verify bearer device-session tokens
 *  - /api/mcp             Claude connector — verifies the same bearer tokens
 *  - /api/oauth/token     OAuth exchange — its credential is the PKCE code /
 *  - /api/oauth/register    rotating refresh token; register is policy-gated.
 *                           (/api/oauth/approve is NOT here — cookie-gated.)
 *  - OAuth callbacks      arrive from Strava/Google without our cookie
 */
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/cron/",
  "/api/mobile/",
  "/api/mcp",
  "/api/oauth/token",
  "/api/oauth/register",
  "/api/strava/callback",
  "/api/finance/google/callback",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_API_PREFIXES.some(
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
