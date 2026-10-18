import { after, NextRequest } from "next/server";
import { sweepSoon } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  createOpaqueToken,
  hashOpaqueToken,
  legacyHashOpaqueTokens,
  legacyWindowOpen,
} from "@/lib/security";

const SESSION_TTL_DAYS = 30;
const REFRESH_TTL_DAYS = 90;

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createDeviceSession(input: {
  deviceLabel: string;
  platform?: string | null;
  deviceType?: string | null;
  /// MCP connector tokens (2026-08-29) live longer than phone sessions —
  /// a pasted claude.ai credential shouldn't die monthly. Revocation is
  /// the control, not expiry.
  accessTtlDays?: number;
  refreshTtlDays?: number;
}) {
  const accessToken = createOpaqueToken();
  const refreshToken = createOpaqueToken();

  const session = await prisma.deviceSession.create({
    data: {
      deviceLabel: input.deviceLabel,
      platform: input.platform || null,
      deviceType: input.deviceType || null,
      tokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt: addDays(input.accessTtlDays ?? SESSION_TTL_DAYS),
      refreshExpiresAt: addDays(input.refreshTtlDays ?? REFRESH_TTL_DAYS),
      lastSeenAt: new Date(),
    },
  });

  return {
    session,
    accessToken,
    refreshToken,
  };
}

type HashField = "tokenHash" | "refreshTokenHash";

/**
 * Find a live session by its access or refresh token. Tries the current hash
 * first; during the legacy window (lib/security LEGACY_SECRET_UNTIL) it also
 * tries the pre-audit hash and, on a match, re-keys the row — so the watch,
 * the iPhone and the Claude connector keep working across the APP_AUTH_SECRET
 * rollout without re-pairing (PLAN D1a). After the window, legacy rows are
 * simply not found.
 */
async function findLiveSession(field: HashField, token: string, expiryField: "expiresAt" | "refreshExpiresAt") {
  const now = new Date();
  const current = await prisma.deviceSession.findFirst({
    where: { [field]: hashOpaqueToken(token), revokedAt: null, [expiryField]: { gt: now } },
  });
  if (current) return current;
  if (!legacyWindowOpen(now)) return null;

  // One query over every hash the old server could have written (the chain
  // head changes when APP_AUTH_SECRET is set; the rows do not).
  const legacy = await prisma.deviceSession.findFirst({
    where: { [field]: { in: legacyHashOpaqueTokens(token) }, revokedAt: null, [expiryField]: { gt: now } },
  });
  if (!legacy) return null;
  return prisma.deviceSession.update({
    where: { id: legacy.id },
    data: { [field]: hashOpaqueToken(token) },
  });
}

export async function refreshDeviceSession(refreshToken: string) {
  if (!refreshToken) return null;
  const existing = await findLiveSession("refreshTokenHash", refreshToken, "refreshExpiresAt");
  if (!existing) return null;

  const nextAccessToken = createOpaqueToken();
  const nextRefreshToken = createOpaqueToken();

  const session = await prisma.deviceSession.update({
    where: { id: existing.id },
    data: {
      tokenHash: hashOpaqueToken(nextAccessToken),
      refreshTokenHash: hashOpaqueToken(nextRefreshToken),
      expiresAt: addDays(SESSION_TTL_DAYS),
      refreshExpiresAt: addDays(REFRESH_TTL_DAYS),
      lastSeenAt: new Date(),
    },
  });

  return {
    session,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
}

export function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  // claude.ai's connector dialog can't send a custom Authorization header —
  // its "no-OAuth" path sends the token as an extra request header instead
  // (2026-08-29). Accept the two conventional names.
  const apiToken =
    request.headers.get("api-token") || request.headers.get("x-api-key") || "";
  return apiToken.trim() || null;
}

export async function requireMobileSession(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const session = await findLiveSession("tokenHash", token, "expiresAt");
  if (!session) return null;

  // lastSeenAt is bookkeeping — flush it after the response instead of taxing
  // every mobile request with a second DB round trip before any real work.
  after(() =>
    prisma.deviceSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {})
  );
  // The watch and the phone companion check in around the clock; each
  // check-in is a free chance to deliver a due reminder (at most one sweep a
  // minute per instance — lib/notify.ts).
  after(() => sweepSoon());

  return session;
}
