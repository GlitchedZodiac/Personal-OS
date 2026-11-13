import { NextRequest, NextResponse } from "next/server";
import { secretErrorResponse } from "@/lib/secret-errors";
import { createDeviceSession } from "@/lib/mobile-session";
import { attemptPin, lockedResponseInit } from "@/lib/pin-attempt";

// Device pairing: the PIN, typed on the wrist or the phone, becomes a device
// session. The kinds a device may pair AS are fixed (2026-10, review of D4):
// the iPhone app sends "iphone", the watch "apple_watch", and nothing else
// ever has. "mcp" is minted only by /api/health/mcp-token and
// /api/oauth/token — a paired device cannot name itself a connector.
const DEVICE_TYPES = new Set(["iphone", "apple_watch"]);
const MAX_LABEL = 60;
const MAX_PLATFORM = 40;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pin = typeof body.pin === "string" ? body.pin : "";
    const deviceLabel =
      typeof body.deviceLabel === "string" && body.deviceLabel.trim().length > 0
        ? body.deviceLabel.trim().slice(0, MAX_LABEL)
        : "Personal device";
    const platform =
      typeof body.platform === "string" ? body.platform.trim().slice(0, MAX_PLATFORM) || null : null;
    const deviceType = typeof body.deviceType === "string" ? body.deviceType.trim() : "";
    if (!DEVICE_TYPES.has(deviceType)) {
      return NextResponse.json(
        { error: `deviceType must be one of: ${[...DEVICE_TYPES].join(", ")}` },
        { status: 400 }
      );
    }

    // Same brute-force gate as the web login (2026-08-29 — this was the one
    // PIN door with no limiter; found during the MCP-exposure audit).
    const attempt = await attemptPin(request, "mobile-pair", pin);
    if (attempt.status === "locked") {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        lockedResponseInit(attempt.retryAfterSeconds)
      );
    }
    if (attempt.status === "wrong") {
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
    const named = secretErrorResponse(error);
    if (named) return named;
    console.error("Mobile session create error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
