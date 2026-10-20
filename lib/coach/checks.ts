// The post-check (2026-10-17, lane B — docs/coach-plan.md §2.3; reworked in
// review round 3). Pure, and importable on the client.
//
// EVERY NUMBER IS CHECKED AGAINST THE FACTS ITS OWN SENTENCE CITES — and
// their derivedFrom parents — with its unit. A number that happens to equal
// some other fact (a sleep figure that matches a protein count) does not
// pass; "6 days" against a fact counted in sessions does not pass; "lb"
// never passes a kilogram fact. Number words ("seven days", "a dozen
// sessions") and ranges ("3–4", both ends) are read like digits. A date
// passes only inside the review's window (or named by a cited fact), a clock
// time only when a cited fact or the move's own reminder states it. A move's
// own evidence is its STRUCTURED payload — the kcal, %, grams, kg, day
// count, reminder time — never its free-text titles or notes.
//
// Nothing is silently fixed: a bad number is flagged and shown; a line with
// medical framing is taken out VISIBLY (its original kept in the checks); a
// bad action becomes a text-only move with the reason kept.

import { MEASURED_FIELDS } from "@/lib/body-measurements";
import { addDaysToDateString, getDateStringInTimeZone, zonedLocalDateTimeToUtc } from "@/lib/timezone";
import type {
  CoachAction,
  Fact,
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
/** How far one macro's share may move in a week, in percentage points. */
export const MACRO_MAX_SHIFT_POINTS = 10;
/** A reminder may be set up to this many days past the reviewed week's Sunday. */
export const REMINDER_HORIZON_DAYS = 8;

// ————— units —————

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(kg|kgs|kilos?|kilograms?)$/, "kg"],
  [/^(lb|lbs|pounds?)$/, "lb"],
  [/^(kcal|cal|cals|calories|calorie)$/, "kcal"],
  [/^(g|grams?)$/, "g"],
  [/^(%|percent|pct)$/, "%"],
  [/^(h|hr|hrs|hours?)$/, "h"],
  [/^(min|mins|minutes?)$/, "min"],
  [/^(s|sec|secs|seconds?)$/, "s"],
  [/^steps?$/, "steps"],
  [/^(sessions?|workouts?)$/, "sessions"],
  [/^days?$/, "days"],
  [/^nights?$/, "nights"],
  [/^bpm$/, "bpm"],
  [/^ms$/, "ms"],
  [/^(km|kilometers?|kilometres?)$/, "km"],
  [/^(m|meters?|metres?)$/, "m"],
  [/^ml$/, "ml"],
  [/^(records?|prs?)$/, "records"],
  [/^weigh-?ins?$/, "weigh-ins"],
  [/^pages?$/, "pages"],
  [/^reps?$/, "reps"],
  [/^sets?$/, "sets"],
  [/^rounds?$/, "rounds"],
];

export function normUnit(word: string | null | undefined): string | null {
  if (!word) return null;
  const w = word.toLowerCase().replace(/[.,;:!?)]+$/, "");
  for (const [re, unit] of UNIT_ALIASES) if (re.test(w)) return unit;
  return null;
}

/** A fact's unit, normalised: "kg/week" and "kg-reps" are kilograms. */
function factUnit(unit: string | undefined): string | null {
  if (!unit) return null;
  return normUnit(unit.split(/[/-]/)[0]) ?? unit;
}

function compatible(prose: string | null, fact: string | null): boolean {
  if (!prose || !fact) return true;
  if (prose === fact) return true;
  // "weighed in on 2 days" / "2 weigh-ins" against a count of weigh-in days
  return (prose === "weigh-ins" && fact === "days") || (prose === "days" && fact === "weigh-ins");
}

/** Nouns that count the review's own structure, not anything measured: "three moves". */
const STRUCTURAL = /^(moves?|things?|ways?|changes?|items?|points?|ideas?|priorities|priority|habits?|tweaks?|levers?|questions?)$/i;

// ————— number words —————

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, dozen: 12,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD_RE = new RegExp(
  String.raw`\b(?:a\s+)?(${[...Object.keys(TENS), ...Object.keys(SMALL)].join("|")})(?:[\s-](${Object.keys(SMALL).slice(1, 10).join("|")}))?\b`,
  "gi"
);

// ————— tokens —————

export interface NumberToken {
  raw: string;
  value: number;
  unit: string | null;
}

