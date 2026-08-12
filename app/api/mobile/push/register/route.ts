import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

// POST — the companion registers its APNs device token so reminders can
// actually reach the phone. Bearer-gated like every /api/mobile route.
// Tokens rotate: upsert on the token itself and refresh lastSeenAt so a
// stale one can be pruned later.
//
// Scope note (Michael, 2026-08-11): pushes carry HIS reminders only —
// nothing AI-initiated. This endpoint stores the address, nothing else.

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!/^[a-fA-F0-9]{32,200}$/.test(token)) {
      return NextResponse.json(
        { error: "token must be the hex APNs device token" },
        { status: 400 }
      );
    }

    const environment = body.environment === "sandbox" ? "sandbox" : "production";
    const platform =
      typeof body.platform === "string" && body.platform.trim()
        ? body.platform.trim()
        : "ios";
    const bundleId =
      typeof body.bundleId === "string" && body.bundleId.trim()
        ? body.bundleId.trim()
        : null;

    const device = await prisma.pushDevice.upsert({
      where: { token },
      create: { token, platform, bundleId, environment },
      update: { platform, bundleId, environment, lastSeenAt: new Date() },
    });

    return NextResponse.json({
      registered: true,
      id: device.id,
      environment: device.environment,
    });
  } catch (error) {
    console.error("Push register error:", error);
    return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  await prisma.pushDevice.deleteMany({ where: { token } });
  return NextResponse.json({ registered: false });
}
