export const DEFAULT_TIME_ZONE = "America/Bogota";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toInteger(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateParts(dateStr: string) {
  const match = DATE_RE.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timeZone?: string | null) {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return DEFAULT_TIME_ZONE;
}

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const normalizedZone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: toInteger(lookup.year),
    month: toInteger(lookup.month),
    day: toInteger(lookup.day),
    hour: toInteger(lookup.hour),
    minute: toInteger(lookup.minute),
    second: toInteger(lookup.second),
  };
}

export function formatDateParts(parts: Pick<ZonedDateParts, "year" | "month" | "day">) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function getDateStringInTimeZone(date: Date, timeZone: string) {
  return formatDateParts(getZonedDateParts(date, timeZone));
}

export function getHourInTimeZone(date: Date, timeZone: string) {
  return getZonedDateParts(date, timeZone).hour;
}

/**
 * Returns an offset in the same convention as Date#getTimezoneOffset:
 * UTC - local time in minutes.
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((date.getTime() - asUtc) / 60_000);
}

export function addDaysToDateString(dateStr: string, days: number) {
  const { year, month, day } = parseDateParts(dateStr);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0, 0));
  return formatDateParts({
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  });
}

export function getWeekStartDateString(
  dateStr: string,
  weekStartsOn: 0 | 1 = 1
) {
  const { year, month, day } = parseDateParts(dateStr);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0..6
  const delta = (dayOfWeek - weekStartsOn + 7) % 7;
  return addDaysToDateString(dateStr, -delta);
}

export function dateStringDiffDays(startDateStr: string, endDateStr: string) {
  const start = parseDateParts(startDateStr);
  const end = parseDateParts(endDateStr);
  const startMs = Date.UTC(start.year, start.month - 1, start.day, 0, 0, 0, 0);
  const endMs = Date.UTC(end.year, end.month - 1, end.day, 0, 0, 0, 0);
  return Math.floor((endMs - startMs) / 86_400_000);
}

/**
 * Convert a local date/time in an IANA timezone into an exact UTC Date.
 */
export function zonedLocalDateTimeToUtc(
  dateStr: string,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0
) {
  const { year, month, day } = parseDateParts(dateStr);
  const baseLocalMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let utcMs = baseLocalMs;

  // Iterate for DST boundary correctness.
  for (let i = 0; i < 4; i++) {
    const offset = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
    const nextUtcMs = baseLocalMs + offset * 60_000;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

export function getUtcDayBoundsForTimeZone(dateStr: string, timeZone: string) {
  const dayStart = zonedLocalDateTimeToUtc(dateStr, timeZone, 0, 0, 0);
  const nextDateStr = addDaysToDateString(dateStr, 1);
  const nextDayStart = zonedLocalDateTimeToUtc(nextDateStr, timeZone, 0, 0, 0);
  return {
    dayStart,
    dayEnd: new Date(nextDayStart.getTime() - 1),
  };
}

export function getUtcDateRangeForTimeZone(
  startDateStr: string,
  endDateStr: string,
  timeZone: string
) {
  const rangeStart = zonedLocalDateTimeToUtc(startDateStr, timeZone, 0, 0, 0);
  const endExclusive = zonedLocalDateTimeToUtc(
    addDaysToDateString(endDateStr, 1),
    timeZone,
    0,
    0,
    0
  );
  return {
    rangeStart,
    rangeEnd: new Date(endExclusive.getTime() - 1),
  };
}

export function getTimeZoneOffsetMinutesForDateString(
  dateStr: string,
  timeZone: string
) {
  const middayUtc = zonedLocalDateTimeToUtc(dateStr, timeZone, 12, 0, 0);
  return getTimeZoneOffsetMinutes(middayUtc, timeZone);
}

export function getDateTimeIsoForLocalDateUsingCurrentTime(
  dateStr: string,
  timeZone: string,
  now = new Date()
) {
  const nowParts = getZonedDateParts(now, timeZone);
  return zonedLocalDateTimeToUtc(
    dateStr,
    timeZone,
    nowParts.hour,
    nowParts.minute,
    nowParts.second
  ).toISOString();
}

export const COMMON_TIME_ZONES = [
  "America/Bogota",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "UTC",
] as const;
