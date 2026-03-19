import { NextRequest, NextResponse } from "next/server";
import { confirmPaycheckAllocationRun } from "@/lib/finance/planning";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await confirmPaycheckAllocationRun({
      runId: id,
      allocations: Array.isArray(body.allocations) ? body.allocations : undefined,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ run: result });
  } catch (error) {
    console.error("Finance paycheck allocation confirm error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm paycheck allocation run" },
      { status: 500 }
    );
  }
}
