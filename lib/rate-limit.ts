import type { NextRequest } from "next/server";
import { getClientIdentifier, isKnownDevice } from "@/lib/auth";
import { defaultRateStore, type RateStore } from "@/lib/rate-limit-store";

// The PIN-door limiter (audit 2026-10, SEC-005; PLAN D2 + D2b).
//  - per client (IPv6 by /64): 5 failures in 10 minutes block that client
//    for the rest of the 10 minutes;
//  - GLOBAL per door: AUTH_GLOBAL_MAX_FAILURES (default 50) failures in
//    AUTH_GLOBAL_WINDOW_MINUTES (default 60), from anyone, lock the door for
//    the rest of the window and raise a system alert (lib/pin-attempt);
//  - during a lock only a KNOWN DEVICE (the signed marker a successful login
//    sets) with no failures of its own gets a real PIN check.
// The counters live in Postgres (lib/rate-limit-store), shared by every
// serverless instance — before, each warm instance had its own budget.
// Kept out of lib/auth.ts on purpose: proxy.ts imports that file, and the
// proxy must not pull in the database client.

const PER_CLIENT_MAX_FAILURES = 5;
const PER_CLIENT_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_MAX_FAILURES_DEFAULT = 50;
const GLOBAL_WINDOW_MINUTES_DEFAULT = 60;

function intEnv(name: string, fallback: number, min: number, max: number) {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** The global cap, read per call so a deploy-time env change applies without a restart. */
export function globalLoginLimits() {
  const maxFailures = intEnv("AUTH_GLOBAL_MAX_FAILURES", GLOBAL_MAX_FAILURES_DEFAULT, 5, 100_000);
  const windowMinutes = intEnv("AUTH_GLOBAL_WINDOW_MINUTES", GLOBAL_WINDOW_MINUTES_DEFAULT, 1, 24 * 60);
  return { maxFailures, windowMinutes, windowMs: windowMinutes * 60 * 1000 };
}

export interface FailureOutcome {
  /** This failure is the one that tripped the global lock. */
  globalLockTriggered: boolean;
  maxFailures: number;
  windowMinutes: number;
  retryAfterSeconds: number;
}

export interface RateLimitCheck {
  /** Neither this client nor the door is locked. */
  allowed: boolean;
  retryAfterSeconds: number;
  /** The door is under a global lock. */
  globalLocked: boolean;
  /** This client has no failures of its own in the window. */
  clientClean: boolean;
  /** The request carries a valid known-device marker (PLAN D2b). */
  knownDevice: boolean;
  /** Locked only globally, this client is clean AND a known device: a CORRECT PIN may still pass. */
  exemptIfCorrect: boolean;
  registerFailure: () => Promise<FailureOutcome>;
  /** On success: clears this client's failures. The global count decays on its own. */
  reset: () => Promise<void>;
}

const remaining = (until: number | null | undefined, now: number) => (until && until > now ? until - now : 0);

export async function checkRateLimit(
  request: NextRequest,
  scope: string,
  store: RateStore = defaultRateStore()
): Promise<RateLimitCheck> {
  const now = Date.now();
  const clientKey = `${scope}:${getClientIdentifier(request)}`;
  const globalKey = `${scope}:*`;
  const { maxFailures, windowMinutes, windowMs } = globalLoginLimits();

  const buckets = await store.read([clientKey, globalKey], now);
  const client = buckets.get(clientKey);
  const global = buckets.get(globalKey);
  const clientBlockedMs = remaining(client?.blockedUntil, now);
  const globalBlockedMs = remaining(global?.blockedUntil, now);
  const clientClean = !client || client.resetAt <= now || client.attempts === 0;
  const globalLocked = globalBlockedMs > 0;
  const waitMs = Math.max(clientBlockedMs, globalBlockedMs);
  const knownDevice = globalLocked ? isKnownDevice(request) : false;

  return {
    allowed: waitMs === 0,
    retryAfterSeconds: Math.ceil(waitMs / 1000),
    globalLocked,
    clientClean,
    knownDevice,
    exemptIfCorrect: globalLocked && clientBlockedMs === 0 && clientClean && knownDevice,
    registerFailure: async () => {
      await store.fail(clientKey, PER_CLIENT_MAX_FAILURES, PER_CLIENT_WINDOW_MS, now);
      const after = await store.fail(globalKey, maxFailures, windowMs, now);
      // Exactly one failure makes the count equal the cap — that one trips it.
      const tripped = after.attempts === maxFailures;
      const lockEnd = after.blockedUntil ?? 0;
      if (globalLocked || tripped) {
        // A wrong guess during (or causing) a lock spends this client's chance
        // for the rest of the lock, known device or not.
        await store.blockUntil(clientKey, lockEnd);
      }
      if (tripped) {
        console.error(
          `[auth] ${scope}: ${maxFailures} failed attempts in the last ${windowMinutes} min across all clients — locked for ${Math.ceil((lockEnd - now) / 60000)} min`
        );
      }
      return {
        globalLockTriggered: tripped,
        maxFailures,
        windowMinutes,
        retryAfterSeconds: Math.max(0, Math.ceil((lockEnd - now) / 1000)),
      };
    },
    reset: async () => {
      await store.clear(clientKey);
    },
  };
}
