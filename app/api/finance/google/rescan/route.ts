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
      fullRescan: true,
      mode:
        body?.mode === "source_discovery" ||
        body?.mode === "full" ||
        body?.mode === "priority_only"
          ? body.mode
          : "full",
      dateFrom: typeof body?.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body?.dateTo === "string" ? body.dateTo : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Finance Google rescan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rescan Gmail" },
      { status: 500 }
    );
  }
}
