// The Coach cron's credential check (2026-10-17, lane B). Constant-time —
// both sides are hashed to a fixed length first, so neither the content nor
// the length of the secret leaks through timing — and fail-closed: with
// CRON_SECRET unset, nothing is authorised. Lane A is adding a shared
// requireCronSecret() of the same shape; this one is absorbed by it at merge
// (docs/followups.md).

import { createHash, timingSafeEqual } from "node:crypto";

export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = createHash("sha256").update(header ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
