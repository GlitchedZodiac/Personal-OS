import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getZonedDateParts,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";

// Natural-language meal-timing inference. Extracted from the AI chat route so
// the behavior is unit-testable — this logic decides which DAY a food log
// lands on, which is the app's most user-visible timezone bug surface.

type FoodFunctionItem = {
  mealType?: string;
  foodDescription?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  notes?: string;
  loggedAt?: string;
  [key: string]: unknown;
};

export function normalizeFoodLoggedAtValue(value: unknown, timeZone: string) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const raw = value.trim();

  // Interpret plain local date/time strings in the app timezone.
  const localDateTime = raw.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (localDateTime) {
    const dateStr = localDateTime[1];
    const hour = Number.parseInt(localDateTime[2] || "12", 10);
    const minute = Number.parseInt(localDateTime[3] || "00", 10);
    const second = Number.parseInt(localDateTime[4] || "00", 10);

    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      Number.isFinite(second)
    ) {
      return zonedLocalDateTimeToUtc(
        dateStr,
        timeZone,
        Math.max(0, Math.min(23, hour)),
        Math.max(0, Math.min(59, minute)),
        Math.max(0, Math.min(59, second))
      ).toISOString();
    }
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function inferFoodLoggedAtFromMessage(
  message: string,
  timeZone: string,
  now: Date
) {
  const lower = message.toLowerCase();
  const todayDateStr = getDateStringInTimeZone(now, timeZone);

  let targetDate: string | null = null;
  let hasTemporalHint = false;

  const isoDateMatch = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDateMatch) {
    targetDate = isoDateMatch[1];
    hasTemporalHint = true;
  } else if (/\b(yesterday|ayer|last night|anoche)\b/.test(lower)) {
    targetDate = addDaysToDateString(todayDateStr, -1);
    hasTemporalHint = true;
  } else if (
    /\b(today|hoy|tonight|this morning|this afternoon|this evening|esta ma(?:n|ñ)ana|esta tarde|esta noche)\b/.test(
      lower
    )
  ) {
    targetDate = todayDateStr;
    hasTemporalHint = true;
  } else if (/\b(tomorrow|ma(?:n|ñ)ana)\b/.test(lower)) {
    targetDate = addDaysToDateString(todayDateStr, 1);
    hasTemporalHint = true;
  }

  let hour: number | null = null;
  let minute = 0;

  const amPmMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (amPmMatch) {
    hasTemporalHint = true;
    const parsedHour = Number.parseInt(amPmMatch[1], 10);
    const parsedMinute = Number.parseInt(amPmMatch[2] || "0", 10);

    if (Number.isFinite(parsedHour) && Number.isFinite(parsedMinute)) {
      let normalizedHour = parsedHour % 12;
      if (amPmMatch[3] === "pm") normalizedHour += 12;
      hour = normalizedHour;
      minute = Math.max(0, Math.min(59, parsedMinute));
    }
  } else {
    const h24Match = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (h24Match) {
      hasTemporalHint = true;
      const parsedHour = Number.parseInt(h24Match[1], 10);
      const parsedMinute = Number.parseInt(h24Match[2], 10);

      if (Number.isFinite(parsedHour) && Number.isFinite(parsedMinute)) {
        hour = parsedHour;
        minute = parsedMinute;
      }
    }
  }

  if (!targetDate && hasTemporalHint) {
    targetDate = todayDateStr;
  }
  if (!targetDate) return null;

  if (hour === null) {
    if (/\b(last night|anoche|tonight|esta noche|cena|dinner)\b/.test(lower)) {
      hour = 20;
    } else if (
      /\b(this morning|morning|esta ma(?:n|ñ)ana|desayuno|breakfast)\b/.test(
        lower
      )
    ) {
      hour = 8;
    } else if (
      /\b(this afternoon|afternoon|esta tarde|almuerzo|lunch)\b/.test(lower)
    ) {
      hour = 13;
    } else if (/\b(snack|merienda)\b/.test(lower)) {
      hour = 16;
    } else {
      hour = 12;
    }
  }

  return zonedLocalDateTimeToUtc(
    targetDate,
    timeZone,
    hour,
    minute,
    0
  ).toISOString();
}

