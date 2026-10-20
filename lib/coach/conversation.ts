// The review's chat (2026-10-17, lane B — docs/coach-plan.md §2.5). Created
// LAZILY, on the first "Talk to this review" tap — never at generation. The
// chat tab opens on the newest conversation, so a conversation minted at
// Sunday 19:00 would be the thread a food log typed that night landed in,
// with the Coach's instructions and the Coach's meter. One transaction:
// the conversation, its first message (the review), and the link.

import { prisma } from "@/lib/prisma";
import { weekLabel } from "./review";

export type EnsureConversationResult =
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; error: "not_found" | "test_review" | "not_ready" };

export function conversationTitle(weekStart: string, weekEnd: string): string {
  return `Coach · ${weekLabel(weekStart, weekEnd)}`;
}

export async function ensureReviewConversation(
  reviewId: string,
  now: Date = new Date()
): Promise<EnsureConversationResult> {
  const review = await prisma.coachReview.findUnique({
    where: { id: reviewId },
    select: { id: true, kind: true, status: true, weekStart: true, weekEnd: true, markdown: true, conversationId: true },
  });
  if (!review) return { ok: false, error: "not_found" };
  if (review.kind === "test") return { ok: false, error: "test_review" };
  if (review.conversationId) return { ok: true, conversationId: review.conversationId, created: false };
  if (review.status !== "ready" || !review.markdown) return { ok: false, error: "not_ready" };

  const conversationId = await prisma.$transaction(async (tx) => {
    const conversation = await tx.chatConversation.create({
      data: {
        title: conversationTitle(review.weekStart, review.weekEnd),
        // "user": the AI namer (writeAiTitle) only renames "auto" titles.
        titleSource: "user",
        createdAt: now,
        lastMessageAt: now,
      },
    });
    await tx.chatMessage.create({
      data: {
        role: "assistant",
        content: review.markdown as string,
        conversationId: conversation.id,
        createdAt: now,
        meta: { source: "coach", reviewId: review.id },
      },
    });
    await tx.coachReview.update({
      where: { id: review.id },
      data: { conversationId: conversation.id },
    });
    return conversation.id;
  });
  return { ok: true, conversationId, created: true };
}
