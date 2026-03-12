import { NextRequest, NextResponse } from "next/server";
import { createDeviceSession } from "@/lib/mobile-session";
import { verifyPin } from "@/lib/pin-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pin = typeof body.pin === "string" ? body.pin : "";
    const deviceLabel =
      typeof body.deviceLabel === "string" && body.deviceLabel.trim().length > 0
        ? body.deviceLabel.trim()
        : "Personal device";
    const platform =
      typeof body.platform === "string" ? body.platform.trim() : null;
    const deviceType =
      typeof body.deviceType === "string" ? body.deviceType.trim() : null;

    if (!(await verifyPin(pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const { session, accessToken, refreshToken } = await createDeviceSession({
      deviceLabel,
      platform,
      deviceType,
    });

    return NextResponse.json({
      session: {
        id: session.id,
        deviceLabel: session.deviceLabel,
        platform: session.platform,
        deviceType: session.deviceType,
        expiresAt: session.expiresAt.toISOString(),
        refreshExpiresAt: session.refreshExpiresAt.toISOString(),
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Mobile session create error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
