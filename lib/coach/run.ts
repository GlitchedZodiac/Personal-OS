// One run of the Coach (2026-10-17, lane B — docs/coach-plan.md §2.4, §2.7).
//
// Order matters: settings → budget → facts (reads only) → CLAIM the row →
// model → finish the row. The claim comes before the expensive call so two
// runs of the same week cannot both pay for it: the live row's liveWeekStart
// is unique, and the second claimant either stops or — when asked to — moves
// the first row to "superseded" in the same transaction that inserts its own.
// A failed run leaves a `failed` row with its error and facts; a `generating`
// row older than the function ceiling is stale and may be superseded too.
//
// Everything that reaches outside is injectable (source, generate, settings,
// clock), which is what lets Test mode and the tests run the whole pipeline
// against synthetic rows: tests/coach-run.test.ts asserts that a Test run
// writes nothing outside coach_reviews and ai_usage_events.

import type { CoachReview, Prisma } from "@prisma/client";
import { estimateChatCostUsd } from "@/lib/ai-usage";
import { MODEL_TIERS } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { addDaysToDateString, getDateStringInTimeZone, getWeekStartDateString } from "@/lib/timezone";
import { buildWeekFacts } from "./facts";
import { fixtureSource } from "./fixture-week";
import { generateReview, type GenerateFn } from "./review";
import { type CoachSettings, getCoachSettings } from "./settings";
import { loadWeekInput } from "./source";
import { prismaCoachSource } from "./source-prisma";
import { getCoachSpend, type CoachSpend } from "./spend";
import type { CoachSource, ReviewChecks, ReviewJson, WeekFacts } from "./types";

export type ReviewKind = "live" | "superseded" | "test";
export type ReviewStatus = "generating" | "ready" | "failed" | "blocked_budget";
export type RunTrigger = "cron" | "manual";

/** What to do when the week already has a live row. */
export type OnExisting = "skip" | "supersede" | "supersede_if_unhealthy";

/** A `generating` row this old was killed mid-run and no longer owns the week. */
export const STALE_GENERATING_MS = 2 * 60_000;

export interface RunOptions {
  trigger: RunTrigger;
  kind: "live" | "test";
  /** any day of the week to review; default: the week containing `now` */
  weekStart?: string;
  timeZone?: string;
  now?: Date;
  source?: CoachSource;
  generate?: GenerateFn;
  settings?: CoachSettings;
  onExisting?: OnExisting;
  /** Test runs default to true — a Test he taps is a diagnostic (D7) */
  ignoreBudget?: boolean;
}

export type RunResult =
  | { outcome: "ran"; review: CoachReview }
  | { outcome: "skipped"; reason: "coach_off" }
  | { outcome: "skipped"; reason: "exists"; review: CoachReview }
  | { outcome: "skipped"; reason: "budget"; spend: CoachSpend; review: CoachReview | null };

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

/**
 * The week a run reviews when none is named: on Sunday, the week ending
 * today (read through the moment of the run); any other day, the week that
 * last ended. The Sunday-evening cron and the Monday catch-up therefore name
 * the same week.
 */
export function defaultReviewWeek(now: Date, timeZone: string): string {
  const today = getDateStringInTimeZone(now, timeZone);
  const thisWeek = getWeekStartDateString(today, 1);
  const isSunday = addDaysToDateString(thisWeek, 6) === today;
  return isSunday ? thisWeek : addDaysToDateString(thisWeek, -7);
}

export function isHealthy(row: Pick<CoachReview, "status" | "generatedAt">, now: Date): boolean {
  if (row.status === "ready") return true;
  if (row.status === "generating") return now.getTime() - row.generatedAt.getTime() < STALE_GENERATING_MS;
  return false; // failed, blocked_budget
}

type ClaimData = Omit<Prisma.CoachReviewUncheckedCreateInput, "kind" | "liveWeekStart">;

/**
 * Insert the row that owns this run. Live rows claim the week; the unique on
 * liveWeekStart decides races. Returns the existing row instead when the
 * caller does not want to supersede it.
 */
