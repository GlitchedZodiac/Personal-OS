// Quiet hours, and the other pure decisions the notification pipeline makes:
// when a notification must wait, when a silent pipeline has been silent too
// long, and what a weigh-in says in one line. No database here — the part
// under test.
//
// "Local" is always the timezone the DEVICE last reported, never a
// hard-coded one: the same 10pm–7am follows him from Bogotá to Houston the
// first time the app is opened there.

import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getZonedDateParts,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";

export const DEFAULT_QUIET_START = "22:00";
export const DEFAULT_QUIET_END = "07:00";

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isValidClock(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

/** "22:00" → 1320. Anything unreadable → null. */
export function clockToMinutes(value: string): number | null {
  const match = HHMM.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface QuietWindow {
  enabled: boolean;
  start: string;
  end: string;
}

/**
 * Is `now` inside the quiet window? The start is inclusive and the end is
 * not: with 22:00–07:00, 22:00 is quiet and 07:00 is not — so something
 * scheduled for exactly 7 goes out at 7. A window that ends before it starts
 * runs overnight. Equal start and end is an empty window, not a 24-hour one.
 */
export function isQuiet(now: Date, timeZone: string, window: QuietWindow): boolean {
  if (!window.enabled) return false;
  const start = clockToMinutes(window.start);
  const end = clockToMinutes(window.end);
  if (start === null || end === null || start === end) return false;
  const parts = getZonedDateParts(now, timeZone);
  const minute = parts.hour * 60 + parts.minute;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** The instant the quiet window `now` is in comes to an end. */
export function quietEndsAt(now: Date, timeZone: string, window: QuietWindow): Date {
  const start = clockToMinutes(window.start) ?? 0;
  const end = clockToMinutes(window.end) ?? 0;
  const parts = getZonedDateParts(now, timeZone);
  const minute = parts.hour * 60 + parts.minute;
  const today = getDateStringInTimeZone(now, timeZone);
  // Overnight window, and we are in its evening half → it ends tomorrow.
  const endsTomorrow = start > end && minute >= start;
  const day = endsTomorrow ? addDaysToDateString(today, 1) : today;
  return zonedLocalDateTimeToUtc(day, timeZone, Math.floor(end / 60), end % 60, 0);
}

// ————— Pipelines that have gone quiet —————

export const SYNC_ALERT_AFTER_DAYS = 2;
/** once it has alerted, how long before it says so again */
export const SYNC_ALERT_REPEAT_DAYS = 3;

const DAY_MS = 86_400_000;

export interface SyncState {
  source: string;
  label: string;
  heartbeat: boolean;
  lastSuccessAt: Date | null;
  lastError: string | null;
  failingSince: Date | null;
}

export interface SyncAlert {
  source: string;
  title: string;
  body: string;
  /** one alert per source per repeat-window, however often the check runs */
  dedupeKey: string;
}

/**
 * Should this pipeline raise an alert right now?
 *
 *   failing   it has been erroring since `failingSince`, 2+ days ago
 *   stalled   it is a heartbeat source and has not reported in 2+ days —
 *             for the companion that means the phone app has not synced at
 *             all, which is a different thing from "he did not weigh in"
 *
 * A source that has never once succeeded is not "broken", it is not set up
 * yet, and says nothing.
 */
export function syncAlertFor(state: SyncState, now: Date): SyncAlert | null {
  const failing = state.failingSince !== null;
  const since = failing
    ? state.failingSince
    : state.heartbeat
      ? state.lastSuccessAt
      : null;
  if (!since) return null;
  if (!failing && !state.lastSuccessAt) return null;

  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  if (days < SYNC_ALERT_AFTER_DAYS) return null;

  const bucket = Math.floor((days - SYNC_ALERT_AFTER_DAYS) / SYNC_ALERT_REPEAT_DAYS);
  const dedupeKey = `sync:${state.source}:${since.toISOString().slice(0, 10)}:${bucket}`;

  if (failing) {
    const why = state.lastError ? ` Last error: ${state.lastError.slice(0, 90)}` : "";
    return {
      source: state.source,
      title: `${state.label} sync is failing`,
      body: `No successful sync for ${days} days.${why}`,
      dedupeKey,
    };
  }
  return {
    source: state.source,
    title: `${state.label} hasn't synced`,
    body: `Nothing has arrived for ${days} days. Open Pitaya on your iPhone to restart it.`,
    dedupeKey,
  };
}

// ————— "New weigh-in synced" —————

export interface WeighInFacts {
  weightKg: number;
  bodyFatPct?: number | null;
  /** the weigh-in before this one, if there is one */
  previousWeightKg?: number | null;
  previousAt?: Date | null;
  measuredAt: Date;
  units?: "metric" | "imperial";
  timeZone: string;
}

const KG_TO_LB = 2.2046226218;

/** "82.8 kg · 13.2% body fat · −0.9 kg since Sat" — facts only, no model. */
export function weighInSummary(facts: WeighInFacts): string {
  const imperial = facts.units === "imperial";
  const unit = imperial ? "lb" : "kg";
  const show = (kg: number) => (imperial ? kg * KG_TO_LB : kg).toFixed(1);

  const parts = [`${show(facts.weightKg)} ${unit}`];
  if (typeof facts.bodyFatPct === "number" && facts.bodyFatPct > 0) {
    parts.push(`${facts.bodyFatPct.toFixed(1)}% body fat`);
  }
  if (typeof facts.previousWeightKg === "number" && facts.previousAt) {
    const delta = facts.weightKg - facts.previousWeightKg;
    const shown = Math.abs(imperial ? delta * KG_TO_LB : delta);
    const when = sinceLabel(facts.previousAt, facts.measuredAt, facts.timeZone);
    parts.push(
      shown < 0.05
        ? `same as ${when}`
        : `${delta < 0 ? "−" : "+"}${shown.toFixed(1)} ${unit} since ${when}`
    );
  }
  return parts.join(" · ");
}

function sinceLabel(previous: Date, current: Date, timeZone: string): string {
  const prevDay = getDateStringInTimeZone(previous, timeZone);
  const curDay = getDateStringInTimeZone(current, timeZone);
  if (prevDay === curDay) return "earlier today";
  if (prevDay === addDaysToDateString(curDay, -1)) return "yesterday";
  const withinWeek = current.getTime() - previous.getTime() < 7 * DAY_MS;
  return new Intl.DateTimeFormat(
    "en-US",
    withinWeek ? { timeZone, weekday: "short" } : { timeZone, month: "short", day: "numeric" }
  ).format(previous);
}

/** Only a weigh-in that is actually news gets announced — never a backfill. */
export const WEIGH_IN_NEWS_HOURS = 36;

export function isFreshWeighIn(measuredAt: Date, now: Date): boolean {
  const age = now.getTime() - measuredAt.getTime();
  return age >= -DAY_MS && age <= WEIGH_IN_NEWS_HOURS * 3_600_000;
}
