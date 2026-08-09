import {
  addDaysToDateString,
  getDateStringInTimeZone,
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
