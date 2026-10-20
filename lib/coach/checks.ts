// The post-check (2026-10-17, lane B — docs/coach-plan.md §2.3). Pure, and
// importable on the client (the confirm card runs stillWritable()). Holds the
// model to the facts: every number in the prose must be a fact value — or a
// number in the same move's own action payload, since a proposed target is
// by definition not a fact — every item with a number must cite a fact, no
// medical framing, and every action must be writable exactly as the card
// will show it. Nothing is silently fixed: a bad number is flagged and shown
// with an amber chip; a bad action becomes a text-only move, reason kept.

import { MEASURED_FIELDS } from "@/lib/body-measurements";
import { addDaysToDateString, getDateStringInTimeZone, zonedLocalDateTimeToUtc } from "@/lib/timezone";
import type {
  CoachAction,
  PlanDayAction,
  ReviewChecks,
  ReviewFlag,
  ReviewItem,
  ReviewJson,
  ReviewMove,
  WeekFacts,
} from "./types";

export const LIMITS = {
  headlineWords: 8,
  happenedItems: 6,
  happenedWords: 18,
  meansItems: 3,
  meansWords: 28,
  moves: 3,
  moveTitleWords: 8,
  moveWhyWords: 25,
} as const;

/** How far a proposed calorie target may move from the current one, as a fraction. */
export const TARGET_MAX_SHIFT = 0.25;
/** A reminder may be set up to this many days past the reviewed week's Sunday. */
export const REMINDER_HORIZON_DAYS = 8;

// ————— numbers —————

/**
 * Numbers as people write them: 1,850 · 82.4 · −0.3 · 10k. Never the digits
 * of a word ("f12", "Z2") — the lookbehind refuses a letter or a dot before.
 * A "k" is a thousand only when no letter follows it ("10k", not "2200kcal").
 */
const NUMBER_SOURCE = String.raw`(?<![\p{L}\d.])[−-]?\d[\d,]*(?:\.\d+)?(?:k(?!\p{L}))?`;
const numberRe = () => new RegExp(NUMBER_SOURCE, "giu");
const CITE_RE = /\[\s*(f\d+(?:\s*,\s*f\d+)*)\s*\]/g;
/** A bare 1–3 followed by one of these is a quantity, not a count of things in the sentence. */
const UNIT_RE =
  /^[\s-]*(?:kg|g|kcal|cal|%|bpm|ms|min|mins|minutes?|h|hrs?|hours?|km|m|steps?|ml|l|lbs?|×|x|sessions?|days?|nights?|records?|weigh-?ins?|pages?|reps?|sets?|rounds?|times)(?!\p{L})/iu;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_WORD = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const DATE_PATTERNS: Array<{ re: RegExp; month: (m: RegExpExecArray) => number; day: (m: RegExpExecArray) => number }> = [
  // 2026-10-12
  { re: /\b\d{4}-(\d{2})-(\d{2})\b/g, month: (m) => Number(m[1]), day: (m) => Number(m[2]) },
  // Oct 12 · October 12th
  {
    re: new RegExp(String.raw`\b${MONTH_WORD}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "gi"),
    month: (m) => MONTHS.indexOf(m[1].toLowerCase()) + 1,
    day: (m) => Number(m[2]),
  },
  // 12 Oct · 12th of October
  {
    re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH_WORD}`, "gi"),
    month: (m) => MONTHS.indexOf(m[2].toLowerCase()) + 1,
    day: (m) => Number(m[1]),
  },
];

