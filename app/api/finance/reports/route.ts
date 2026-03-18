import { NextResponse } from "next/server";
import { getFinanceReportSummary } from "@/lib/finance/reports";

export async function GET() {
  try {
    const summary = await getFinanceReportSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Finance reports error:", error);
    return NextResponse.json({ error: "Failed to load finance reports" }, { status: 500 });
  }
}
