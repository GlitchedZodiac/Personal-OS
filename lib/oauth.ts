// OAuth 2.1 for the Claude connector (2026-08-29). claude.ai's custom
// connector dialog probes /api/mcp, sees the 401, and expects the MCP auth
// story: protected-resource metadata → this authorization server → a browser
// sign-in → an authorization code → a token. This module is the whole brain:
// client identity (CIMD urls or our stateless DCR ids), redirect-uri policy,
// PKCE, and single-use codes. The tokens that come out the other side are
// ordinary DeviceSessions — the same credential the watch uses, with the
// same revocation surface.
//
// Deliberately single-user: there is no consent-per-scope matrix; the PIN
// holder approving IS the consent. Stage 2 (multi-user) replaces none of
// this shape — it adds a user id to the code and the session.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashOpaqueToken, signCompact, verifyCompact } from "@/lib/security";

const CODE_TTL_MS = 5 * 60 * 1000;

// ── Redirect policy ──────────────────────────────────────────────────────
// Defense in depth even when a CIMD document vouches for the uri: only
// Anthropic surfaces and local MCP tooling may receive codes from this
// server. An open redirect on a personal health API is a phishing kit.
const REDIRECT_HOST_ALLOW = [
  "claude.ai",
  "claude.com",
  "anthropic.com",
] as const;

export function redirectUriAllowed(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isLocal) return url.protocol === "http:" || url.protocol === "https:";
  if (url.protocol !== "https:") return false;
  return REDIRECT_HOST_ALLOW.some((h) => host === h || host.endsWith(`.${h}`));
}

// ── Client identity ──────────────────────────────────────────────────────
// Two shapes, per what the claude.ai dialog offers:
//  - CIMD ("Use Anthropic's hosted client metadata"): client_id IS an https
//    URL to a JSON document listing redirect_uris. We fetch and honor it.
//  - DCR ("register one automatically"): our /api/oauth/register mints a
//    stateless signed id embedding the registered redirect_uris — no table.

interface DcrPayload {
  v: 1;
  ru: string[];
  n?: string;
}

export function mintDcrClientId(redirectUris: string[], name?: string): string {
  return `pos1.${signCompact({ v: 1, ru: redirectUris, n: name } satisfies DcrPayload)}`;
}

const cimdCache = new Map<string, { at: number; uris: string[] | null }>();
const CIMD_CACHE_MS = 10 * 60 * 1000;

async function cimdRedirectUris(clientIdUrl: string): Promise<string[] | null> {
  const cached = cimdCache.get(clientIdUrl);
  if (cached && Date.now() - cached.at < CIMD_CACHE_MS) return cached.uris;
  let uris: string[] | null = null;
  try {
    const res = await fetch(clientIdUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const doc = (await res.json()) as { redirect_uris?: unknown };
      if (Array.isArray(doc.redirect_uris)) {
        uris = doc.redirect_uris.filter((u): u is string => typeof u === "string");
      }
    }
  } catch {
    uris = null;
  }
  cimdCache.set(clientIdUrl, { at: Date.now(), uris });
  return uris;
}

/// Is this client allowed to receive a code at this redirect_uri?
export async function validateClient(
  clientId: string,
  redirectUri: string
): Promise<{ ok: true; clientLabel: string } | { ok: false; error: string }> {
  if (!redirectUriAllowed(redirectUri)) {
    return { ok: false, error: "redirect_uri is not an allowed destination" };
  }
  if (clientId.startsWith("pos1.")) {
    const payload = verifyCompact<DcrPayload>(clientId.slice(5));
    if (!payload || payload.v !== 1 || !Array.isArray(payload.ru)) {
      return { ok: false, error: "Unknown client_id" };
    }
    if (!payload.ru.includes(redirectUri)) {
      return { ok: false, error: "redirect_uri was not registered by this client" };
    }
    return { ok: true, clientLabel: payload.n || "Registered client" };
  }
  if (/^https:\/\//i.test(clientId)) {
    const uris = await cimdRedirectUris(clientId);
    if (!uris) {
      return { ok: false, error: "Couldn't read the client metadata document" };
    }
    if (!uris.includes(redirectUri)) {
      return { ok: false, error: "redirect_uri is not listed in the client metadata" };
    }
    return { ok: true, clientLabel: new URL(clientId).hostname };
  }
  return { ok: false, error: "Unsupported client_id format" };
}

// ── PKCE ─────────────────────────────────────────────────────────────────

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return (
    Buffer.byteLength(computed) === Buffer.byteLength(challenge) &&
    crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(challenge))
  );
}

// ── Codes ────────────────────────────────────────────────────────────────

export async function mintAuthCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string | null;
}): Promise<string> {
  const code = createOpaqueToken();
  await prisma.oAuthCode.create({
    data: {
      codeHash: hashOpaqueToken(code),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: input.scope ?? null,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

/// Single-use consumption: atomically claims the row (usedAt) so a replayed
/// code loses even in a race, then verifies binding + PKCE.
export async function consumeAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  | { ok: true; scope: string | null }
  | { ok: false; error: string }
> {
  const codeHash = hashOpaqueToken(input.code);
  const claimed = await prisma.oAuthCode.updateMany({
    where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return { ok: false, error: "invalid_grant" };
  }
  const row = await prisma.oAuthCode.findUnique({ where: { codeHash } });
  if (
    !row ||
    row.clientId !== input.clientId ||
    row.redirectUri !== input.redirectUri ||
    !pkceMatches(input.codeVerifier, row.codeChallenge)
  ) {
    return { ok: false, error: "invalid_grant" };
  }
  return { ok: true, scope: row.scope };
}

/// Expired-code hygiene, piggybacked on the token endpoint.
export async function sweepExpiredCodes(): Promise<void> {
  try {
    await prisma.oAuthCode.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
  } catch {
    // hygiene only
  }
}
