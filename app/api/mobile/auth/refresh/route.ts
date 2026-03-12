import { NextRequest, NextResponse } from "next/server";
import { refreshDeviceSession } from "@/lib/mobile-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "";

    const refreshed = await refreshDeviceSession(refreshToken);
    if (!refreshed) {
      return NextResponse.json(
        { error: "Refresh token is invalid or expired" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      session: {
        id: refreshed.session.id,
        deviceLabel: refreshed.session.deviceLabel,
        platform: refreshed.session.platform,
        deviceType: refreshed.session.deviceType,
        expiresAt: refreshed.session.expiresAt.toISOString(),
        refreshExpiresAt: refreshed.session.refreshExpiresAt.toISOString(),
      },
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    });
  } catch (error) {
    console.error("Mobile session refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh session" },
      { status: 500 }
    );
  }
}
