// Chat history, the pure half: how the old endless thread is split into
// days, how a chat gets its name, when a quiet chat counts as finished, and
// which shelf ("Today", "This week"…) a chat sits on. No database, no DOM —
// shared by the server (lib/chat-conversations.ts) and the drawer, and the
// part the tests pin down.
//
// TIME. Every stored timestamp is UTC. A calendar day only ever appears
// here as the answer to "which day is this instant, in THAT timezone":
//   · the one-off split of the old thread uses America/Bogota, because that
//     is where every one of those messages was written;
//   · everything he looks at uses the timezone of the device he is holding,
//     so the shelves re-sort themselves correctly the day he lands in
//     Houston — nothing is stored that would have to be migrated.

import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

export const LEGACY_SPLIT_TIME_ZONE = "America/Bogota";

/** One chat, as the shelf and the chat screen see it. Timestamps are UTC ISO. */
export interface ConversationSummary {
  id: string;
  title: string;
  /** auto = first words · ai = named from the first exchange · user = his */
  titleSource: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  /** search only: the text that matched */
  snippet?: string | null;
}

// ————— New chat after a quiet gap —————
// WHY SIX HOURS. Within a day his meals are 4–6 hours apart and a follow-up
// ("make it two eggs", "and the other picture too") lands within minutes, so
// six keeps a whole day's logging in one transcript where "it" still means
// something. A night's sleep is always longer, so each morning opens clean —
// which is also what splitting the old thread by calendar day produces, so
// history and habit agree. And the model only ever replays THIS chat, so a
// shorter transcript is a cheaper, less confusable one. 0 turns it off.
export const DEFAULT_NEW_CHAT_GAP_HOURS = 6;
export const NEW_CHAT_GAP_CHOICES = [0, 1, 3, 6, 12, 24] as const;

export function normalizeGapHours(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_NEW_CHAT_GAP_HOURS;
  return Math.min(24 * 7, n);
}

/** Has this chat been quiet long enough that the next message starts a new one? */
export function isStale(
  lastMessageAt: Date | string | null | undefined,
  now: Date,
  gapHours: number
): boolean {
  if (!(gapHours > 0) || !lastMessageAt) return false;
  const last = new Date(lastMessageAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last > gapHours * 3_600_000;
}

// ————— Titles —————

export const TITLE_MAX = 60;

/** The stream route's stand-in text for a photo sent with no words. */
const PHOTO_PLACEHOLDER = /^\((?:\d+\s+)?photos?\b.*\)$/i;
const FREESTYLE_PREFIX = /^freestyle session to describe:?/i;

/** Whatever is typed, said, or returned by the model → something a list can show. */
export function sanitizeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  const oneLine = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’`*#\-\s]+|["'“”‘’`*\s]+$/g, "")
    .replace(/[.。]+$/g, "")
    .trim();
  if (oneLine.length <= TITLE_MAX) return oneLine;
  const cut = oneLine.slice(0, TITLE_MAX);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > TITLE_MAX * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

export function dayLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * A name from the first words — no model call. Used the instant a chat is
 * born (so the shelf never shows a blank row) and for every chat minted by
 * splitting the old thread (thirty days of history is not worth thirty model
 * calls). A photo sent with no words has nothing to quote, so it borrows the
 * names of what was logged; failing that, the day.
 */
