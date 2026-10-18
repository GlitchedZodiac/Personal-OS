import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { checkPinHash, hashPin, isLegacyPinHash } from "@/lib/security";

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

export async function getStoredPinHash() {
  const credential = await prisma.authCredential.findUnique({
    where: { id: "default" },
    select: { pinHash: true },
  });
  return credential?.pinHash || null;
}

/** Is there any PIN to check against — a stored row, or a seed to create one from? */
export async function pinConfigured(): Promise<boolean> {
  if (seedPin()) return true;
  return Boolean(await getStoredPinHash());
}

/** Write (or overwrite) the stored PIN in the current hash format. */
export async function ensurePinCredential(pin: string) {
  const pinHash = hashPin(pin);
  return prisma.authCredential.upsert({
    where: { id: "default" },
    create: { id: "default", pinHash },
    update: { pinHash },
  });
}

export async function verifyPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 64) return false;
  const stored = await getStoredPinHash();
  const seed = seedPin();

  if (!stored) {
    // First boot: the seed becomes the stored PIN. No seed → nothing matches.
    // (The old code accepted the literal "1234" here.)
    if (seed && safeEqual(pin, seed)) {
      await ensurePinCredential(pin);
      return true;
    }
    return false;
  }

  const status = checkPinHash(pin, stored);
  if (status === "ok") return true;
  if (status === "legacy") {
    // D1a: a row written under the pre-audit HMAC form — re-hash on first use.
    await ensurePinCredential(pin);
    return true;
  }

  // Two narrow cases let the seed re-take the row:
  //  - the row is still in the pre-audit format: until now the WEB trusted
  //    APP_PIN while pairing trusted this row, so the two may disagree today;
  //    the seed wins once, and the row leaves the legacy format;
  //  - APP_PIN_RESET=1 is set: the documented recovery after rotating
  //    APP_AUTH_SECRET (the pepper), which makes stored hashes unverifiable.
  const resetAllowed = isLegacyPinHash(stored) || process.env[RESET_FLAG] === "1";
  if (resetAllowed && seed && safeEqual(pin, seed)) {
    console.warn(
      `[pin-auth] re-seeding the stored PIN from APP_PIN (${isLegacyPinHash(stored) ? "legacy row" : RESET_FLAG + "=1"})`
    );
    await ensurePinCredential(pin);
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