export function normalizeFoodItemsWithTiming(
  items: unknown,
  userMessage: string,
  timeZone: string,
  now: Date
) {
  if (!Array.isArray(items)) return [];
  const inferredLoggedAt = inferFoodLoggedAtFromMessage(userMessage, timeZone, now);

  return items.map((item) => {
    if (!item || typeof item !== "object") return item;

    const typed = item as FoodFunctionItem;
    const explicitLoggedAt = normalizeFoodLoggedAtValue(typed.loggedAt, timeZone);

    if (explicitLoggedAt) {
      return { ...typed, loggedAt: explicitLoggedAt };
    }

    if (inferredLoggedAt) {
      return { ...typed, loggedAt: inferredLoggedAt };
    }

    return typed;
  });
}

// ─── Meal words vs the model's clock (2026-10-18) ─────────────────────────
//
// The prompt tells the model "date without time → 12:00". The Phase 2
// baseline showed it following that rule even when the message named a meal
// ("yesterday for dinner" stamped 12:00). The model's own `loggedAt` wins
// over the message-level inference above, so the correction has to look at
// the stamp itself: a stamp at exactly 12:00:00 local is the rule's default,
// not a time anyone said; when the message names a meal, that meal's hour
// replaces it. A stamp at any other minute is left alone.

const MEAL_HOURS: Array<[RegExp, number]> = [
  [/\b(breakfast|desayuno|this morning|esta ma(?:n|ñ)ana|morning)\b/i, 8],
  [/\b(lunch|almuerzo|this afternoon|esta tarde)\b/i, 13],
  [/\b(snack|merienda|onces)\b/i, 16],
  [/\b(dinner|cena|tonight|esta noche|last night|anoche)\b/i, 20],
];

/** The hour a meal word implies, or null when the message names none (or several). */
export function mealWordHour(message: string): number | null {
  const hits = MEAL_HOURS.filter(([re]) => re.test(message)).map(([, h]) => h);
  const distinct = [...new Set(hits)];
  return distinct.length === 1 ? distinct[0] : null;
}

/**
 * Replace the rule's 12:00:00 default with the meal word's hour, item by
 * item, keeping each item's own local day. Items whose stamp is not exactly
 * noon, or messages with no single meal word, are returned unchanged.
 */
export function reconcileLoggedAtWithMealWord<T extends { loggedAt?: string }>(
  items: T[],
  message: string,
  timeZone: string
): T[] {
  const hour = mealWordHour(message);
  if (hour === null || hour === 12) return items;
  return items.map((item) => {
    if (typeof item.loggedAt !== "string") return item;
    const at = new Date(item.loggedAt);
    if (!Number.isFinite(at.getTime())) return item;
    const parts = getZonedDateParts(at, timeZone);
    if (parts.hour !== 12 || parts.minute !== 0 || parts.second !== 0) return item;
    const day = getDateStringInTimeZone(at, timeZone);
    return { ...item, loggedAt: zonedLocalDateTimeToUtc(day, timeZone, hour, 0, 0).toISOString() };
  });
}

// ─── A meal is never eaten in the future (2026-10-20) ─────────────────────
//
// "At 7pm I ate two empanadas", said at 8 am, means last night. The clock
// rules above (and the model, following them) put it at 19:00 TODAY — a meal
// eleven hours from now. Food logs record what was eaten, so a stamp more
// than 15 minutes ahead of now is moved back one day; a stamp carrying an
// explicit date in the message ("2026-10-21") is left alone.

const FUTURE_SLACK_MS = 15 * 60_000;

export function pullFutureMealsBack<T extends { loggedAt?: string }>(
  items: T[],
  message: string,
  now: Date
): T[] {
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(message)) return items;
  return items.map((item) => {
    if (typeof item.loggedAt !== "string") return item;
    const at = new Date(item.loggedAt);
    if (!Number.isFinite(at.getTime()) || at.getTime() - now.getTime() <= FUTURE_SLACK_MS) return item;
    // whole days back until it is no longer ahead of now (normally one)
    let t = at.getTime();
    while (t - now.getTime() > FUTURE_SLACK_MS) t -= 86_400_000;
    return { ...item, loggedAt: new Date(t).toISOString() };
  });
}
