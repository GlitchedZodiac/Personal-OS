import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// GET /api/strava/auth → redirect user to Strava OAuth page.
// A random `state` rides the round-trip (httpOnly cookie ↔ query
// param) so the callback can reject forged redirects.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appUrl = searchParams.get("redirect") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID not configured" }, { status: 500 });
  }

  const callbackUrl = `${appUrl}/api/strava/callback`;
  const state = randomBytes(16).toString("hex");

  const stravaAuthUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaAuthUrl.searchParams.set("client_id", clientId);
  stravaAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  stravaAuthUrl.searchParams.set("response_type", "code");
  stravaAuthUrl.searchParams.set("scope", "activity:read_all");
  stravaAuthUrl.searchParams.set("approval_prompt", "auto");
  stravaAuthUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(stravaAuthUrl.toString());
  res.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https"),
    maxAge: 600,
    path: "/api/strava",
  });
  return res;
}
