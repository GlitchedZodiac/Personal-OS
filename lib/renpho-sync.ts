import { ingestRenphoRecords } from "@/lib/body-ingest";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { RenphoError, fetchRenphoRecords } from "@/lib/renpho-client";
import { announceWeighIn } from "@/lib/weigh-in-notice";

// The RENPHO pull as a job: fetch → ingest → log the run → raise an alert if
// the pull has gone quiet. Deterministic backend work — no model is involved.
//
// OFF BY DEFAULT. A login with his own account signs his phone's Renpho Health
// app out (2026-10-04), which stops the scale reaching the cloud at all. Until
// that is solved — a separate service account, most likely — running this on a
// schedule would do harm, so every trigger goes through `renphoSyncEnabled()`
// and an accidental call is a no-op. See docs/renpho-gap-report.md.

const PROVIDER = "renpho";
const FAILURES_BEFORE_ALERT = 3;
const SILENCE_MS = 48 * 3600_000;
const ALERT_COOLDOWN_MS = 24 * 3600_000;

export type SyncTrigger = "cron" | "manual" | "apple_health" | "backfill";

export function renphoSyncEnabled(): boolean {
  return (
    process.env.RENPHO_SYNC_ENABLED === "1" &&
    Boolean(process.env.RENPHO_EMAIL && process.env.RENPHO_PASSWORD)
  );
}

export interface SyncRunSummary {
  ok: boolean;
  startedAt: Date;
  alerted: boolean;
  error: string | null;
}

export interface AlertInputs {
  /** Newest first. */
  recentRuns: readonly SyncRunSummary[];
  /** Newest weigh-in the RENPHO cloud has delivered. */
  lastRenphoAt: Date | null;
  /** Apple Health weigh-ins RENPHO has not delivered, any order. */
  undeliveredAppleHealth: readonly Date[];
  now: Date;
}

/**
 * Should he be told the pull is broken? Returns the message, or null.
 *
 * Two conditions, per his spec:
 *  - three failed runs in a row, or
 *  - Apple Health has held a weigh-in for 48 hours that RENPHO never
 *    delivered — the pull "succeeds" but returns nothing new, which is what a
 *    signed-out phone or a silently changed API looks like from here.
 *
 * At most one alert a day: a broken sync that runs hourly must not become an
 * hourly notification.
 */
export function renphoAlertFor(input: AlertInputs): string | null {
  const now = input.now.getTime();
  const recentlyAlerted = input.recentRuns.some(
    (run) => run.alerted && now - run.startedAt.getTime() < ALERT_COOLDOWN_MS
  );
  if (recentlyAlerted) return null;

  const latest = input.recentRuns.slice(0, FAILURES_BEFORE_ALERT);
  if (latest.length === FAILURES_BEFORE_ALERT && latest.every((run) => !run.ok)) {
    return `The RENPHO sync has failed ${FAILURES_BEFORE_ALERT} times in a row (${latest[0].error ?? "unknown error"}). Weight still arrives through Apple Health; composition does not.`;
  }

  const since = input.lastRenphoAt?.getTime() ?? 0;
  const stranded = input.undeliveredAppleHealth.filter(
    (at) => at.getTime() > since && now - at.getTime() >= SILENCE_MS
  );
  if (stranded.length > 0) {
    return `Apple Health has ${stranded.length} weigh-in${stranded.length === 1 ? "" : "s"} that RENPHO never delivered. Open the Renpho Health app and check you are still signed in.`;
  }

  return null;
}