export interface Tokens {
  numbers: NumberToken[];
  /** clock times as minutes past midnight */
  times: Array<{ raw: string; minutes: number }>;
  /** month-day pairs written as dates: "10-12" */
  dates: Array<{ raw: string; key: string }>;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_WORD = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const DATE_PATTERNS: Array<{ re: RegExp; key: (m: RegExpMatchArray) => string }> = [
  { re: /\b\d{4}-(\d{2})-(\d{2})\b/g, key: (m) => `${Number(m[1])}-${Number(m[2])}` },
  {
    re: new RegExp(String.raw`\b${MONTH_WORD}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "gi"),
    key: (m) => `${MONTHS.indexOf(m[1].toLowerCase()) + 1}-${Number(m[2])}`,
  },
  {
    re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH_WORD}`, "gi"),
    key: (m) => `${MONTHS.indexOf(m[2].toLowerCase()) + 1}-${Number(m[1])}`,
  },
];
const TIME_12 = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
const TIME_24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const CITE_RE = /\[\s*(f\d+(?:\s*,\s*f\d+)*)\s*\]/g;
const RANGE_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:–|—|-|\bto\b)\s*(\d[\d,]*(?:\.\d+)?)/g;
const NUMBER_RE = /[−-]?\d[\d,]*(?:\.\d+)?(?:k(?![a-z]))?/gi;

export function toNumber(token: string): number {
  const cleaned = token.replace(/,/g, "").replace("−", "-");
  const k = /k$/i.test(cleaned);
  const n = Number.parseFloat(k ? cleaned.slice(0, -1) : cleaned);
  return k ? n * 1000 : n;
}

const nextWord = (text: string, from: number): string | null => {
  const m = /^\s*(%|[a-z][a-z-]*)/i.exec(text.slice(from));
  return m ? m[1] : null;
};

/** Read every number, time and date out of a line, as a person wrote them. */
export function tokenize(input: string): Tokens {
  const out: Tokens = { numbers: [], times: [], dates: [] };
  let text = input.replace(CITE_RE, " ").replace(/\bf\d+\b/g, " ").replace(/\bZ[1-5]\b/g, " ");

  text = text.replace(TIME_12, (raw, h: string, m: string | undefined, ap: string) => {
    const hour = (Number(h) % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);
    out.times.push({ raw: raw.trim(), minutes: hour * 60 + Number(m ?? 0) });
    return " ";
  });
  text = text.replace(TIME_24, (raw, h: string, m: string) => {
    out.times.push({ raw, minutes: Number(h) * 60 + Number(m) });
    return " ";
  });
  for (const p of DATE_PATTERNS) {
    text = text.replace(new RegExp(p.re.source, p.re.flags), (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      out.dates.push({ raw: m[0], key: p.key(m) });
      return " ";
    });
  }
  // Ranges: both ends are claims, and the unit after the range is theirs.
  text = text.replace(RANGE_RE, (raw, a: string, b: string, offset: number, whole: string) => {
    const unit = normUnit(nextWord(whole, offset + raw.length));
    out.numbers.push({ raw: a, value: toNumber(a), unit }, { raw: b, value: toNumber(b), unit });
    return " ";
  });
  const re = new RegExp(NUMBER_RE.source, NUMBER_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let raw = m[0].replace(/,+$/, "");
    const before = m.index > 0 ? text[m.index - 1] : " ";
    if (/^[−-]/.test(raw) && /[\p{L}\d]/u.test(before)) raw = raw.slice(1); // "week-3": not a minus
    const value = toNumber(raw);
    if (!Number.isFinite(value)) continue;
    const word = nextWord(text, m.index + m[0].length);
    if (word && STRUCTURAL.test(word) && Number.isInteger(value) && value >= 1 && value <= 3) continue; // "3 moves"
    out.numbers.push({ raw, value, unit: normUnit(word) });
  }
  // Number words count only when they quantify something measured.
  const wre = new RegExp(WORD_RE.source, WORD_RE.flags);
  while ((m = wre.exec(text)) !== null) {
    const word = nextWord(text, m.index + m[0].length);
    if (!word || STRUCTURAL.test(word)) continue;
    const unit = normUnit(word);
    if (!unit) continue;
    const head = m[1].toLowerCase();
    const value = (TENS[head] ?? SMALL[head]) + (m[2] ? SMALL[m[2].toLowerCase()] : 0);
    out.numbers.push({ raw: m[0].trim(), value, unit });
  }
  return out;
}

