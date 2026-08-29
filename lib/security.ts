import crypto from "crypto";

const PIN_HASH_ALGO = "sha256";
const TOKEN_BYTES = 32;

function getAppSecret() {
  return (
    process.env.APP_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.APP_PIN ||
    "personal-os-local-secret"
  );
}

export function hashPin(pin: string) {
  return crypto
    .createHmac(PIN_HASH_ALGO, getAppSecret())
    .update(pin)
    .digest("hex");
}

export function verifyPinHash(pin: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const computed = hashPin(pin);
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(storedHash, "hex")
  );
}

export function createOpaqueToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return crypto
    .createHmac(PIN_HASH_ALGO, getAppSecret())
    .update(token)
    .digest("hex");
}

/// Compact HMAC-signed payloads (2026-08-29, OAuth): `payload.sig` where
/// payload is base64url JSON. Lets the stateless DCR endpoint mint client
/// ids that carry their own redirect allowlist, verifiable without a table.
export function signCompact(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac(PIN_HASH_ALGO, getAppSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCompact<T = unknown>(value: string): T | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = crypto
    .createHmac(PIN_HASH_ALGO, getAppSecret())
    .update(body)
    .digest("base64url");
  if (
    Buffer.byteLength(sig) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
