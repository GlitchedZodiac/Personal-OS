import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/strava/callback?code=...&scope=...
// Strava redirects here after the user authorizes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const scope = searchParams.get("scope") || "";
  const error = searchParams.get("error");

  // Determine the app base URL for redirects
  const url = new URL(request.url);
  const appUrl = `${url.protocol}//${url.host}`;

  if (error) {
    console.error("Strava OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/settings?strava=error&message=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/settings?strava=error&message=no_code`
    );
  }

  try {
    // Exchange the authorization code for tokens
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Strava token exchange failed:", errText);
      return NextResponse.redirect(
        `${appUrl}/settings?strava=error&message=token_exchange_failed`
      );
    }

    const data = await tokenRes.json();

    // Upsert the token — single user app, so we just use "default" id
    await prisma.stravaToken.upsert({
      where: { id: "default" },
      update: {
        athleteId: data.athlete.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        scope: scope,
        athleteName: `${data.athlete.firstname} ${data.athlete.lastname}`,
        athletePhoto: data.athlete.profile_medium || data.athlete.profile,
      },
      create: {
        id: "default",
        athleteId: data.athlete.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        scope: scope,
        athleteName: `${data.athlete.firstname} ${data.athlete.lastname}`,
        athletePhoto: data.athlete.profile_medium || data.athlete.profile,
      },
    });

    console.log(`✅ Strava connected for athlete: ${data.athlete.firstname} ${data.athlete.lastname} (ID: ${data.athlete.id})`);

    return NextResponse.redirect(
      `${appUrl}/settings?strava=connected`
    );
  } catch (err) {
    console.error("Strava callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/settings?strava=error&message=server_error`
    );
  }
}