export function extractNumbers(text: string): string[] {
  return tokenize(text).numbers.map((n) => n.raw);
}

// ————— evidence —————

export interface Evidence {
  numbers: Array<{ value: number; unit: string | null }>;
  times: Set<number>;
  dates: Set<string>;
}

const monthDay = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}-${d}`;
};

/** Dates the prose may name without a fact: the reviewed week, the one before it, and the reminder horizon. */
export function windowDates(facts: WeekFacts): Set<string> {
  const out = new Set<string>();
  const horizon = addDaysToDateString(facts.weekEnd, REMINDER_HORIZON_DAYS);
  for (let day = addDaysToDateString(facts.weekStart, -7); day <= horizon; day = addDaysToDateString(day, 1)) {
    out.add(monthDay(day));
  }
  return out;
}

/** The cited facts and everything they were derived from. */
export function citedClosure(cites: string[], facts: Fact[]): Fact[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const queue = [...cites];
  const out: Fact[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const f = byId.get(id);
    if (!f) continue;
    out.push(f);
    queue.push(...(f.derivedFrom ?? []));
  }
  return out;
}

export function evidenceFrom(cited: Fact[], window: Set<string>): Evidence {
  const ev: Evidence = { numbers: [], times: new Set(), dates: new Set(window) };
  for (const f of cited) {
    if (typeof f.value === "number") ev.numbers.push({ value: f.value, unit: factUnit(f.unit) });
    if (typeof f.value === "string") {
      const t = tokenize(f.value);
      for (const n of t.numbers) ev.numbers.push({ value: n.value, unit: n.unit });
      for (const x of t.times) ev.times.add(x.minutes);
      for (const d of t.dates) ev.dates.add(d.key);
    }
    for (const d of f.source.dates ?? []) ev.dates.add(monthDay(d));
    for (const d of tokenize(f.label).dates) ev.dates.add(d.key);
  }
  return ev;
}

/** A move's own evidence — its STRUCTURED payload only, never a title or a note. */
export function payloadEvidence(action: CoachAction, facts: WeekFacts): Evidence {
  const ev: Evidence = { numbers: [], times: new Set(), dates: new Set() };
  switch (action.kind) {
    case "plan_week":
      ev.numbers.push({ value: action.days.length, unit: "days" }, { value: action.days.length, unit: "sessions" });
      for (const d of action.days) {
        ev.dates.add(monthDay(d.date));
        if (d.targetWeightKg) ev.numbers.push({ value: d.targetWeightKg, unit: "kg" });
      }
      break;
    case "adjust_targets": {
      const t = facts.targets;
      const kcal = action.calorieTarget ?? t.calorieTarget;
      ev.numbers.push({ value: kcal, unit: "kcal" });
      const cur = currentPcts(facts);
      const pcts = { proteinPct: action.proteinPct ?? cur.proteinPct, carbsPct: action.carbsPct ?? cur.carbsPct, fatPct: action.fatPct ?? cur.fatPct };
      for (const v of Object.values(pcts)) ev.numbers.push({ value: v, unit: "%" });
      ev.numbers.push(
        { value: Math.round((kcal * pcts.proteinPct) / 100 / 4), unit: "g" },
        { value: Math.round((kcal * pcts.carbsPct) / 100 / 4), unit: "g" },
        { value: Math.round((kcal * pcts.fatPct) / 100 / 9), unit: "g" }
      );
      break;
    }
    case "set_reminder": {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(action.atLocal);
      if (m) {
        ev.dates.add(monthDay(m[1]));
        ev.times.add(Number(m[2]) * 60 + Number(m[3]));
      }
      break;
    }
    case "log_measurement":
      if (action.when) ev.dates.add(monthDay(action.when));
      break;
  }
  return ev;
}

function merge(a: Evidence, b: Evidence): Evidence {
  return {
    numbers: [...a.numbers, ...b.numbers],
    times: new Set([...a.times, ...b.times]),
    dates: new Set([...a.dates, ...b.dates]),
  };
}

function valueMatches(n: number, e: number): boolean {
  const x = Math.abs(n);
  const y = Math.abs(e);
  if (Number.isInteger(x)) return y === x || Math.round(y) === x;
  return Math.abs(y - x) <= 0.05 || (y !== 0 && Math.abs(y - x) / y <= 0.01);
}

/** Every number, date and time in `text` that the evidence does not carry. */
export function unverifiedTokens(text: string, ev: Evidence): string[] {
  const t = tokenize(text);
  const bad: string[] = [];
  for (const n of t.numbers) {
    if (!ev.numbers.some((e) => valueMatches(n.value, e.value) && compatible(n.unit, e.unit))) {
      bad.push(n.unit ? `${n.raw} ${n.unit}` : n.raw);
    }
  }
  for (const d of t.dates) if (!ev.dates.has(d.key)) bad.push(d.raw);
  for (const x of t.times) if (!ev.times.has(x.minutes)) bad.push(x.raw);
  return bad;
}

const hasClaims = (text: string) => {
  const t = tokenize(text);
  return t.numbers.length + t.times.length > 0;
};

// ————— citations —————

/** Pull inline [f12] markers out of the text and into the cites list. */
export function liftCites(text: string, cites: unknown): { text: string; cites: string[] } {
  const found = new Set<string>((Array.isArray(cites) ? cites : []).map(String).filter((c) => /^f\d+$/.test(c)));
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
//
// Phrases, not bare words: "treat yourself to a rest day", "a full dose of
// sleep" and "supplement your walks" are coaching; a condition named, a
// diagnosis implied, a treatment, a dose or a supplement to take is not.

const MEDICAL_RE: RegExp[] = [
  /\bdiagnos\w*/i,
  /\b(?:disease|disorder|syndrome|deficienc(?:y|ies)|deficient)\b/i,
  /\byou (?:may|might|likely|probably|could) have\b/i,
  /\b(?:suffering|suffer) from\b/i,
  /\bat (?:high |higher |increased |some )?risk (?:of|for)\b/i,
  /\b(?:treatment|therapy|medication|medicine|prescription|prescribed?)\b/i,
  /\btreat(?:ing)? (?:it|this|that|the|your|an?) (?:injury|condition|symptoms?|pain|inflammation|deficiency)\b/i,
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|iu)\b/i,
  /\bdosage\b/i,
  /\b(?:take|try|start|add|use) (?:a |some )?(?:supplements?|melatonin|magnesium|zinc|iron|vitamin \w+|fish oil|creatine|ashwagandha|caffeine pills?)\b/i,
  /\b(?:see|consult|talk to|ask|check with|visit) (?:a|your) (?:doctor|physician|gp|cardiologist|specialist|dietitian|nutritionist)\b/i,
  /\bmedical(?:ly)?\b/i,
  /\b(?:insomnia|sleep apnoea|sleep apnea|apnea|hypertension|hypotension|blood pressure|diabet\w*|prediabet\w*|anemi\w*|anaemi\w*|thyroid\w*|depress\w*|anxiety disorder|obes\w*|overweight|underweight|malnutri\w*|malnourish\w*|arrhythmi\w*|overtrain\w*|testosterone|cortisol|inflamm\w*|injur\w*|burnout|burned out|burnt out|chronic fatigue|adrenal\w*|infection|illness)\b/i,
  /\bheart (?:condition|failure|disease|attack|problem|issue)s?\b/i,
  /\bcardiac\b/i,
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

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function resolveName(name: unknown, pool: Array<{ name: string }>): string | undefined {
  const n = str(name).toLowerCase();
  if (!n) return undefined;
  return pool.find((p) => p.name.trim().toLowerCase() === n)?.name;
}

/** His current macro shares, from the targets the facts carry (grams back to percent). */
export function currentPcts(facts: WeekFacts): { proteinPct: number; carbsPct: number; fatPct: number } {
  const t = facts.targets;
  const pct = (grams: number, perGram: number) => (t.calorieTarget > 0 ? Math.round((grams * perGram * 100) / t.calorieTarget) : 0);
  return { proteinPct: pct(t.proteinTargetG, 4), carbsPct: pct(t.carbsTargetG, 4), fatPct: pct(t.fatTargetG, 9) };
}

/**
 * Validate one action against the week's facts. Returns the action as the
 * card will write it (names resolved, strays stripped), or `none` with the
 * reason. stillWritable() re-checks the clock-dependent rules at confirm.
 */
export function validateAction(raw: unknown, facts: WeekFacts): { action: CoachAction; note?: string } {
  const a = (raw ?? {}) as Record<string, unknown>;
  const kind = str(a.kind);
  const none = (reason: string): { action: CoachAction; note: string } => ({ action: { kind: "none", reason }, note: reason });

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
        if (str(d.routineName)) {
          const routine = resolveName(d.routineName, facts.routines);
          if (routine) day.routineName = routine;
          else notes.push(`routine "${str(d.routineName)}" not found`);
        }
        if (str(d.trailName)) {
          const trail = resolveName(d.trailName, facts.trails);
          if (trail) day.trailName = trail;
          else notes.push(`trail "${str(d.trailName)}" not found`);
        }
        const kg = num(d.targetWeightKg);
        if (kg != null && kg > 0 && kg <= 200) day.targetWeightKg = kg;
        const n = str(d.notes).slice(0, 200);
        if (n) day.notes = n;
        // `reminders` is dropped: the planner would write Reminder rows the card never showed.
        days.push(day);
      }
      if (a.replaceWeek === true) notes.push("replacing a week's plan is not offered — these days are added alongside it");
      if (days.length === 0) return none(notes[0] ?? "no valid days to plan");
      days.sort((x, y) => x.date.localeCompare(y.date));
      // replaceWeek is never offered from a review: on a begun week it would
      // delete days already planned (review round 3, item 8).
      return { action: { kind: "plan_week", days, replaceWeek: false }, ...(notes.length ? { note: notes.join("; ") } : {}) };
    }

    case "adjust_targets": {
      const current = facts.targets.calorieTarget;
      const out: Extract<CoachAction, { kind: "adjust_targets" }> = { kind: "adjust_targets" };
      const kcal = num(a.calorieTarget);
      if (kcal != null) {
        if (kcal < 1000 || kcal > 6000) return none(`a ${kcal} kcal target is out of bounds`);
        if (Math.abs(kcal - current) / current > TARGET_MAX_SHIFT) {
          return none(`a move from ${current} to ${kcal} kcal is more than ${Math.round(TARGET_MAX_SHIFT * 100)}% — too big for one week`);
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
        const cur = currentPcts(facts);
        const shifts: Array<[string, number]> = [
          ["protein", Math.round(p) - cur.proteinPct],
          ["carbs", Math.round(c) - cur.carbsPct],
          ["fat", Math.round(f) - cur.fatPct],
        ];
        // one point of slack: the current shares are read back from rounded grams
        const big = shifts.find(([, d]) => Math.abs(d) > MACRO_MAX_SHIFT_POINTS + 1);
        if (big) return none(`moving ${big[0]} by ${Math.abs(big[1])} points is more than ${MACRO_MAX_SHIFT_POINTS} for one week`);
        if (shifts.some(([, d]) => d !== 0)) {
          out.proteinPct = Math.round(p);
          out.carbsPct = Math.round(c);
          out.fatPct = Math.round(f);
        }
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
      if (m[1] < facts.weekStart || m[1] > horizon) return none(`${m[1]} is outside the ${REMINDER_HORIZON_DAYS} days after the week`);
      return { action: { kind: "set_reminder", title, atLocal } };
    }

    case "log_measurement": {
      const fields = [...new Set((Array.isArray(a.fields) ? a.fields : []).map(str).filter((f) => MEASURED.has(f)))];
      if (fields.length === 0) return none("no measurable field was named");
      const when = str(a.when);
      const inWindow = DAY_RE.test(when) && when >= facts.weekStart && when <= facts.nextWeek.weekEnd;
      return {
        action: { kind: "log_measurement", fields, ...(inWindow ? { when } : {}) },
        ...(when && !inWindow ? { note: `${when} is outside the review's weeks — the measurement is timed when you confirm` } : {}),
      };
    }

    default:
      return none(kind ? `unknown action "${kind}"` : "no action");
  }
}