const monthDay = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}-${d}`;
};

export function toNumber(token: string): number {
  const cleaned = token.replace(/,/g, "").replace("−", "-");
  const k = /k$/i.test(cleaned);
  const n = Number.parseFloat(k ? cleaned.slice(0, -1) : cleaned);
  return k ? n * 1000 : n;
}

export function extractNumbers(text: string): string[] {
  return text.replace(CITE_RE, " ").match(numberRe()) ?? [];
}

/** What the prose may contain without a flag: fact numbers, and dates inside the review's window. */
export interface Allowance {
  numbers: number[];
  /** "10-12" — month-day pairs that may appear written as dates */
  dates: Set<string>;
}

/** Remove the dates the allowance accepts; a date outside it stays, and its digits are checked. */
export function stripAllowedDates(text: string, dates: Set<string>): string {
  let out = text;
  for (const p of DATE_PATTERNS) {
    out = out.replace(new RegExp(p.re.source, p.re.flags), (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      return dates.has(`${p.month(m)}-${p.day(m)}`) ? " " : m[0];
    });
  }
  return out;
}

function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (typeof value === "string") {
    for (const t of value.match(numberRe()) ?? []) out.push(toNumber(t));
  } else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, out));
  return out;
}

export function buildAllowance(facts: WeekFacts): Allowance {
  const dates = new Set<string>();
  const addDay = (iso: string) => dates.add(monthDay(iso));
  // The reviewed week, the one before it, and the reminder horizon after it.
  const horizon = addDaysToDateString(facts.weekEnd, REMINDER_HORIZON_DAYS);
  for (let day = addDaysToDateString(facts.weekStart, -7); day <= horizon; day = addDaysToDateString(day, 1)) {
    addDay(day);
  }
  const numbers: number[] = [];
  for (const f of facts.facts) {
    numbersIn(f.value, numbers);
    for (const d of f.source.dates ?? []) addDay(d);
  }
  // A label names dates ("previous run (Wed, Sep 30)") and thresholds
  // ("Days at 10,000+ steps"): its dates join the window, its other numbers
  // join the allowance.
  for (const f of facts.facts) {
    for (const p of DATE_PATTERNS) {
      for (const m of f.label.matchAll(new RegExp(p.re.source, p.re.flags))) {
        dates.add(`${p.month(m as RegExpExecArray)}-${p.day(m as RegExpExecArray)}`);
      }
    }
  }
  for (const f of facts.facts) numbersIn(stripAllowedDates(f.label, dates), numbers);
  return { numbers, dates };
}

function matches(n: number, allowed: number[]): boolean {
  // Absolute values: "dropped 0.3 kg" is the fact −0.3.
  const x = Math.abs(n);
  if (Number.isInteger(x)) return allowed.some((a) => Math.abs(a) === x || Math.round(Math.abs(a)) === x);
  return allowed.some((a) => {
    const y = Math.abs(a);
    return Math.abs(y - x) <= 0.05 || (y !== 0 && Math.abs(y - x) / y <= 0.01);
  });
}

/** Tokens in `text` that are not facts — the heart of "every number is a fact". */
export function unverifiedTokens(text: string, allowance: Allowance, extra: number[] = []): string[] {
  const stripped = stripAllowedDates(text.replace(CITE_RE, " "), allowance.dates);
  const allowed = extra.length ? [...allowance.numbers, ...extra] : allowance.numbers;
  const out: string[] = [];
  const re = numberRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const token = m[0];
    const n = toNumber(token);
    if (!Number.isFinite(n)) continue;
    if (matches(n, allowed)) continue;
    // "three moves", "two of the sessions": a small count with no unit after it.
    if (Number.isInteger(n) && n >= 1 && n <= 3 && !UNIT_RE.test(stripped.slice(m.index + token.length))) continue;
    out.push(token.replace(/,$/, ""));
  }
  return out;
}

// ————— citations —————

/** Pull inline [f12] markers out of the text and into the cites list. */
export function liftCites(text: string, cites: unknown): { text: string; cites: string[] } {
  const found = new Set<string>(
    (Array.isArray(cites) ? cites : []).map(String).filter((c) => /^f\d+$/.test(c))
  );
  const cleaned = text
    .replace(CITE_RE, (_, ids: string) => {
      for (const id of ids.split(",")) found.add(id.trim());
      return " ";
    })
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: cleaned, cites: [...found] };
}

// ————— medical framing —————

const MEDICAL_RE: RegExp[] = [
  /\bdiagnos/i,
  /\bdiseases?\b/i,
  /\bdeficien(?:cy|cies|t)\b/i,
  /\bsyndrome\b/i,
  /\byou (?:are suffering from|suffer from|might have|may have|likely have|probably have)\b/i,
  /\bat (?:high |higher |increased )?risk (?:of|for)\b/i,
  /\btreat(?:ment|ments|ing)?\b/i,
  /\bmedicat/i,
  /\bprescri/i,
  /\bdos(?:e|es|age|ing)\b/i,
  /\bsupplement/i,
  /\b(?:see|consult|talk to|ask) (?:a|your) (?:doctor|physician|gp|cardiologist)\b/i,
  /\bmedical(?:ly)?\b/i,
  /\bheart (?:condition|failure|disease|attack|problem)\b/i,
  /\b(?:hypertension|diabet|anemi|anaemi|thyroid|insomnia|depress|obes|overweight|underweight|malnutri|arrhythmi)/i,
];

export function medicalPhrase(text: string): string | null {
  for (const re of MEDICAL_RE) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

// ————— words —————

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ————— actions —————

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_STAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const MEASURED = new Set<string>(MEASURED_FIELDS as readonly string[]);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function resolveName(name: unknown, pool: Array<{ name: string }>): string | undefined {
  const n = str(name).toLowerCase();
  if (!n) return undefined;
  return pool.find((p) => p.name.trim().toLowerCase() === n)?.name;
}

/**
 * Validate one action against the week's facts. Returns the action as the
 * card will write it (names resolved, strays stripped), or `none` with the
 * reason. stillWritable() re-checks the clock-dependent rules at confirm.
 */
export function validateAction(raw: unknown, facts: WeekFacts): { action: CoachAction; note?: string } {
  const a = (raw ?? {}) as Record<string, unknown>;
  const kind = str(a.kind);
  const none = (reason: string): { action: CoachAction; note: string } => ({
    action: { kind: "none", reason },
    note: reason,
  });

  switch (kind) {
    case "none":
      return { action: { kind: "none", ...(str(a.reason) ? { reason: str(a.reason) } : {}) } };

    case "plan_week": {
      const rawDays = Array.isArray(a.days) ? a.days : [];
      const notes: string[] = [];
      const days: PlanDayAction[] = [];
      const seen = new Set<string>();
      for (const d of rawDays.slice(0, 7) as Array<Record<string, unknown>>) {
        const date = str(d?.date);
        const title = str(d?.title).slice(0, 60);
        if (!DAY_RE.test(date) || !facts.nextWeek.dates.includes(date)) {
          notes.push(`${date || "a day"} is not in next week`);
          continue;
        }
        if (!title) {
          notes.push(`${date} has no title`);
          continue;
        }
        if (seen.has(`${date}|${title}`)) continue;
        seen.add(`${date}|${title}`);
        const day: PlanDayAction = { date, title };
        if (d.routineName !== undefined && d.routineName !== null && str(d.routineName)) {
          const routine = resolveName(d.routineName, facts.routines);
          if (routine) day.routineName = routine;
          else notes.push(`routine "${str(d.routineName)}" not found`);
        }
        if (d.trailName !== undefined && d.trailName !== null && str(d.trailName)) {
          const trail = resolveName(d.trailName, facts.trails);
          if (trail) day.trailName = trail;
          else notes.push(`trail "${str(d.trailName)}" not found`);
        }
        const kg = num(d.targetWeightKg);
        if (kg != null && kg > 0 && kg <= 200) day.targetWeightKg = kg;
        const n = str(d.notes).slice(0, 200);
        if (n) day.notes = n;
        // `reminders` is deliberately dropped: the planner would write Reminder
        // rows the card never showed (review round 1, MEDIUM 8).
        days.push(day);
      }
      if (days.length === 0) return none(notes[0] ?? "no valid days to plan");
      days.sort((x, y) => x.date.localeCompare(y.date));
      return {
        action: { kind: "plan_week", days, replaceWeek: a.replaceWeek === true },
        ...(notes.length ? { note: notes.join("; ") } : {}),
      };
    }

    case "adjust_targets": {
      const current = facts.targets.calorieTarget;
      const out: Extract<CoachAction, { kind: "adjust_targets" }> = { kind: "adjust_targets" };
      const kcal = num(a.calorieTarget);
      if (kcal != null) {
        if (kcal < 1000 || kcal > 6000) return none(`a ${kcal} kcal target is out of bounds`);
        if (Math.abs(kcal - current) / current > TARGET_MAX_SHIFT) {
          return none(
            `a move from ${current} to ${kcal} kcal is more than ${Math.round(TARGET_MAX_SHIFT * 100)}% — too big for one week`
          );
        }
        if (Math.round(kcal) !== current) out.calorieTarget = Math.round(kcal);
      }
      const p = num(a.proteinPct);
      const c = num(a.carbsPct);
      const f = num(a.fatPct);
      if (p != null || c != null || f != null) {
        if (p == null || c == null || f == null) return none("macro percentages must come as a complete set");
        if ([p, c, f].some((v) => v < 5 || v > 70)) return none("a macro share outside 5–70% is not a diet anyone eats");
        if (Math.round(p + c + f) !== 100) return none(`macro percentages add up to ${Math.round(p + c + f)}, not 100`);
        out.proteinPct = Math.round(p);
        out.carbsPct = Math.round(c);
        out.fatPct = Math.round(f);
      }
      if (out.calorieTarget === undefined && out.proteinPct === undefined) return none("no target change was proposed");
      return { action: out };
    }

    case "set_reminder": {
      const title = str(a.title).slice(0, 80);
      const atLocal = str(a.atLocal);
      const m = LOCAL_STAMP_RE.exec(atLocal);
      if (!title) return none("the reminder has no title");
      if (!m) return none(`"${atLocal}" is not a local time (YYYY-MM-DDTHH:mm)`);
      if (Number(m[2]) > 23 || Number(m[3]) > 59) return none(`"${atLocal}" is not a valid clock time`);
      const horizon = addDaysToDateString(facts.weekEnd, REMINDER_HORIZON_DAYS);
      if (m[1] < facts.weekStart || m[1] > horizon) {
        return none(`${m[1]} is outside the ${REMINDER_HORIZON_DAYS} days after the week`);
      }
      return { action: { kind: "set_reminder", title, atLocal } };
    }

    case "log_measurement": {
      const fields = [...new Set((Array.isArray(a.fields) ? a.fields : []).map(str).filter((f) => MEASURED.has(f)))];
      if (fields.length === 0) return none("no measurable field was named");
      const when = str(a.when);
      return { action: { kind: "log_measurement", fields, ...(DAY_RE.test(when) ? { when } : {}) } };
    }

    default:
      return none(kind ? `unknown action "${kind}"` : "no action");
  }
}

/**
 * At CONFIRM time (the card, and the record route): can this action still be
 * written as shown? A plan for a week that has begun, or a reminder whose
 * moment has passed, cannot — replaceWeek would delete days already lived,
 * and the reminder would fire at once. Pure; `timeZone` is where he is.
 */
export function stillWritable(
  action: CoachAction,
  now: Date,
  timeZone: string
): { ok: true } | { ok: false; reason: string } {
  const today = getDateStringInTimeZone(now, timeZone);
  switch (action.kind) {
    case "plan_week": {
      const past = action.days.filter((d) => d.date < today);
      if (past.length > 0) {
        return { ok: false, reason: `${past.map((d) => d.date).join(", ")} ${past.length === 1 ? "has" : "have"} passed — plan from a newer review` };
      }
      return { ok: true };
    }
    case "set_reminder": {
      const m = LOCAL_STAMP_RE.exec(action.atLocal);
      if (!m) return { ok: false, reason: "the reminder time cannot be read" };
      const at = zonedLocalDateTimeToUtc(m[1], timeZone, Number(m[2]), Number(m[3]), 0);
      if (at.getTime() <= now.getTime()) return { ok: false, reason: "that moment has passed" };
      return { ok: true };
    }
    case "none":
      return { ok: false, reason: "nothing to write" };
    default:
      return { ok: true };
  }
}

// ————— the check —————

export interface CheckResult {
  review: ReviewJson;
  checks: ReviewChecks;
  /** one line per problem, for the retry prompt */
  violations: string[];
}

interface Tally {
  unverified: number;
  uncited: number;
  unknownCites: number;
  tooLong: number;
  medical: Array<{ section: string; phrase: string }>;
  violations: string[];
}

function checkText(
  section: string,
  text: string,
  cites: string[],
  limit: number,
  allowance: Allowance,
  extra: number[],
  factIds: Set<string>,
  tally: Tally
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const hasNumbers = extractNumbers(stripAllowedDates(text, allowance.dates)).length > 0;
  const bad = unverifiedTokens(text, allowance, extra);
  if (bad.length) {
    flags.push({ kind: "unverified", tokens: bad });
    tally.unverified++;
    tally.violations.push(`${section}: these numbers are not in the facts: ${bad.join(", ")} — "${text}"`);
  }
  if (hasNumbers && cites.length === 0) {
    flags.push({ kind: "uncited" });
    tally.uncited++;
    tally.violations.push(`${section}: cite the fact ids behind the numbers in "${text}"`);
  }
  const unknown = cites.filter((c) => !factIds.has(c));
  if (unknown.length) {
    flags.push({ kind: "unknown_cite", ids: unknown });
    tally.unknownCites++;
    tally.violations.push(`${section}: ${unknown.join(", ")} are not fact ids`);
  }
  const w = words(text);
  if (w > limit) {
    flags.push({ kind: "too_long", words: w, limit });
    tally.tooLong++;
    tally.violations.push(`${section}: ${w} words, the limit is ${limit}`);
  }
  return flags;
}

function checkItems(
  section: string,
  items: unknown,
  maxItems: number,
  maxWords: number,
  allowance: Allowance,
  factIds: Set<string>,
  tally: Tally
): ReviewItem[] {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const out: ReviewItem[] = [];
  for (const raw of list.slice(0, maxItems)) {
    const rawText = str(raw?.text);
    if (!rawText) continue;
    const phrase = medicalPhrase(rawText);
    if (phrase) {
      tally.medical.push({ section, phrase });
      tally.violations.push(`${section}: "${phrase}" is medical framing — describe the numbers and the next move, nothing clinical`);
      continue;
    }
    const { text, cites } = liftCites(rawText, raw.cites);
    const flags = checkText(section, text, cites, maxWords, allowance, [], factIds, tally);
    out.push({ text, cites, ...(flags.length ? { flags } : {}) });
  }
  return out;
}

const FALLBACK_HEADLINE = "The week, in numbers";

export function checkReview(
  raw: unknown,
  facts: WeekFacts,
  attempt: { attempts: number; retried: boolean }
): CheckResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const allowance = buildAllowance(facts);
  const factIds = new Set(facts.facts.map((f) => f.id));
  const tally: Tally = { unverified: 0, uncited: 0, unknownCites: 0, tooLong: 0, medical: [], violations: [] };

  let headline = liftCites(str(r.headline), []).text.replace(/[.\s]+$/, "") || FALLBACK_HEADLINE;
  let headlineFlags: ReviewFlag[] = [];
  const headlinePhrase = medicalPhrase(headline);
  if (headlinePhrase) {
    tally.medical.push({ section: "headline", phrase: headlinePhrase });
    tally.violations.push(`headline: "${headlinePhrase}" is medical framing`);
    headline = FALLBACK_HEADLINE;
  } else {
    const bad = unverifiedTokens(headline, allowance);
    if (bad.length) {
      headlineFlags.push({ kind: "unverified", tokens: bad });
      tally.unverified++;
      tally.violations.push(`headline: these numbers are not in the facts: ${bad.join(", ")}`);
    }
    if (words(headline) > LIMITS.headlineWords) {
      headlineFlags.push({ kind: "too_long", words: words(headline), limit: LIMITS.headlineWords });
      tally.tooLong++;
      tally.violations.push(`headline: ${words(headline)} words, the limit is ${LIMITS.headlineWords}`);
    }
  }
  if (headline === FALLBACK_HEADLINE) headlineFlags = [];
  const verdict = r.verdict === "on_track" || r.verdict === "off_track" || r.verdict === "mixed" ? r.verdict : "mixed";

  const whatHappened = checkItems(
    "what happened", r.whatHappened, LIMITS.happenedItems, LIMITS.happenedWords, allowance, factIds, tally
  );
  const whatItMeans = checkItems(
    "what it means", r.whatItMeans, LIMITS.meansItems, LIMITS.meansWords, allowance, factIds, tally
  );

  const moves: ReviewMove[] = [];
  const actionsInvalidated: Array<{ index: number; reason: string }> = [];
  const rawMoves = Array.isArray(r.moves) ? (r.moves as Array<Record<string, unknown>>) : [];
  for (const rawMove of rawMoves) {
    if (moves.length >= LIMITS.moves) break;
    const rawTitle = str(rawMove?.title);
    const rawWhy = str(rawMove?.why);
    if (!rawTitle) continue;
    const label = `move ${moves.length + 1}`;
    const phrase = medicalPhrase(`${rawTitle} ${rawWhy}`);
    if (phrase) {
      tally.medical.push({ section: label, phrase });
      tally.violations.push(`${label}: "${phrase}" is medical framing`);
      continue;
    }
    const validated = validateAction(rawMove.action, facts);
    const proposedKind = str((rawMove.action as Record<string, unknown> | undefined)?.kind);
    if (validated.action.kind === "none" && proposedKind !== "none") {
      actionsInvalidated.push({ index: moves.length, reason: validated.note ?? "invalid action" });
    }
    // A proposed target or a planned day's numbers are the move's own evidence —
    // but only a writable action's: a `none` carries the REASON an invalid one
    // was refused, and its numbers ("from 2200 to 1200 kcal") are not evidence.
    const extra = validated.action.kind === "none" ? [] : numbersIn(validated.action);
    const title = liftCites(rawTitle, []);
    const why = liftCites(rawWhy, rawMove.cites);
    const cites = [...new Set([...title.cites, ...why.cites])];
    const flags = [
      ...checkText(`${label} title`, title.text, cites, LIMITS.moveTitleWords, allowance, extra, factIds, tally),
      ...checkText(label, why.text, cites, LIMITS.moveWhyWords, allowance, extra, factIds, tally),
    ];
    moves.push({
      title: title.text,
      why: why.text,
      cites,
      action: validated.action,
      ...(flags.length ? { flags } : {}),
      ...(validated.note ? { actionNote: validated.note } : {}),
    });
  }
  if (moves.length < LIMITS.moves) {
    tally.violations.push(`${moves.length} moves; exactly ${LIMITS.moves} are expected`);
  }

  return {
    review: {
      headline,
      ...(headlineFlags.length ? { headlineFlags } : {}),
      verdict,
      whatHappened,
      whatItMeans,
      moves,
    },
    checks: {
      unverified: tally.unverified,
      uncited: tally.uncited,
      unknownCites: tally.unknownCites,
      tooLong: tally.tooLong,
      medicalRemoved: tally.medical,
      actionsInvalidated,
      attempts: attempt.attempts,
      retried: attempt.retried,
    },
    violations: tally.violations,
  };
}

/** Worth one more call to the model? (docs/coach-plan.md §2.3 rule 5) */
export function needsRetry(result: CheckResult): boolean {
  const { checks, review } = result;
  return (
    checks.unverified + checks.uncited > 2 ||
    checks.unknownCites > 0 ||
    checks.medicalRemoved.length > 0 ||
    review.moves.length < LIMITS.moves
  );
}
