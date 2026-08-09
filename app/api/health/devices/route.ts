import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Device sessions (the watch, later maybe an iPad). Powers the Settings
// pairing card. Pairing itself happens on-device (PIN sign-in →
// /api/mobile/auth); a pairing-code flow is v2 per docs/watch-contract.md.

export async function GET() {
  try {
    const now = new Date();
    const sessions = await prisma.deviceSession.findMany({
      where: { revokedAt: null, refreshExpiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        deviceLabel: true,
        platform: true,
        deviceType: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ devices: sessions });
  } catch (error) {
    console.error("Devices fetch error:", error);
    return NextResponse.json({ error: "Failed to load devices" }, { status: 500 });
  }
}

// DELETE { id } — revoke one device session ("Unpair").
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.deviceSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error("Device revoke error:", error);
    return NextResponse.json({ error: "Failed to unpair device" }, { status: 500 });
  }
}
