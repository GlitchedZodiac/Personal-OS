import { NextRequest, NextResponse } from "next/server";
import { attachSummaryToPage } from "@/lib/spirit-recording-actions";

// The summary lands ON a page as a typed block — the linked sermon page by
// default, any page by id. Re-running replaces the block, never stacks.

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { pageId?: string };
    const result = await attachSummaryToPage(id, body.pageId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Spirit summary attach error:", error);
    return NextResponse.json({ error: "Couldn't attach the summary" }, { status: 500 });
  }
}
