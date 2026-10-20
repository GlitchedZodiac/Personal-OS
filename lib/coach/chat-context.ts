// What a chat about a review knows (2026-10-17, lane B — docs/coach-plan.md
// §2.5). The stream route looks the conversation up here; when it belongs to
// a review, the review and its facts (ids kept, so he can ask "what is
// f12?") ride along as instructions on every turn, under the same
// evidence-bound rules the review itself was written to. Nothing else about
// the chat changes.

import { prisma } from "@/lib/prisma";
import { factsForModel } from "./facts";
import type { WeekFacts } from "./types";

export interface CoachChatContext {
  reviewId: string;
  weekStart: string;
  /** appended to the chat's instructions */
  context: string;
}

export function buildCoachChatContext(row: {
  id: string;
  weekStart: string;
  weekEnd: string;
  markdown: string | null;
  factsJson: unknown;
}): CoachChatContext {
  const facts = row.factsJson as WeekFacts | null;
  const factsText =
    facts && Array.isArray(facts.facts)
      ? JSON.stringify(
          factsForModel(facts).facts.map((f) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            value: f.value,
            ...(f.unit ? { unit: f.unit } : {}),
            ...(f.source.note ? { note: f.source.note } : {}),
          }))
        )
      : "[]";
  const context =
    `\n\nCOACH REVIEW CONTEXT — this chat is about the Coach's review of the week of ${row.weekStart} (to ${row.weekEnd}). ` +
    "Answer questions about it from the FACTS below: quote a number only as a fact value and name its id like [f12]; when a fact is absent say so plainly; describe training, intake, body and recovery numbers and never add medical claims. " +
    "If he wants to act on a move (plan the week, change targets, set a reminder, log a measurement), use the ordinary tools so the app shows him a card to confirm — nothing is written without his tap.\n\n" +
    `THE REVIEW:\n${row.markdown ?? "(not written)"}\n\nTHE FACTS:\n${factsText}`;
  return { reviewId: row.id, weekStart: row.weekStart, context };
}

/** Null for every chat that is not a review's — the common case, one indexed lookup. */
export async function coachChatContext(conversationId: string | null): Promise<CoachChatContext | null> {
  if (!conversationId) return null;
  const row = await prisma.coachReview
    .findUnique({
      where: { conversationId },
      select: { id: true, weekStart: true, weekEnd: true, markdown: true, factsJson: true },
    })
    .catch(() => null);
  return row ? buildCoachChatContext(row) : null;
}