export function deriveTitle(input: {
  firstUserText?: string | null;
  itemNames?: readonly string[];
  at: Date;
  timeZone: string;
}): string {
  const text = (input.firstUserText ?? "").trim();
  if (FREESTYLE_PREFIX.test(text)) return "Freestyle session";
  if (text && !PHOTO_PLACEHOLDER.test(text)) {
    const title = sanitizeTitle(text);
    if (title) return title.charAt(0).toUpperCase() + title.slice(1);
  }
  const items = (input.itemNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (items.length > 0) {
    // "Sancocho de gallina broth only, ~1 large bowl (no chicken…)" → the dish
    const short = items.slice(0, 2).map((n) => n.split(/[,(]/)[0].trim());
    const more = items.length > 2 ? ` +${items.length - 2}` : "";
    return sanitizeTitle(`${short.join(" + ")}${more}`);
  }
  return dayLabel(input.at, input.timeZone);
}

/** Item names carried by a proposal card's payload, if it is a food card. */
export function itemNamesFromMeta(meta: unknown): string[] {
  const items = (meta as { data?: { items?: unknown } } | null)?.data?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => (it as { foodDescription?: unknown })?.foodDescription)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

// ————— Splitting the old endless thread —————

export interface LegacyMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  meta?: unknown;
}

export interface LegacyDayPlan {
  /** YYYY-MM-DD in the split timezone */
  day: string;
  messageIds: string[];
  firstAt: Date;
  lastAt: Date;
  title: string;
}

/**
 * One conversation per calendar day. Every message lands in exactly one day,
 * in its original order; nothing is dropped, merged or rewritten — the only
 * thing this decides is which chat each row is filed under.
 */
export function planLegacySplit(
  messages: readonly LegacyMessage[],
  timeZone: string = LEGACY_SPLIT_TIME_ZONE
): LegacyDayPlan[] {
  const sorted = [...messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const byDay = new Map<string, LegacyMessage[]>();
  for (const message of sorted) {
    const day = getDateStringInTimeZone(message.createdAt, timeZone);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(message);
    else byDay.set(day, [message]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, rows]) => {
      const firstUser = rows.find((r) => r.role === "user");
      const firstCard = rows.find((r) => itemNamesFromMeta(r.meta).length > 0);
      return {
        day,
        messageIds: rows.map((r) => r.id),
        firstAt: rows[0].createdAt,
        lastAt: rows[rows.length - 1].createdAt,
        title: deriveTitle({
          firstUserText: firstUser?.content,
          itemNames: firstCard ? itemNamesFromMeta(firstCard.meta) : [],
          at: rows[0].createdAt,
          timeZone,
        }),
      };
    });
}

// ————— The shelves —————

export type RecencyKey = "today" | "thisWeek" | "lastWeek" | "lastMonth" | "older";

export const RECENCY_ORDER: readonly RecencyKey[] = [
  "today",
  "thisWeek",
  "lastWeek",
  "lastMonth",
  "older",
];

export const RECENCY_LABEL: Record<RecencyKey, string> = {
  today: "Today",
  thisWeek: "This week",
  lastWeek: "Last week",
  lastMonth: "Last month",
  older: "Older",
};

/**
 * Which shelf an instant sits on, seen from `now` in `timeZone`. The five
 * shelves are consecutive, non-overlapping stretches of the calendar, newest
 * first, so a chat can never sort above one that is more recent than it:
 *
 *   Today       the local calendar day
 *   This week   earlier in this Monday-to-Sunday week
 *   Last week   the Monday-to-Sunday before it
 *   Last month  everything before that, back to the 1st of last month
 *   Older       the rest
 *
 * ("Last month" therefore also holds the first days of THIS month once they
 * are older than last week — the alternative is a shelf that jumps over
 * them, or a sixth label he did not ask for.)
 */
export function recencyOf(at: Date | string, now: Date, timeZone: string): RecencyKey {
  const day = getDateStringInTimeZone(new Date(at), timeZone);
  const today = getDateStringInTimeZone(now, timeZone);
  if (day >= today) return "today";

  const weekStart = getWeekStartDateString(today, 1);
  if (day >= weekStart) return "thisWeek";

  const lastWeekStart = addDaysToDateString(weekStart, -7);
  if (day >= lastWeekStart) return "lastWeek";

  const [year, month] = today.split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  if (day >= lastMonthStart) return "lastMonth";

  return "older";
}

export interface RecencyGroup<T> {
  key: RecencyKey;
  label: string;
  items: T[];
}

/** Newest first within each shelf; empty shelves are left out. */
export function groupByRecency<T extends { lastMessageAt: string | Date }>(
  items: readonly T[],
  now: Date,
  timeZone: string
): RecencyGroup<T>[] {
  const buckets = new Map<RecencyKey, T[]>();
  const sorted = [...items].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
  for (const item of sorted) {
    const key = recencyOf(item.lastMessageAt, now, timeZone);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return RECENCY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: RECENCY_LABEL[key],
    items: buckets.get(key) as T[],
  }));
}

/** The right-hand stamp on a row: a time today, a weekday this fortnight, a date before. */
export function rowStamp(at: Date | string, now: Date, timeZone: string): string {
  const date = new Date(at);
  const key = recencyOf(date, now, timeZone);
  if (key === "today") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  if (key === "thisWeek" || key === "lastWeek") {
    // en-US renders {weekday, day} as "3 Sat"; he reads "Sat 3".
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
    }).formatToParts(date);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${pick("weekday")} ${pick("day")}`.trim();
  }
  const sameYear =
    getDateStringInTimeZone(date, timeZone).slice(0, 4) ===
    getDateStringInTimeZone(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

// ————— Search —————

/** Literal text → a safe ILIKE pattern (the caller adds ESCAPE '\'). */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** The words around the first hit, so a result shows WHY it matched. */
export function buildSnippet(
  text: string | null | undefined,
  query: string,
  radius = 36
): Snippet | null {
  const q = query.trim();
  if (!text || !q) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + q.length + radius);
  return {
    before: `${start > 0 ? "…" : ""}${flat.slice(start, at)}`,
    match: flat.slice(at, at + q.length),
    after: `${flat.slice(at + q.length, end)}${end < flat.length ? "…" : ""}`,
  };
}
