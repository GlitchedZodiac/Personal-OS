import { NextResponse } from "next/server";

// GET /api/strava/auth → redirect user to Strava OAuth page
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appUrl = searchParams.get("redirect") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID not configured" }, { status: 500 });
  }

  const callbackUrl = `${appUrl}/api/strava/callback`;

  const stravaAuthUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaAuthUrl.searchParams.set("client_id", clientId);
  stravaAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  stravaAuthUrl.searchParams.set("response_type", "code");
  stravaAuthUrl.searchParams.set("scope", "activity:read_all");
  stravaAuthUrl.searchParams.set("approval_prompt", "auto");

  return NextResponse.redirect(stravaAuthUrl.toString());
}
