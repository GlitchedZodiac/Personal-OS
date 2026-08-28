// Per-sender notification switches (2026-08-28) — read and flipped by
// /settings/notifications. Cookie-gated by proxy.ts.

import { NextRequest, NextResponse } from "next/server";
import {
  getNotificationPrefs,
  saveNotificationPrefs,
} from "@/lib/notification-prefs";

export async function GET() {
  return NextResponse.json({ prefs: await getNotificationPrefs() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const prefs = await saveNotificationPrefs(body?.prefs ?? body ?? {});
    return NextResponse.json({ prefs });
  } catch (error) {
    console.error("Notification prefs save error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
