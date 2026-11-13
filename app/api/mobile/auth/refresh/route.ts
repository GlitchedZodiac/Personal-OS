import { NextRequest, NextResponse } from "next/server";
import { secretErrorResponse } from "@/lib/secret-errors";
import { refreshDeviceSession } from "@/lib/mobile-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "";

    // Device sessions only — a connector's refresh token is refused here.
    const refreshed = await refreshDeviceSession(refreshToken, "device");
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
    const named = secretErrorResponse(error);
    if (named) return named;
    console.error("Mobile session refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh session" },
      { status: 500 }
    );
  }
}