/**
 * At CONFIRM time: can this action still be written as shown? A plan for a
 * week that has begun, or a reminder whose moment has passed, cannot. Pure;
 * `timeZone` is where he is. The confirm route runs it on the server.
 */
export function stillWritable(action: CoachAction, now: Date, timeZone: string): { ok: true } | { ok: false; reason: string } {
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
  medical: Array<{ section: string; phrase: string; text: string }>;
  truncated: Array<{ section: string; dropped: number }>;
  violations: string[];
}

interface Ctx {
  facts: WeekFacts;
  window: Set<string>;
  ids: Set<string>;
  tally: Tally;
}

function checkText(section: string, text: string, cites: string[], limit: number, ctx: Ctx, extra?: Evidence): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const unknown = cites.filter((c) => !ctx.ids.has(c));
  let ev = evidenceFrom(citedClosure(cites, ctx.facts.facts), ctx.window);
  if (extra) ev = merge(ev, extra);
  const bad = unverifiedTokens(text, ev);
  if (bad.length) {
    flags.push({ kind: "unverified", tokens: bad });
    ctx.tally.unverified++;
    ctx.tally.violations.push(`${section}: these are not in the facts it cites (with their units): ${bad.join(", ")} — "${text}"`);
  }
  if (hasClaims(text) && cites.length === 0) {
    flags.push({ kind: "uncited" });
    ctx.tally.uncited++;
    ctx.tally.violations.push(`${section}: cite the fact ids behind the numbers in "${text}"`);
  }
  if (unknown.length) {
    flags.push({ kind: "unknown_cite", ids: unknown });
    ctx.tally.unknownCites++;
    ctx.tally.violations.push(`${section}: ${unknown.join(", ")} are not fact ids`);
  }
  const w = words(text);
  if (w > limit) {
    flags.push({ kind: "too_long", words: w, limit });
    ctx.tally.tooLong++;
    ctx.tally.violations.push(`${section}: ${w} words, the limit is ${limit}`);
  }
  return flags;
}

