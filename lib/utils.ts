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
