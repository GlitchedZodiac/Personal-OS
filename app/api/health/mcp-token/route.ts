// Claude-connector token minting (2026-08-29). Cookie-gated: only someone
// already inside the app can mint. The token shows ONCE; it lives as a
// DeviceSession (deviceType "mcp") so the existing Devices list revokes it.
// A year-long TTL on purpose — a pasted claude.ai credential shouldn't die
// monthly; revocation is the control.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDeviceSession } from "@/lib/mobile-session";

const MCP_ACCESS_TTL_DAYS = 365;

export async function GET() {
  try {
    const sessions = await prisma.deviceSession.findMany({
      where: { deviceType: "mcp", revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        deviceLabel: true,
        createdAt: true,
        expiresAt: true,
        lastSeenAt: true,
      },
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("MCP token list error:", error);
    return NextResponse.json({ error: "Failed to list connectors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { label?: unknown };
    const label =
      typeof body.label === "string" && body.label.trim().length > 0
        ? body.label.trim().slice(0, 60)
        : "Claude connector";

    const { session, accessToken } = await createDeviceSession({
      deviceLabel: label,
      platform: "mcp",
      deviceType: "mcp",
      accessTtlDays: MCP_ACCESS_TTL_DAYS,
      refreshTtlDays: MCP_ACCESS_TTL_DAYS,
    });

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      accessToken,
      url: `${origin}/api/mcp`,
      session: {
        id: session.id,
        deviceLabel: session.deviceLabel,
        expiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("MCP token mint error:", error);
    return NextResponse.json({ error: "Failed to mint token" }, { status: 500 });
  }
}
