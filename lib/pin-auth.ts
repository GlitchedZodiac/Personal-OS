import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { assertHashWritesAllowed, canRewriteHashes, checkPinHash, CURRENT_KEY_VERSION, hashPin, isLegacyPinHash, pinMarker } from "@/lib/security";

// The ONE place the PIN lives (SEC-004/SEC-065, 2026-10): `auth_credentials`
// (scrypt, salted, peppered) — for the web login AND device pairing. APP_PIN
// is the bootstrap seed, used only when the row is missing. It is never a
// second valid PIN.
//
// Before: the web login compared against process.env.APP_PIN, pairing against
// this row, and /api/auth/update-pin rewrote `.env.local` (read-only on
// Vercel) and ONE instance's process.env — so a "changed" PIN worked on that
// warm instance, minted cookies no other instance accepted (intermittent
// 401s), and silently reverted at the next cold start, while devices kept the
// old PIN. With APP_PIN unset the fallback was the literal "1234", which
// pairing accepted and wrote into the row.

const RESET_FLAG = "APP_PIN_RESET";

export function cleanPin(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\r\n/g, "").replace(/\n/g, "").replace(/\r/g, "").trim();
}

/** The bootstrap seed from the environment, or null. */
function seedPin(): string | null {
  const v = cleanPin(process.env.APP_PIN);
  return v.length > 0 ? v : null;
}

function safeEqual(a: string, b: string) {
  const d = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(d(a), d(b));
}

async function getStoredCredential() {
  return prisma.authCredential.findUnique({
    where: { id: "default" },
    select: { pinHash: true, resetConsumedFor: true, keyVersion: true },
  });
}

export async function getStoredPinHash() {
  return (await getStoredCredential())?.pinHash || null;
}

/** Is the stored PIN still in the pre-audit form? (Settings shows it.) */
export async function pinOnLegacyKey(): Promise<boolean> {
  const row = await getStoredCredential();
  return Boolean(row && (row.keyVersion ?? 1) < CURRENT_KEY_VERSION);
}

/** Is there any PIN to check against — a stored row, or a seed to create one from? */
export async function pinConfigured(): Promise<boolean> {
  if (seedPin()) return true;
  return Boolean(await getStoredPinHash());
}

/** Write (or overwrite) the stored PIN in the current hash format. */
export async function ensurePinCredential(pin: string, extra: { resetConsumedFor?: string } = {}) {
  assertHashWritesAllowed();
  const pinHash = hashPin(pin);
  const data = { pinHash, keyVersion: CURRENT_KEY_VERSION, ...extra };
  return prisma.authCredential.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

async function alertPinReset(reason: string) {
  try {
    const { notify } = await import("@/lib/notify");
    await notify({
      category: "systemAlerts",
      title: "Your PIN was reset from APP_PIN",
      body: `${reason}. If you did not do this, change your PIN in Settings and remove APP_PIN_RESET in Vercel.`,
      url: "/settings",
      tag: "pin-reset",
      dedupeKey: `pin-reset:${new Date().toISOString().slice(0, 13)}`,
    });
  } catch {
    // The alert must never affect the login path.
  }
}

export async function verifyPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 64) return false;
  const stored = await getStoredCredential();
  const seed = seedPin();

  if (!stored?.pinHash) {
    // First boot: the seed becomes the stored PIN. No seed → nothing matches.
    // (The old code accepted the literal "1234" here.) Creating a missing
    // row is not a rewrite, so it is allowed everywhere.
    if (seed && safeEqual(pin, seed)) {
      await ensurePinCredential(pin);
      return true;
    }
    return false;
  }

  const status = checkPinHash(pin, stored.pinHash);
  if (status === "ok") return true;
  if (status === "legacy") {
    // D1a: a row written under the pre-audit form — re-hashed on first use,
    // but only by a production server with an explicit secret (a dev server
    // pointed at the production database must not rewrite it).
    if (canRewriteHashes()) await ensurePinCredential(pin);
    return true;
  }

  // Two narrow ways the seed may re-take the row — both REWRITES, so both
  // only where canRewriteHashes() allows:
  //  - the row is still in the pre-audit format: until now the web trusted
  //    APP_PIN while pairing trusted this row, so the two may disagree; the
  //    seed wins once, and the row leaves the legacy format;
  //  - APP_PIN_RESET=1: the documented recovery after rotating
  //    APP_AUTH_SECRET. Single-use per APP_PIN value: the consumed value is
  //    remembered as a keyed marker (never the PIN), so a forgotten
  //    APP_PIN_RESET is not a standing second PIN and cannot silently undo a
  //    later PIN change in Settings.
  if (!seed || !safeEqual(pin, seed) || !canRewriteHashes()) return false;
  if (isLegacyPinHash(stored.pinHash)) {
    console.warn("[pin-auth] re-seeding the stored PIN from APP_PIN (legacy row)");
    await ensurePinCredential(pin);
    return true;
  }
  if (process.env[RESET_FLAG] === "1") {
    const marker = pinMarker(pin);
    if (stored.resetConsumedFor === marker) return false;
    console.warn(`[pin-auth] ${RESET_FLAG}=1 consumed: the stored PIN was re-seeded from APP_PIN`);
    await ensurePinCredential(pin, { resetConsumedFor: marker });
    await alertPinReset(`${RESET_FLAG}=1 was used to sign in`);
    return true;
  }
  return false;
}

export async function updatePin(currentPin: unknown, nextPin: string) {
  const valid = await verifyPin(currentPin);
  if (!valid) return false;
  await ensurePinCredential(nextPin);
  return true;
}
