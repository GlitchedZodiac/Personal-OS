// Review generation (2026-10-17, lane B — docs/coach-plan.md §2.2). The model
// is given the facts (ids/dates stripped) and nothing else, and must answer
// with a STRUCTURED object — short cited items and three moves carrying the
// payload a confirm card will write — never an essay. The post-check
// (lib/coach/checks.ts) then holds it to the facts; one retry with the
// violations spelled out, and whatever flags remain are kept and shown.
//
// Nothing here touches the database: the generator is injected, so tests
// and Test mode can run the whole pipeline on a fake.

import { MODEL_TIERS, type ModelTier } from "@/lib/openai";
import { generateChatText } from "@/lib/openai-text";
import { checkReview, LIMITS, needsRetry, type CheckResult } from "./checks";
import { factsForModel } from "./facts";
import type { ReviewChecks, ReviewJson, WeekFacts } from "./types";

export type GenerateFn = typeof generateChatText;

export interface GenerateReviewInput {
  facts: WeekFacts;
  tier: ModelTier;
  generate?: GenerateFn;
  now?: Date;
  /** no retry once this much of the function's time is gone */
  deadlineMs?: number;
}

export interface GeneratedReview {
  review: ReviewJson;
  checks: ReviewChecks;
  markdown: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; calls: number };
  durationMs: number;
}

export const REVIEW_MAX_TOKENS = 2400;
export const REVIEW_RETRY_MAX_TOKENS = 3400;
/** Vercel's ceiling is 60 s; past this, write what there is rather than time out. */
export const REVIEW_SOFT_DEADLINE_MS = 40_000;

export const COACH_SYSTEM_PROMPT = `You are the Coach inside Pitaya — one person's private training and nutrition log (kettlebells, trails, food and macros, weight and body composition, sleep and heart data from his watch). Every Sunday you review his week. You are a real staffer: sharp, warm, concrete, never a cheerleader, never a scold.

THE ONLY SOURCE OF TRUTH IS THE FACTS LIST YOU ARE GIVEN.
- Every number you write must be the value of a fact, written as it appears there (same rounding), followed by that fact's id in square brackets, like "6 sessions [f4]". A delta or percentage you want to mention must itself be a fact; if it is not there, do not compute it.
- If a fact is null or absent, or says "no … this week", say so in plain words and move on. Never estimate, never fill a gap, never assume a day happened.
- The "week.coverage" fact says how much of the week is in. When it is partial, say so once, in the first item. Averages cover whole days only, in both weeks; the partial day appears as its own "… so far" facts — mention them as such and never fold them into an average.
- Optional intakes (water, journal, steps) with nothing in them: state the absence once, flat. Never nag.

NO MEDICAL CLAIMS. You describe training, intake, body and recovery numbers and what to do next week. No diagnoses, no disease names, no "you have", no "at risk of", no supplement or medication advice, no "see a doctor". Sleep, HRV and resting heart rate are described as numbers and trends only.

VOICE AND LENGTH. Plain words a person reads on a phone. headline: at most ${LIMITS.headlineWords} words, verdict first ("Volume up, protein slipped."). whatHappened: at most ${LIMITS.happenedItems} items of at most ${LIMITS.happenedWords} words, each a cited number with its meaning. whatItMeans: at most ${LIMITS.meansItems} items of at most ${LIMITS.meansWords} words. moves: exactly ${LIMITS.moves}, each with a title of at most ${LIMITS.moveTitleWords} words and a why of at most ${LIMITS.moveWhyWords} words, cited.

MOVES ARE PROPOSALS HE CONFIRMS. Each move carries ONE action the app can write exactly as shown:
- {"kind":"plan_week","days":[{"date":"YYYY-MM-DD","title":"…","routineName"?:"one of routines","trailName"?:"one of trails","targetWeightKg"?:number,"notes"?:"…"}],"replaceWeek":false} — dates must be in nextWeek.dates; use ONLY routine and trail names from the lists given; never invent one.
- {"kind":"adjust_targets","calorieTarget"?:number,"proteinPct"?:number,"carbsPct"?:number,"fatPct"?:number} — a change of at most 25% in kcal; percentages, if given, come as all three and add to 100.
- {"kind":"set_reminder","title":"…","atLocal":"YYYY-MM-DDTHH:mm"} — a time within the coming week, in his local time.
- {"kind":"log_measurement","fields":["weightKg", …]} — asks him to weigh or measure; he types the value, you never propose one.
- {"kind":"none"} — a move he simply does; most weeks at least one move is this.
Prefer the plan when there is no plan; prefer targets only when intake facts clearly argue for it; never more than one adjust_targets.

Respond with ONE JSON object and nothing else:
{"headline": string, "verdict": "on_track" | "mixed" | "off_track", "whatHappened": [{"text": string, "cites": ["f1"]}], "whatItMeans": [{"text": string, "cites": ["f1"]}], "moves": [{"title": string, "why": string, "cites": ["f1"], "action": {...}}]}`;

const RETRY_NOTE = (violations: string[]) =>
  `Your previous answer broke the rules below. Return the whole JSON object again, corrected. Every number must be a fact value with its id; remove anything you cannot source; keep the structure and the length limits.\n- ${violations.slice(0, 12).join("\n- ")}`;

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** The model's JSON, or null when it did not return an object with a headline. */
export function parseReviewJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = stripFences(text);
  const candidates = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "headline" in parsed) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function userContent(facts: WeekFacts): string {
  const model = factsForModel(facts);
  return JSON.stringify({
    week: { weekStart: model.weekStart, weekEnd: model.weekEnd, weekNumber: model.weekNumber, timeZone: model.timeZone },
    coverage: model.coverage,
    targets: model.targets,
    nextWeek: model.nextWeek,
    routines: model.routines.map((r) => r.name),
    trails: model.trails.map((t) => t.name),
    facts: model.facts,
  });
}

