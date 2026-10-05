// What was sent, when, and what became of it — the list at the foot of
// Settings → Notifications. Cookie-gated by proxy.ts.

import { NextRequest, NextResponse } from "next/server";
import { deviceCount } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 30)
    );
    const [entries, devices, sync] = await Promise.all([
      prisma.notificationLog.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          category: true,
          title: true,
          body: true,
          status: true,
          detail: true,
          deliverAfter: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      deviceCount(),
      prisma.syncStatus.findMany({ orderBy: { source: "asc" } }),
    ]);
    return NextResponse.json({ entries, devices, sync });
  } catch (error) {
    console.error("Notification log error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
