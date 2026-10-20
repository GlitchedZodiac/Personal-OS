// POST — "Talk to this review" (2026-10-17, lane B). Creates the review's chat
// the first time it is asked for, and returns the same one after that. Lazy
// on purpose: see lib/coach/conversation.ts.

import { NextRequest, NextResponse } from "next/server";
import { ensureReviewConversation } from "@/lib/coach/conversation";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await ensureReviewConversation(id);
    if (result.ok) return NextResponse.json({ conversationId: result.conversationId, created: result.created });
    const status = result.error === "not_found" ? 404 : 409;
    const message =
      result.error === "test_review"
        ? "A Test review has no chat."
        : result.error === "not_ready"
          ? "This review is not written yet."
          : "Review not found";
    return NextResponse.json({ error: result.error, message }, { status });
  } catch (error) {
    console.error("Coach conversation error:", error);
    return NextResponse.json({ error: "Failed to open the chat" }, { status: 500 });
  }
}