function checkItems(section: string, items: unknown, maxItems: number, maxWords: number, ctx: Ctx): ReviewItem[] {
  const list = (Array.isArray(items) ? items : []) as Array<Record<string, unknown>>;
  const kept = list.filter((raw) => str(raw?.text));
  if (kept.length > maxItems) {
    ctx.tally.truncated.push({ section, dropped: kept.length - maxItems });
    ctx.tally.violations.push(`${section}: ${kept.length} items; at most ${maxItems}`);
  }
  return kept.slice(0, maxItems).map((raw) => {
    const rawText = str(raw.text);
    const phrase = medicalPhrase(rawText);
    if (phrase) {
      ctx.tally.medical.push({ section, phrase, text: rawText });
      ctx.tally.violations.push(`${section}: "${phrase}" is medical framing — describe the numbers and the next move, nothing clinical`);
      return { text: "", cites: [], removed: { reason: "medical", phrase } };
    }
    const { text, cites } = liftCites(rawText, raw.cites);
    const flags = checkText(section, text, cites, maxWords, ctx);
    return { text, cites, ...(flags.length ? { flags } : {}) };
  });
}

const FALLBACK_HEADLINE = "The week, in numbers";

export function checkReview(raw: unknown, facts: WeekFacts, attempt: { attempts: number; retried: boolean }): CheckResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ctx: Ctx = {
    facts,
    window: windowDates(facts),
    ids: new Set(facts.facts.map((f) => f.id)),
    tally: { unverified: 0, uncited: 0, unknownCites: 0, tooLong: 0, medical: [], truncated: [], violations: [] },
  };

  // The headline cites nothing, so it may state no number at all.
  let headline = liftCites(str(r.headline), []).text.replace(/[.\s]+$/, "") || FALLBACK_HEADLINE;
  const headlineFlags: ReviewFlag[] = [];
  const headlinePhrase = medicalPhrase(headline);
  if (headlinePhrase) {
    ctx.tally.medical.push({ section: "headline", phrase: headlinePhrase, text: headline });
    ctx.tally.violations.push(`headline: "${headlinePhrase}" is medical framing`);
    headline = FALLBACK_HEADLINE;
  } else {
    const bad = unverifiedTokens(headline, { numbers: [], times: new Set(), dates: new Set() });
    if (bad.length) {
      headlineFlags.push({ kind: "unverified", tokens: bad });
      ctx.tally.unverified++;
      ctx.tally.violations.push(`headline: no numbers in the headline (it cites nothing) — found ${bad.join(", ")}`);
    }
    if (words(headline) > LIMITS.headlineWords) {
      headlineFlags.push({ kind: "too_long", words: words(headline), limit: LIMITS.headlineWords });
      ctx.tally.tooLong++;
      ctx.tally.violations.push(`headline: ${words(headline)} words, the limit is ${LIMITS.headlineWords}`);
    }
  }
  const verdictInvalid = !(r.verdict === "on_track" || r.verdict === "off_track" || r.verdict === "mixed");
  if (verdictInvalid) ctx.tally.violations.push(`verdict must be on_track, mixed or off_track — got ${JSON.stringify(r.verdict ?? null)}`);
  const verdict = verdictInvalid ? "mixed" : (r.verdict as ReviewJson["verdict"]);

  const whatHappened = checkItems("what happened", r.whatHappened, LIMITS.happenedItems, LIMITS.happenedWords, ctx);
  const whatItMeans = checkItems("what it means", r.whatItMeans, LIMITS.meansItems, LIMITS.meansWords, ctx);

  const moves: ReviewMove[] = [];
  const actionsInvalidated: Array<{ index: number; reason: string }> = [];
  const rawMoves = ((Array.isArray(r.moves) ? r.moves : []) as Array<Record<string, unknown>>).filter((m) => str(m?.title));
  if (rawMoves.length > LIMITS.moves) ctx.tally.truncated.push({ section: "moves", dropped: rawMoves.length - LIMITS.moves });
  for (const rawMove of rawMoves.slice(0, LIMITS.moves)) {
    const index = moves.length;
    const label = `move ${index + 1}`;
    const rawTitle = str(rawMove.title);
    const rawWhy = str(rawMove.why);
    const phrase = medicalPhrase(`${rawTitle} ${rawWhy}`);
    if (phrase) {
      // Kept in place, visibly — never dropped (a dropped move once forced a paid retry).
      ctx.tally.medical.push({ section: label, phrase, text: `${rawTitle} — ${rawWhy}` });
      ctx.tally.violations.push(`${label}: "${phrase}" is medical framing`);
      moves.push({ title: "", why: "", cites: [], action: { kind: "none", reason: "removed: medical framing" }, removed: { reason: "medical", phrase } });
      continue;
    }
    const validated = validateAction(rawMove.action, facts);
    const proposedKind = str((rawMove.action as Record<string, unknown> | undefined)?.kind);
    if (validated.action.kind === "none" && proposedKind !== "none") {
      actionsInvalidated.push({ index, reason: validated.note ?? "invalid action" });
    }
    const extra = payloadEvidence(validated.action, facts);
    const title = liftCites(rawTitle, []);
    const why = liftCites(rawWhy, rawMove.cites);
    const cites = [...new Set([...title.cites, ...why.cites])];
    const flags = [
      ...checkText(`${label} title`, title.text, cites, LIMITS.moveTitleWords, ctx, extra),
      ...checkText(label, why.text, cites, LIMITS.moveWhyWords, ctx, extra),
    ];
    // a title with numbers and a why that cites them is fine; report "uncited" once
    const merged = flags.filter((f, i) => f.kind !== "uncited" || flags.findIndex((g) => g.kind === "uncited") === i);
    moves.push({
      title: title.text,
      why: why.text,
      cites,
      action: validated.action,
      ...(merged.length ? { flags: merged } : {}),
      ...(validated.note ? { actionNote: validated.note } : {}),
    });
  }
  if (moves.filter((m) => !m.removed).length < LIMITS.moves) {
    ctx.tally.violations.push(`${moves.filter((m) => !m.removed).length} usable moves; exactly ${LIMITS.moves} are expected`);
  }

  return {
    review: { headline, ...(headlineFlags.length ? { headlineFlags } : {}), verdict, whatHappened, whatItMeans, moves },
    checks: {
      unverified: ctx.tally.unverified,
      uncited: ctx.tally.uncited,
      unknownCites: ctx.tally.unknownCites,
      tooLong: ctx.tally.tooLong,
      medicalRemoved: ctx.tally.medical,
      actionsInvalidated,
      ...(verdictInvalid ? { verdictInvalid: true } : {}),
      ...(ctx.tally.truncated.length ? { truncated: ctx.tally.truncated } : {}),
      attempts: attempt.attempts,
      retried: attempt.retried,
    },
    violations: ctx.tally.violations,
  };
}

/** Worth one more call to the model? (docs/coach-plan.md §2.3 rule 5) */
export function needsRetry(result: CheckResult): boolean {
  const { checks, review } = result;
  return (
    checks.unverified + checks.uncited > 2 ||
    checks.unknownCites > 0 ||
    checks.medicalRemoved.length > 0 ||
    review.moves.filter((m) => !m.removed).length < LIMITS.moves
  );
}
