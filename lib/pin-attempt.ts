import { after, NextRequest } from "next/server";
import { checkRateLimit, type RateLimitCheck } from "@/lib/rate-limit";
import { notify } from "@/lib/notify";
import { verifyPin } from "@/lib/pin-auth";

// One PIN attempt, the same way at every PIN door (web login, PIN change,
// device pairing): the limiter first, then the stored PIN. During a global
// lock only a KNOWN DEVICE (lib/auth known-device marker, PLAN D2b) with no
// wrong guesses of its own gets a real check; every other caller gets 429
// without the PIN being looked at. Tripping the lock raises a system alert
// so Michael learns someone is hammering the door.

export type PinAttempt =
  | { status: "ok" }
  | { status: "wrong" }
  | { status: "locked"; retryAfterSeconds: number };

const DOOR_LABEL: Record<string, string> = {
  "auth-login": "the web login",
  "auth-update-pin": "the PIN change",
  "mobile-pair": "device pairing",
};

export async function alertPinLockout(
  scope: string,
  info: { maxFailures: number; windowMinutes: number; retryAfterSeconds: number }
) {
  const door = DOOR_LABEL[scope] ?? scope;
  const hour = new Date().toISOString().slice(0, 13); // one alert per door per hour
  try {
    await notify({
      category: "systemAlerts",
      title: "Someone is hammering the PIN",
      body: `${info.maxFailures} wrong PINs at ${door} in ${info.windowMinutes} min. That door is locked for ${Math.max(1, Math.ceil(info.retryAfterSeconds / 60))} min. A browser you have signed in on before still gets in with your PIN; to pair a new device, use Settings → "Unlock device pairing".`,
      url: "/settings",
      tag: "pin-lockout",
      dedupeKey: `pin-lockout:${scope}:${hour}`,
    });
  } catch {
    // The alert must never affect the login path.
  }
}

export async function attemptPin(request: NextRequest, scope: string, pin: unknown): Promise<PinAttempt> {
  const limit: RateLimitCheck = await checkRateLimit(request, scope);
  if (!limit.allowed && !limit.exemptIfCorrect) {
    return { status: "locked", retryAfterSeconds: limit.retryAfterSeconds };
  }

  if (await verifyPin(pin)) {
    await limit.reset();
    return { status: "ok" };
  }

  const failure = await limit.registerFailure();
  if (failure.globalLockTriggered) {
    after(() => alertPinLockout(scope, failure));
  }
  // A wrong guess from the known device during a lock spends its exemption
  // for the rest of the lock (answered as the lock answers).
  if (limit.exemptIfCorrect) {
    return { status: "locked", retryAfterSeconds: Math.max(failure.retryAfterSeconds, 1) };
  }
  return { status: "wrong" };
}

export function lockedResponseInit(retryAfterSeconds: number) {
  return { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } } as const;
}
