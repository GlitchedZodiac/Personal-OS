import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import {
  ensureScheduledSyncMetadata,
  syncGoogleFinanceMailbox,
} from "@/lib/finance/google";

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const metadata = await ensureScheduledSyncMetadata();
    if (!metadata) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Google mailbox is not connected",
      });
    }

    if (!metadata.shouldSync) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Next finance sync window has not opened yet",
        nextSyncHint: metadata.nextSyncHint,
        syncIntervalMinutes: metadata.syncIntervalMinutes,
      });
    }

    const result = await syncGoogleFinanceMailbox();
    return NextResponse.json({
      success: true,
      skipped: false,
      syncIntervalMinutes: metadata.syncIntervalMinutes,
      ...result,
    });
  } catch (error) {
    console.error("Finance sync cron error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Finance sync failed" },
      { status: 500 }
    );
  }
}
