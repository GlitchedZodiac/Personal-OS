import { NextResponse } from "next/server";
import { withRequestPrisma } from "@/lib/prisma-request";
import { buildFinanceSourcesResponse } from "@/lib/finance/source-view";

export async function GET() {
  try {
    return await withRequestPrisma(async (db) => {
      const payload = await buildFinanceSourcesResponse(db);
      return NextResponse.json(payload);
    });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
