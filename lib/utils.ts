import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parse } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a "yyyy-MM-dd" string as a local date (not UTC).
 * Shared utility to avoid duplication across API routes.
 */
export function parseLocalDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

/**
 * Build UTC start/end boundaries for a local calendar day using a client timezone offset.
 * `tzOffsetMinutes` should come from `new Date().getTimezoneOffset()` on the client.
 */
export function getUtcDayBounds(dateStr: string, tzOffsetMinutes: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcStartMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const utcEndMs = utcStartMs + 86_399_999;
  return {
    dayStart: new Date(utcStartMs),
    dayEnd: new Date(utcEndMs),
  };
}
