import { after, NextRequest } from "next/server";
import { sweepSoon } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  canRewriteHashes,
  createOpaqueToken,
  CURRENT_KEY_VERSION,
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
      keyVersion: CURRENT_KEY_VERSION,
      refreshKeyVersion: CURRENT_KEY_VERSION,
    },
  });

  return {
    session,
    accessToken,
    refreshToken,
  };
}

type HashField = "tokenHash" | "refreshTokenHash";
type ExpiryField = "expiresAt" | "refreshExpiresAt";
type SessionRow = Awaited<ReturnType<typeof prisma.deviceSession.findFirst>> & object;

interface SessionMatch {
  row: SessionRow;
  /** The stored hash that matched — the current one, or a legacy one. */
  hash: string;
  legacy: boolean;
}

/**
 * Find a live session by its access or refresh token. Tries the current hash
 * first; during the legacy window (lib/security LEGACY_SECRET_UNTIL) it also
 * tries every hash earlier code could have stored (PLAN D1a). Read-only: the
 * caller decides whether to re-key. Revoked and expired rows are never
 * found, legacy or not.
 */
async function findLiveSession(field: HashField, token: string, expiryField: ExpiryField): Promise<SessionMatch | null> {
  const now = new Date();
  const currentHash = hashOpaqueToken(token);
  const current = await prisma.deviceSession.findFirst({
    where: { [field]: currentHash, revokedAt: null, [expiryField]: { gt: now } },
  });
  if (current) return { row: current, hash: currentHash, legacy: false };
  if (!legacyWindowOpen(now)) return null;

  // One query over every hash the old server could have written (the chain
  // head changes when APP_AUTH_SECRET is set; the rows do not).
  const legacy = await prisma.deviceSession.findFirst({
    where: { [field]: { in: legacyHashOpaqueTokens(token) }, revokedAt: null, [expiryField]: { gt: now } },
  });
  if (!legacy) return null;
  return { row: legacy, hash: String((legacy as Record<string, unknown>)[field]), legacy: true };
}

/**
 * Move a legacy access-token hash to the current key — only where
 * canRewriteHashes() allows (a production server with an explicit secret).
 * Conditional on the hash still being the legacy one, so it cannot revive a
 * token that a concurrent refresh has just rotated away.
 */
async function rekeyAccessToken(match: SessionMatch, token: string): Promise<SessionRow | null> {
  if (!match.legacy || !canRewriteHashes()) return match.row;
  const currentHash = hashOpaqueToken(token);
  const moved = await prisma.deviceSession.updateMany({
    where: { id: match.row.id, tokenHash: match.hash },
    data: { tokenHash: currentHash, keyVersion: CURRENT_KEY_VERSION },
  });
  if (moved.count === 1) return { ...match.row, tokenHash: currentHash, keyVersion: CURRENT_KEY_VERSION };
  // Someone changed the row first: a concurrent request re-keyed the same
  // token (still valid — find it under the current hash), or a refresh
  // rotated it away (not valid any more — nothing is found).
  return prisma.deviceSession.findFirst({
    where: { id: match.row.id, tokenHash: currentHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

export async function refreshDeviceSession(refreshToken: string) {
  if (!refreshToken) return null;
  const match = await findLiveSession("refreshTokenHash", refreshToken, "refreshExpiresAt");
  if (!match) return null;

  const nextAccessToken = createOpaqueToken();
  const nextRefreshToken = createOpaqueToken();

  // Single-use, atomically: the rotation only lands while the row still
  // carries the refresh hash that matched. Two concurrent refreshes with the
  // same token → one wins, the other gets nothing.
  const rotated = await prisma.deviceSession.updateMany({
    where: { id: match.row.id, refreshTokenHash: match.hash, revokedAt: null },
    data: {
      tokenHash: hashOpaqueToken(nextAccessToken),
      refreshTokenHash: hashOpaqueToken(nextRefreshToken),
      expiresAt: addDays(SESSION_TTL_DAYS),
      refreshExpiresAt: addDays(REFRESH_TTL_DAYS),
      lastSeenAt: new Date(),
      keyVersion: CURRENT_KEY_VERSION,
      refreshKeyVersion: CURRENT_KEY_VERSION,
    },
  });
  if (rotated.count !== 1) return null;
  const session = await prisma.deviceSession.findUnique({ where: { id: match.row.id } });
  if (!session) return null;

  return {
    session,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
}

/**
 * How many live sessions still depend on the pre-audit key (an access or a
 * refresh hash on keyVersion 1). While this is above zero, removing or
 * changing APP_PIN in Vercel logs those devices out (README).
 */
export async function countLegacyKeySessions(): Promise<number> {
  return prisma.deviceSession.count({
    where: {
      revokedAt: null,
      refreshExpiresAt: { gt: new Date() },
      OR: [{ keyVersion: { lt: CURRENT_KEY_VERSION } }, { refreshKeyVersion: { lt: CURRENT_KEY_VERSION } }],
    },
  });
}

/**
 * The token on a request. Device routes take `Authorization: Bearer` only.
 * The connector (`/api/mcp`) also takes the `api-token` / `x-api-key`
 * headers, because claude.ai's "no-OAuth" connector path cannot send a
 * custom Authorization header (2026-08-29) — and only the connector
 * (SEC-019, 2026-10).
 */
export function getBearerToken(request: NextRequest, opts: { allowApiKeyHeaders?: boolean } = {}) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  if (!opts.allowApiKeyHeaders) return null;
  const apiToken =
    request.headers.get("api-token") || request.headers.get("x-api-key") || "";
  return apiToken.trim() || null;
}

/** Which door a token may open. Connector tokens (deviceType "mcp") drive
 * /api/mcp and nothing else; device tokens (the watch, the iPhone — and
 * sessions from before deviceType existed) drive /api/mobile/* and never
 * the connector (SEC-010, PLAN D4). */
export type SessionKind = "device" | "connector";

export type SessionAuth =
  | { ok: true; session: Awaited<ReturnType<typeof createDeviceSession>>["session"] }
  | { ok: false; reason: "missing" | "invalid" | "wrong-kind" };

export async function authenticateSession(request: NextRequest, kind: SessionKind = "device"): Promise<SessionAuth> {
  const token = getBearerToken(request, { allowApiKeyHeaders: kind === "connector" });
  if (!token) return { ok: false, reason: "missing" };

  const match = await findLiveSession("tokenHash", token, "expiresAt");
  if (!match) return { ok: false, reason: "invalid" };
  const session = await rekeyAccessToken(match, token);
  if (!session) return { ok: false, reason: "invalid" };

  const isConnector = session.deviceType === "mcp";
  if (kind === "connector" ? !isConnector : isConnector) {
    return { ok: false, reason: "wrong-kind" };
  }

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

  return { ok: true, session };
}

/** Device routes: the session, or null. */
export async function requireMobileSession(request: NextRequest) {
  const auth = await authenticateSession(request, "device");
  return auth.ok ? auth.session : null;
}

/** The connector route: a discriminated result, so 401 and 403 can differ. */
export function requireConnectorSession(request: NextRequest) {
  return authenticateSession(request, "connector");
}
