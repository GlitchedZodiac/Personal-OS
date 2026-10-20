// What the Coach has cost this month (2026-10-17, lane B — docs/coach-plan.md
// §2.7). Review spend is the sum of coach_reviews.costUsd — written on the row
// synchronously, so a budget check right after a run sees it (recordAIUsage is
// fire-and-forget). Chat spend is shown beside it and never blocks anything.

import { prisma } from "@/lib/prisma";
import { getZonedDateParts, zonedLocalDateTimeToUtc } from "@/lib/timezone";

export interface CoachSpend {
  /** first instant of the calendar month in the user's timezone, ISO */
  monthStart: string;
  reviewsUsd: number;
  reviewsCount: number;
  chatUsd: number;
  chatCalls: number;
  budgetUsd: number;
  remainingUsd: number;
  /** review spend has reached the budget — the cron and "run this week" stop */
  blocked: boolean;
}

export function monthStartUtc(now: Date, timeZone: string): Date {
  const { year, month } = getZonedDateParts(now, timeZone);
  return zonedLocalDateTimeToUtc(`${year}-${String(month).padStart(2, "0")}-01`, timeZone, 0, 0, 0);
}

const money = (value: unknown) => Math.round(Number(value ?? 0) * 1_000_000) / 1_000_000;

export async function getCoachSpend(opts: {
  timeZone: string;
  budgetUsd: number;
  now?: Date;
}): Promise<CoachSpend> {
  const now = opts.now ?? new Date();
  const monthStart = monthStartUtc(now, opts.timeZone);
  const [reviews, chat] = await Promise.all([
    prisma.coachReview.aggregate({
      where: { generatedAt: { gte: monthStart } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.aIUsageEvent.aggregate({
      where: { createdAt: { gte: monthStart }, surface: "coach-chat" },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);
  const reviewsUsd = money(reviews._sum.costUsd);
  const chatUsd = money(chat._sum.costUsd);
  return {
    monthStart: monthStart.toISOString(),
    reviewsUsd,
    reviewsCount: reviews._count,
    chatUsd,
    chatCalls: chat._count,
    budgetUsd: opts.budgetUsd,
    remainingUsd: Math.max(0, Math.round((opts.budgetUsd - reviewsUsd) * 100) / 100),
    blocked: reviewsUsd >= opts.budgetUsd,
  };
}
