import crypto from "crypto";

// The app's secret material (reworked 2026-10, SEC-002/003).
//
// Before: one `getAppSecret()` that fell back from APP_AUTH_SECRET to
// NEXTAUTH_SECRET to APP_PIN to a constant string, used raw as the HMAC key
// for the PIN hash, every device/refresh/OAuth-code token hash, and the
// signature on stateless DCR client ids. With the first two unset — the
// likely production state — the key was the 4–8 digit PIN, and the public
// /api/oauth/register endpoint handed out an HMAC under it: an offline PIN
// oracle.
//
// Now:
//  - In production, APP_AUTH_SECRET must be set and at least 32 characters.
//    Anything that needs it otherwise throws MissingSecretError (loud: the
//    message names the variable), never derives from the PIN.
//  - Outside production the old chain still works, with one warning, so a
//    developer without the variable is not blocked.
//  - Keys are derived per purpose (pin / token / compact) from the one secret,
//    so a leak of one derived key does not cross purposes.
//  - The PIN hash is scrypt with a per-row salt and a server-side pepper.
//  - Legacy verification (D1a): hashes written under the OLD chain are still
//    recognised until LEGACY_SECRET_UNTIL so the watch, the iPhone and the
//    Claude connector keep working when Michael sets the secret — callers
//    re-hash on first use. After the window, legacy material is refused.

const TOKEN_BYTES = 32;
export const MIN_SECRET_LENGTH = 32;
const LEGACY_CONSTANT = "personal-os-local-secret";

/** Day the legacy (pre-audit) hash forms stop being accepted. ~90 days after 2026-10-17. */
export const LEGACY_SECRET_UNTIL = new Date("2027-01-17T00:00:00Z");

export class MissingSecretError extends Error {
  readonly variable: string;
  constructor(variable: string, reason: string) {
    super(`${variable} is ${reason} — set it in Vercel → Environment Variables (openssl rand -hex 32) and redeploy`);
    this.name = "MissingSecretError";
    this.variable = variable;
  }
}

const isProduction = () => process.env.NODE_ENV === "production";

/** The head of the pre-audit chain `APP_AUTH_SECRET || NEXTAUTH_SECRET || APP_PIN || constant`. */
export function legacyAppSecret(): string {
  return (
    process.env.APP_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.APP_PIN ||
    LEGACY_CONSTANT
  );
}

/**
 * Every key the OLD server may have hashed under. The old chain picked its
 * head at call time, so the moment Michael sets APP_AUTH_SECRET the head
 * changes — but the rows were written under whatever was set BEFORE (in
 * production: APP_PIN). Verifiers try all of them; nothing is ever minted
 * under any of them.
 *
 * These are read from the CURRENT environment, which is why
 * docs/security/README.md says: do not remove or change APP_PIN in Vercel
 * until Settings → Devices shows no session on the old key (or until
 * LEGACY_SECRET_UNTIL). APP_AUTH_SECRET_PREVIOUS is the escape hatch for
 * replacing an APP_AUTH_SECRET that already existed.
 */
export function legacySecretCandidates(): string[] {
  const raw = [
    process.env.APP_AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.APP_PIN,
    process.env.APP_AUTH_SECRET_PREVIOUS,
    LEGACY_CONSTANT,
  ];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/** The derived key a PREVIOUS APP_AUTH_SECRET produced for one purpose, if one is configured. */
function previousDerivedKey(purpose: KeyPurpose): Buffer | null {
  const previous = process.env.APP_AUTH_SECRET_PREVIOUS?.trim() ?? "";
  if (previous.length < MIN_SECRET_LENGTH) return null;
  return crypto.createHash("sha256").update(`${previous}:personal-os:${purpose}`).digest();
}

/**
 * May this process REWRITE stored hashes (re-key a legacy row, re-hash a PIN,
 * re-seed from APP_PIN)? Only a production server with an explicit secret.
 * A development server has no APP_AUTH_SECRET and derives its keys from the
 * legacy chain — and the main checkout's .env.local points at the PRODUCTION
 * database, so a dev server that re-keyed rows would rewrite them under a
 * key production does not have, logging out every device. Everywhere else:
 * verify only.
 */
export function canRewriteHashes(): boolean {
  return isProduction() && (process.env.APP_AUTH_SECRET?.trim().length ?? 0) >= MIN_SECRET_LENGTH;
}

function databaseIsLocal(): boolean {
  try {
    const host = new URL((process.env.DATABASE_URL ?? "").trim()).hostname.replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/**
 * Before writing a NEW hash — minting a session, rotating a refresh token,
 * storing a PIN (review, 2026-10-20). Production already demands the secret.
 * A development server without an explicit APP_AUTH_SECRET derives its keys
 * from APP_PIN; pointed at a NON-local database (the main checkout's
 * .env.local is production) it would write rows only it can read — a phone
 * refreshed there was signed out of production. So: refuse, by name.
 */
export function assertHashWritesAllowed(): void {
  if (isProduction()) {
    getAppSecret();
    return;
  }
  const explicit = (process.env.APP_AUTH_SECRET?.trim().length ?? 0) >= MIN_SECRET_LENGTH;
  if (!explicit && !databaseIsLocal()) {
    throw new MissingSecretError(
      "APP_AUTH_SECRET",
      "required before a development server writes keys to a non-local database (it would write them under a key production does not have)"
    );
  }
}

/** Hash generation written by the current code (see DeviceSession.keyVersion). */
export const CURRENT_KEY_VERSION = 2;

export function legacyWindowOpen(now: Date = new Date()): boolean {
  return now < LEGACY_SECRET_UNTIL;
}

/** Why APP_AUTH_SECRET is unusable in production, or null when it is fine. */
export function appSecretProblem(): string | null {
  const configured = process.env.APP_AUTH_SECRET?.trim() ?? "";
  if (configured.length >= MIN_SECRET_LENGTH) return null;
  return configured ? `shorter than ${MIN_SECRET_LENGTH} characters` : "not set";
}

let warnedFallback = false;
function getAppSecret(): string {
  const configured = process.env.APP_AUTH_SECRET?.trim() ?? "";
  if (configured.length >= MIN_SECRET_LENGTH) return configured;
  if (isProduction()) {
    throw new MissingSecretError("APP_AUTH_SECRET", appSecretProblem() ?? "not set");
  }
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[security] APP_AUTH_SECRET is not set (or is under 32 chars): deriving keys from the legacy chain. Fine in development; production refuses."
    );
  }
  return legacyAppSecret();
}

export type KeyPurpose = "pin" | "token" | "compact";

/** A 32-byte key for one purpose, derived from the app secret. */
export function deriveKey(purpose: KeyPurpose): Buffer {
  return crypto.createHash("sha256").update(`${getAppSecret()}:personal-os:${purpose}`).digest();
}

// ── Opaque tokens (device sessions, refresh tokens, OAuth codes) ─────────

export function createOpaqueToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return crypto.createHmac("sha256", deriveKey("token")).update(token).digest("hex");
}