async function claim(
  data: ClaimData,
  kind: "live" | "test",
  weekStart: string,
  onExisting: OnExisting,
  now: Date
): Promise<{ row: CoachReview } | { existing: CoachReview }> {
  if (kind === "test") {
    return { row: await prisma.coachReview.create({ data: { ...data, kind: "test", liveWeekStart: null } }) };
  }
  try {
    return { row: await prisma.coachReview.create({ data: { ...data, kind: "live", liveWeekStart: weekStart } }) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const existing = await prisma.coachReview.findUnique({ where: { liveWeekStart: weekStart } });
  if (!existing) throw new Error(`The week ${weekStart} is claimed but its live row cannot be read.`);
  if (onExisting === "skip") return { existing };
  if (onExisting === "supersede_if_unhealthy" && isHealthy(existing, now)) return { existing };
  // Supersede: one transaction, so there is never a moment with two live rows or none.
  const row = await prisma.$transaction(async (tx) => {
    await tx.coachReview.update({
      where: { id: existing.id },
      data: { kind: "superseded", liveWeekStart: null },
    });
    return tx.coachReview.create({ data: { ...data, kind: "live", liveWeekStart: weekStart } });
  });
  return { row };
}

export async function runCoachReview(opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const settings = opts.settings ?? (await getCoachSettings());
  const isTest = opts.kind === "test";
  if (!isTest && !settings.enabled) return { outcome: "skipped", reason: "coach_off" };

  const timeZone = opts.timeZone ?? (await getUserTimeZone(null));
  const weekStart = getWeekStartDateString(opts.weekStart ?? defaultReviewWeek(now, timeZone), 1);
  const weekEnd = addDaysToDateString(weekStart, 6);
  const onExisting = opts.onExisting ?? "skip";
  const modelTier = settings.modelTier;
  const model = MODEL_TIERS[modelTier];
  const base = { weekStart, weekEnd, trigger: opts.trigger, modelTier, model };

  // Budget: review spend only, never for a Test he taps.
  const ignoreBudget = opts.ignoreBudget ?? isTest;
  if (!ignoreBudget) {
    const spend = await getCoachSpend({ timeZone, budgetUsd: settings.monthlyBudgetUsd, now });
    if (spend.blocked) {
      // Leave a row that says why, so the screen can explain and a later run
      // (with a raised budget) can supersede it. "skip": a blocked marker
      // never replaces a review that exists, and never stacks on itself.
      const claimed = await claim(
        { ...base, status: "blocked_budget", factsJson: {}, error: `monthly budget of $${settings.monthlyBudgetUsd} reached` },
        "live",
        weekStart,
        "skip",
        now
      );
      return { outcome: "skipped", reason: "budget", spend, review: "row" in claimed ? claimed.row : claimed.existing };
    }
  }

  // Facts: reads only, before anything is written.
  const source = opts.source ?? (isTest ? fixtureSource("full", { weekStart, timeZone }) : prismaCoachSource());
  const input = await loadWeekInput(source, {
    weekStart,
    timeZone,
    now,
    options: { journalExcerpts: settings.journalExcerpts },
  });
  const facts = buildWeekFacts(input);

  const claimed = await claim(
    { ...base, status: "generating", factsJson: facts as object, generatedAt: now },
    opts.kind,
    weekStart,
    onExisting,
    now
  );
  if ("existing" in claimed) return { outcome: "skipped", reason: "exists", review: claimed.existing };
  const row = claimed.row;

  try {
    const generated = await generateReview({ facts, tier: modelTier, generate: opts.generate, now });
    const costUsd = estimateChatCostUsd(generated.model, generated.usage.inputTokens, generated.usage.outputTokens);
    const ready = await prisma.coachReview.update({
      where: { id: row.id },
      data: {
        status: "ready",
        model: generated.model,
        reviewJson: generated.review as object,
        markdown: generated.markdown,
        checksJson: generated.checks as object,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
        costUsd,
        durationMs: generated.durationMs,
        error: null,
      },
    });
    return { outcome: "ran", review: ready };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await prisma.coachReview.update({
      where: { id: row.id },
      data: { status: "failed", error: message.slice(0, 500), durationMs: Date.now() - now.getTime() },
    });
    return { outcome: "ran", review: failed };
  }
}

// ————— reading —————

export interface ReviewSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  kind: ReviewKind;
  status: ReviewStatus;
  trigger: RunTrigger;
  modelTier: string;
  model: string;
  headline: string | null;
  verdict: string | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  generatedAt: string;
  hasConversation: boolean;
  actionsConfirmed: number;
  error: string | null;
}

export function summarizeReview(row: CoachReview): ReviewSummary {
  const review = (row.reviewJson ?? null) as Partial<ReviewJson> | null;
  const actions = Array.isArray(row.actionsJson) ? row.actionsJson : [];
  return {
    id: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    kind: row.kind as ReviewKind,
    status: row.status as ReviewStatus,
    trigger: row.trigger as RunTrigger,
    modelTier: row.modelTier,
    model: row.model,
    headline: review?.headline ?? null,
    verdict: review?.verdict ?? null,
    costUsd: Number(row.costUsd),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    generatedAt: row.generatedAt.toISOString(),
    hasConversation: Boolean(row.conversationId),
    actionsConfirmed: actions.length,
    error: row.error,
  };
}

export interface ReviewDetail extends ReviewSummary {
  facts: WeekFacts | null;
  review: ReviewJson | null;
  checks: ReviewChecks | null;
  markdown: string | null;
  actions: unknown[];
  conversationId: string | null;
}

export function detailReview(row: CoachReview): ReviewDetail {
  const facts = row.factsJson && typeof row.factsJson === "object" && "facts" in (row.factsJson as object)
    ? (row.factsJson as unknown as WeekFacts)
    : null;
  return {
    ...summarizeReview(row),
    facts,
    review: (row.reviewJson ?? null) as ReviewJson | null,
    checks: (row.checksJson ?? null) as ReviewChecks | null,
    markdown: row.markdown,
    actions: Array.isArray(row.actionsJson) ? row.actionsJson : [],
    conversationId: row.conversationId,
  };
}

export async function listReviews(limit = 26): Promise<ReviewSummary[]> {
  const rows = await prisma.coachReview.findMany({
    orderBy: [{ weekStart: "desc" }, { generatedAt: "desc" }],
    take: Math.min(200, Math.max(1, limit)),
  });
  return rows.map(summarizeReview);
}

export async function latestLiveReview(): Promise<CoachReview | null> {
  return prisma.coachReview.findFirst({
    where: { kind: "live" },
    orderBy: [{ weekStart: "desc" }, { generatedAt: "desc" }],
  });
}

export async function getReview(id: string): Promise<CoachReview | null> {
  return prisma.coachReview.findUnique({ where: { id } });
}
