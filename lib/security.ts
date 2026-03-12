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