/** An error message safe to store and show: never the credentials. */
function describe(error: unknown): string {
  if (error instanceof RenphoError) return error.message;
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

export interface SyncOutcome {
  ran: boolean;
  reason?: string;
  ok?: boolean;
  fetched?: number;
  created?: number;
  merged?: number;
  unchanged?: number;
  skipped?: number;
  error?: string;
  alert?: string | null;
  /** True when this run announced a weigh-in itself, so the caller need not. */
  announced?: boolean;
}

export async function runRenphoSync(
  trigger: SyncTrigger,
  options: { maxPages?: number } = {}
): Promise<SyncOutcome> {
  if (!renphoSyncEnabled()) {
    return { ran: false, reason: "RENPHO sync is switched off" };
  }

  const run = await prisma.bodySyncRun.create({
    data: { provider: PROVIDER, trigger },
  });

  let outcome: SyncOutcome;
  try {
    const records = await fetchRenphoRecords(
      {
        email: process.env.RENPHO_EMAIL as string,
        password: process.env.RENPHO_PASSWORD as string,
        targetUserId: process.env.RENPHO_TARGET_USER_ID || undefined,
      },
      { maxPages: options.maxPages }
    );
    const { touched, ...counts } = await ingestRenphoRecords(records);
    await prisma.bodySyncRun.update({
      where: { id: run.id },
      data: { ok: true, finishedAt: new Date(), ...counts },
    });
    // Announced here, after the merge, so the line carries body fat. The
    // Apple Health post that usually triggers this run holds its own
    // weight-only announcement back and lets this one speak.
    await announceWeighIn(touched);
    outcome = { ran: true, ok: true, ...counts, announced: touched.length > 0 };
  } catch (error) {
    const message = describe(error);
    console.error(`[renpho-sync] ${trigger} run failed: ${message}`);
    await prisma.bodySyncRun.update({
      where: { id: run.id },
      data: { ok: false, finishedAt: new Date(), error: message },
    });
    outcome = { ran: true, ok: false, error: message };
  }

  outcome.alert = await raiseAlertIfNeeded(run.id);
  return outcome;
}

async function raiseAlertIfNeeded(runId: string): Promise<string | null> {
  const [recentRuns, lastRenpho] = await Promise.all([
    prisma.bodySyncRun.findMany({
      where: { provider: PROVIDER },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { ok: true, startedAt: true, alerted: true, error: true },
    }),
    prisma.bodyMeasurement.findFirst({
      where: { externalId: { startsWith: `${PROVIDER}:` } },
      orderBy: { measuredAt: "desc" },
      select: { measuredAt: true },
    }),
  ]);
  const undelivered = await prisma.bodyMeasurement.findMany({
    where: {
      source: "apple_health",
      externalId: null,
      weightKg: { not: null },
      // Before the first RENPHO reading there is nothing to compare against —
      // the months of Etekcity weigh-ins are not undelivered RENPHO records.
      measuredAt: { gt: lastRenpho?.measuredAt ?? new Date() },
    },
    select: { measuredAt: true },
  });

  const message = renphoAlertFor({
    recentRuns,
    lastRenphoAt: lastRenpho?.measuredAt ?? null,
    undeliveredAppleHealth: undelivered.map((row) => row.measuredAt),
    now: new Date(),
  });
  if (!message) return null;

  // Claim first, so two overlapping runs cannot both send. Delivery goes
  // through the one notification door: logged, held during quiet hours, and
  // governed by the System alerts switch.
  await prisma.bodySyncRun.update({ where: { id: runId }, data: { alerted: true } });
  await notify({
    category: "systemAlerts",
    title: "Scale sync needs a look",
    body: message,
    url: "/health/body",
    tag: "renpho-sync",
  });
  return message;
}

/** What the Body screen needs to say "last synced …". */
export async function renphoSyncStatus() {
  const [lastRun, lastOk, lastReading] = await Promise.all([
    prisma.bodySyncRun.findFirst({
      where: { provider: PROVIDER },
      orderBy: { startedAt: "desc" },
    }),
    prisma.bodySyncRun.findFirst({
      where: { provider: PROVIDER, ok: true },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.bodyMeasurement.findFirst({
      where: { externalId: { startsWith: `${PROVIDER}:` } },
      orderBy: { measuredAt: "desc" },
      select: { measuredAt: true },
    }),
  ]);
  return {
    enabled: renphoSyncEnabled(),
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunOk: lastRun?.ok ?? null,
    lastError: lastRun && !lastRun.ok ? lastRun.error : null,
    lastSuccessAt: lastOk?.startedAt ?? null,
    lastReadingAt: lastReading?.measuredAt ?? null,
  };
}
