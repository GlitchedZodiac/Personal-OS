import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";
import { syncGoogleFinanceMailbox } from "@/lib/finance/google";

export async function POST(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncGoogleFinanceMailbox({
      fullRescan: Boolean(body?.fullRescan),
      mode:
        body?.mode === "source_discovery" ||
        body?.mode === "full" ||
        body?.mode === "priority_only"
          ? body.mode
          : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Finance Google sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync Gmail" },
      { status: 500 }
    );
  }
}
