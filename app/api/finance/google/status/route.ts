import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";
import {
  disconnectGoogleFinanceMailbox,
  getGoogleMailboxStatus,
} from "@/lib/finance/google";

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ connected: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getGoogleMailboxStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Finance Google status error:", error);
    return NextResponse.json(
      { connected: false, error: "Failed to load Google mailbox status" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectGoogleFinanceMailbox();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Finance Google disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