/**
 * Every hash a token may have been stored under by earlier code: one per
 * legacy candidate, plus the derived key of APP_AUTH_SECRET_PREVIOUS.
 */
export function legacyHashOpaqueTokens(token: string): string[] {
  const keys: Array<string | Buffer> = [...legacySecretCandidates()];
  const previous = previousDerivedKey("token");
  if (previous) keys.push(previous);
  return keys.map((key) => crypto.createHmac("sha256", key).update(token).digest("hex"));
}

// ── PIN hashing: scrypt + per-row salt + server pepper ───────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const PIN_FORMAT = "scrypt$1";

function pepperPin(pin: string, key: Buffer = deriveKey("pin")): Buffer {
  return crypto.createHmac("sha256", key).update(pin).digest();
}

/**
 * A marker that names one PIN value without storing it: HMAC under the
 * derived PIN key. Used to make APP_PIN_RESET single-use per value.
 */
export function pinMarker(pin: string): string {
  return crypto.createHmac("sha256", deriveKey("pin")).update(`reset:${pin}`).digest("hex");
}

export function hashPin(pin: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pepperPin(pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `${PIN_FORMAT}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function isLegacyPinHash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && /^[0-9a-f]{64}$/i.test(stored);
}

export type PinCheck = "ok" | "legacy" | "no";

/**
 * "ok" for the current format, "legacy" when only the pre-audit HMAC form
 * matched (the caller should re-hash), "no" otherwise.
 */
export function checkPinHash(pin: string, stored: string | null | undefined, now: Date = new Date()): PinCheck {
  if (!stored || !pin) return "no";
  if (stored.startsWith(`${PIN_FORMAT}$`)) {
    const [, , saltB64, hashB64] = stored.split("$");
    if (!saltB64 || !hashB64) return "no";
    const expected = Buffer.from(hashB64, "base64url");
    const matchesUnder = (key?: Buffer) => {
      const computed = crypto.scryptSync(pepperPin(pin, key), Buffer.from(saltB64, "base64url"), expected.length, {
        N: SCRYPT.N,
        r: SCRYPT.r,
        p: SCRYPT.p,
      });
      return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
    };
    if (matchesUnder()) return "ok";
    // Written under a previous APP_AUTH_SECRET (the documented rotation path).
    const previous = previousDerivedKey("pin");
    if (previous && legacyWindowOpen(now) && matchesUnder(previous)) return "legacy";
    return "no";
  }
  if (isLegacyPinHash(stored) && legacyWindowOpen(now)) {
    const b = Buffer.from(stored, "hex");
    for (const key of legacySecretCandidates()) {
      const a = Buffer.from(crypto.createHmac("sha256", key).update(pin).digest("hex"), "hex");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return "legacy";
    }
    return "no";
  }
  return "no";
}

/** Boolean form kept for callers that only need yes/no. */
export function verifyPinHash(pin: string, storedHash: string | null | undefined) {
  return checkPinHash(pin, storedHash) !== "no";
}

// ── Compact HMAC-signed payloads (stateless DCR client ids) ──────────────
// `payload.sig` where payload is base64url JSON.

function compactSig(body: string, key: Buffer | string) {
  return crypto.createHmac("sha256", key).update(body).digest("base64url");
}

export function signCompact(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${compactSig(body, deriveKey("compact"))}`;
}

function sigMatches(sig: string, expected: string) {
  return Buffer.byteLength(sig) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function verifyCompact<T = unknown>(value: string, now: Date = new Date()): T | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const current = sigMatches(sig, compactSig(body, deriveKey("compact")));
  // A client id minted before the key change (claude.ai keeps it) stays
  // valid through the legacy window; a reconnect after that re-registers.
  // Legacy client ids are honoured only under keys that were ever secret.
  // APP_PIN (presumed known) and the public constant are excluded: anyone can
  // get an equivalent id from the public register endpoint anyway, so
  // accepting ids signed under a known key buys nothing (review, 2026-10-20).
  const legacyKeys: Array<string | Buffer> = [process.env.APP_AUTH_SECRET, process.env.NEXTAUTH_SECRET, process.env.APP_AUTH_SECRET_PREVIOUS]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const previous = previousDerivedKey("compact");
  if (previous) legacyKeys.push(previous);
  const legacy = !current && legacyWindowOpen(now) && legacyKeys.some((key) => sigMatches(sig, compactSig(body, key)));
  if (!current && !legacy) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
