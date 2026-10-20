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
import { lookup } from "node:dns/promises";
import net from "node:net";
import { ipv6Hextets } from "@/lib/auth";
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

// A CIMD client_id is a URL the server FETCHES at approve time. Only a public
// https hostname may be fetched (SEC-018, 2026-10): no IP literals, no
// localhost or private-looking names, and no following of redirects — a
// public host must not be able to bounce the request onto the internal
// network.
const PRIVATE_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".test", ".arpa"];
export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port && url.port !== "443") return false; // the standard port only
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost") return false;
  if (host.startsWith("[") || host.includes(":")) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (!host.includes(".")) return false; // bare intranet names
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return true;
}

/** Is this address loopback, private, link-local, CGNAT, multicast or unspecified? */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (family === 6) {
    const h = ipv6Hextets(address);
    if (!h) return true;
    const n = h.map((x) => (x.includes(".") ? x : parseInt(x, 16)));
    // An embedded IPv4 (dotted or as the last two hextets).
    const embedded = (): string => {
      const last = h[h.length - 1];
      if (last.includes(".")) return last;
      const hi = n[6] as number;
      const lo = n[7] as number;
      return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    };
    const zero = (from: number, to: number) => n.slice(from, to).every((x) => x === 0);
    if (zero(0, 7) && (n[7] === 0 || n[7] === 1)) return true; // :: and ::1
    if (zero(0, 5) && n[5] === 0xffff) return isPrivateAddress(embedded()); // ::ffff:a.b.c.d, ::ffff:7f00:1
    if (zero(0, 6)) return isPrivateAddress(embedded()); // the old IPv4-compatible form
    const first = n[0] as number;
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return true; // fe80::/10 link-local, fec0::/10 site-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (first === 0x64 && n[1] === 0xff9b) return true; // NAT64 64:ff9b::/96 (and the local-use /48)
    if (first === 0x2002) return true; // 6to4: an IPv4 behind an IPv6 face
    if (first === 0x2001 && n[1] === 0) return true; // Teredo
    if (first === 0x2001 && n[1] === 0x0db8) return true; // documentation
    if (first === 0x100 && zero(1, 4)) return true; // discard-only
    return false;
  }
  return true; // not an IP at all: refuse
}

/**
 * The hostname resolves only to public addresses (review of 3b: *.nip.io,
 * localtest.me and friends name private addresses with public-looking text).
 * Residual, stated honestly: DNS can change between this lookup and the
 * fetch (rebinding). The impact stays low — approve is cookie-gated, the
 * certificate must validate for the name, and redirects are refused.
 */
export async function resolvesPublicly(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

async function cimdRedirectUris(clientIdUrl: string): Promise<string[] | null> {
  if (!isPublicHttpsUrl(clientIdUrl)) return null;
  if (!(await resolvesPublicly(new URL(clientIdUrl).hostname))) return null;
  const cached = cimdCache.get(clientIdUrl);
  if (cached && Date.now() - cached.at < CIMD_CACHE_MS) return cached.uris;
  let uris: string[] | null = null;
  try {
    const res = await fetch(clientIdUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
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
      // Most likely an id registered before the 2026-10 key change: claude.ai
      // keeps it. Re-adding the connector registers a fresh one.
      return { ok: false, error: "Unknown client_id — remove the Pitaya connector in claude.ai and add it again (paste only the URL)" };
    }
    if (!payload.ru.includes(redirectUri)) {
      return { ok: false, error: "redirect_uri was not registered by this client" };
    }
    return { ok: true, clientLabel: payload.n || "Registered client" };
  }
  if (/^https:\/\//i.test(clientId)) {
    if (!isPublicHttpsUrl(clientId)) {
      return { ok: false, error: "client_id must be a public https URL" };
    }
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
