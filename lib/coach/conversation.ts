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

class LostRace extends Error {}

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

  try {
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
      // Only if no other tap linked one first: a second tap in the same moment
      // loses here, and its transaction — chat and message — rolls back.
      const linked = await tx.coachReview.updateMany({
        where: { id: review.id, conversationId: null },
        data: { conversationId: conversation.id },
      });
      if (linked.count === 0) throw new LostRace();
      return conversation.id;
    });
    return { ok: true, conversationId, created: true };
  } catch (error) {
    if (!(error instanceof LostRace)) throw error;
    const winner = await prisma.coachReview.findUnique({ where: { id: review.id }, select: { conversationId: true } });
    if (!winner?.conversationId) throw error;
    return { ok: true, conversationId: winner.conversationId, created: false };
  }
}