export async function generateReview(input: GenerateReviewInput): Promise<GeneratedReview> {
  const generate = input.generate ?? generateChatText;
  const model = MODEL_TIERS[input.tier];
  const started = Date.now();
  const deadline = input.deadlineMs ?? REVIEW_SOFT_DEADLINE_MS;
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: COACH_SYSTEM_PROMPT },
    { role: "user", content: userContent(input.facts) },
  ];

  const call = async (extra: typeof messages, max: number, retryMax: number) => {
    const result = await generate({
      model,
      surface: "coach",
      messages: [...messages, ...extra],
      maxCompletionTokens: max,
      retryMaxCompletionTokens: retryMax,
      reasoningEffort: "low",
    });
    usage.inputTokens += result.usage?.inputTokens ?? 0;
    usage.outputTokens += result.usage?.outputTokens ?? 0;
    usage.calls += result.usage?.calls ?? 1;
    return result.text;
  };

  // Attempt 1.
  const firstText = await call([], REVIEW_MAX_TOKENS, REVIEW_RETRY_MAX_TOKENS);
  let parsed = parseReviewJson(firstText);
  let result: CheckResult | null = parsed ? checkReview(parsed, input.facts, { attempts: 1, retried: false }) : null;
  const outOfTime = () => Date.now() - started > deadline;

  // One retry: for no JSON at all, or for a review that broke the contract.
  if (!result || needsRetry(result)) {
    if (outOfTime() && result) {
      return finish(result, input.facts, model, usage, started);
    }
    const note = result
      ? RETRY_NOTE(result.violations)
      : "Your previous answer was not a JSON object. Return ONLY the JSON object described, with no prose around it.";
    const extra: typeof messages = firstText
      ? [{ role: "assistant", content: firstText }, { role: "system", content: note }]
      : [{ role: "system", content: note }];
    const secondText = await call(extra, REVIEW_RETRY_MAX_TOKENS, REVIEW_RETRY_MAX_TOKENS);
    parsed = parseReviewJson(secondText);
    if (parsed) {
      result = checkReview(parsed, input.facts, { attempts: 2, retried: true });
    } else if (result) {
      result = { ...result, checks: { ...result.checks, attempts: 2, retried: true } };
    }
  }
  if (!result) throw new Error("The model did not return a review (no JSON object after two attempts).");
  return finish(result, input.facts, model, usage, started);
}

function finish(
  result: CheckResult,
  facts: WeekFacts,
  model: string,
  usage: GeneratedReview["usage"],
  started: number
): GeneratedReview {
  return {
    review: result.review,
    checks: result.checks,
    markdown: renderReviewMarkdown(result.review, facts),
    model,
    usage,
    durationMs: Date.now() - started,
  };
}

// ————— markdown: the chat's first message, export, and the model's own context —————

export function weekLabel(weekStart: string, weekEnd: string): string {
  const f = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return `${f(weekStart)} – ${f(weekEnd)}`;
}

const cite = (ids: string[]) => (ids.length ? ` [${ids.join(", ")}]` : "");

function describeAction(action: ReviewJson["moves"][number]["action"]): string {
  switch (action.kind) {
    case "plan_week":
      return `plan ${action.days.length} day${action.days.length === 1 ? "" : "s"}: ${action.days
        .map((d) => `${d.date} ${d.title}${d.routineName ? ` (${d.routineName})` : ""}${d.trailName ? ` (${d.trailName})` : ""}${d.targetWeightKg ? ` @ ${d.targetWeightKg} kg` : ""}`)
        .join("; ")}${action.replaceWeek ? " — replacing the week's plan" : ""}`;
    case "adjust_targets": {
      const parts: string[] = [];
      if (action.calorieTarget !== undefined) parts.push(`${action.calorieTarget} kcal`);
      if (action.proteinPct !== undefined) parts.push(`P ${action.proteinPct}% · C ${action.carbsPct}% · F ${action.fatPct}%`);
      return `set targets: ${parts.join(", ")}`;
    }
    case "set_reminder":
      return `remind "${action.title}" at ${action.atLocal.replace("T", " ")}`;
    case "log_measurement":
      return `log a measurement: ${action.fields.join(", ")}`;
    case "none":
      return action.reason ? `nothing to write (${action.reason})` : "nothing to write";
  }
}

export function renderReviewMarkdown(review: ReviewJson, facts: WeekFacts): string {
  const lines: string[] = [];
  lines.push(`# ${review.headline}`);
  lines.push(`_Week ${facts.weekNumber} · ${weekLabel(facts.weekStart, facts.weekEnd)} · covers ${facts.coverage.label}_`);
  lines.push("");
  lines.push("## What happened");
  for (const it of review.whatHappened) lines.push(`- ${it.text}${cite(it.cites)}`);
  lines.push("");
  lines.push("## What it means");
  for (const it of review.whatItMeans) lines.push(`- ${it.text}${cite(it.cites)}`);
  lines.push("");
  lines.push("## Three moves for next week");
  review.moves.forEach((m, i) => {
    lines.push(`${i + 1}. **${m.title}** — ${m.why}${cite(m.cites)}`);
    lines.push(`   _Action: ${describeAction(m.action)}_`);
  });
  return lines.join("\n");
}
