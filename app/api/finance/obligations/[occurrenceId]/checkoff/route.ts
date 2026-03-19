import { NextRequest, NextResponse } from "next/server";
import { checkoffScheduledObligationOccurrence } from "@/lib/finance/planning";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ occurrenceId: string }> }
) {
  try {
    const { occurrenceId } = await context.params;
    const body = await request.json().catch(() => ({}));

    const transaction = await checkoffScheduledObligationOccurrence({
      occurrenceId,
      accountId: body.accountId ?? null,
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    console.error("Finance obligation checkoff error:", error);
    return NextResponse.json({ error: "Failed to check off obligation" }, { status: 500 });
  }
}
