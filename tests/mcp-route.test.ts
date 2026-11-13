import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

// /api/mcp (audit 2026-10, SEC-010/015/019): only a CONNECTOR token opens it;
// a watch or iPhone token is 403; no token is 401 with the RFC 9728 pointer;
// the api-key headers work here and nowhere else; bodies are capped.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((fn: () => unknown) => void fn()) };
});
vi.mock("@/lib/notify", () => ({ sweepSoon: vi.fn() }));
vi.mock("@/lib/mcp/server", () => ({
  handleMcpMessage: vi.fn(async (_raw: unknown, ctx: unknown) => ({ status: 200, body: { ok: true, ctx } })),
}));

type Row = Record<string, unknown> & { id: string; tokenHash: string; deviceType: string | null; revokedAt: Date | null };
let rows: Row[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceSession: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const wanted = where.tokenHash as string | { in: string[] };
        const hashes = typeof wanted === "string" ? [wanted] : wanted.in;
        return rows.find((r) => hashes.includes(r.tokenHash) && r.revokedAt === null) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

import { POST } from "@/app/api/mcp/route";
import { authenticateSession, requireMobileSession } from "@/lib/mobile-session";
import { hashOpaqueToken } from "@/lib/security";

const STRONG = crypto.randomBytes(32).toString("hex");
const future = () => new Date(Date.now() + 86_400_000);

function post(headers: Record<string, string>, body: unknown = { jsonrpc: "2.0", id: 1, method: "ping" }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: text,
  });
}

beforeEach(() => {
  vi.stubEnv("APP_AUTH_SECRET", STRONG);
  rows = [
    { id: "mcp-1", deviceLabel: "Claude connector", deviceType: "mcp", tokenHash: hashOpaqueToken("mcp-token"), revokedAt: null, expiresAt: future() },
    { id: "watch-1", deviceLabel: "Watch", deviceType: "apple_watch", tokenHash: hashOpaqueToken("watch-token"), revokedAt: null, expiresAt: future() },
    { id: "old-1", deviceLabel: "Old phone", deviceType: null, tokenHash: hashOpaqueToken("old-token"), revokedAt: null, expiresAt: future() },
  ];
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/mcp — who may open the connector door", () => {
  it("a connector token passes, and the call carries the session into the audit context", async () => {
    const res = await POST(post({ authorization: "Bearer mcp-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ctx: { sessionId: "mcp-1", deviceLabel: "Claude connector" } });
  });
  it("a WATCH token is refused with 403 and a JSON-RPC error that says why (SEC-010)", async () => {
    const res = await POST(post({ authorization: "Bearer watch-token" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe(-32003);
    expect(body.error.message).toMatch(/paired device/);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });
  it("no token / an unknown token is 401 with the RFC 9728 pointer", async () => {
    const none = await POST(post({}));
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toMatch(/oauth-protected-resource\/api\/mcp/);
    const bad = await POST(post({ authorization: "Bearer never-issued" }));
    expect(bad.status).toBe(401);
  });
  it("the api-key headers work for the connector (claude.ai's no-OAuth path)", async () => {
    expect((await POST(post({ "x-api-key": "mcp-token" }))).status).toBe(200);
    expect((await POST(post({ "api-token": "mcp-token" }))).status).toBe(200);
  });
  it("refuses oversized bodies before parsing them (SEC-015)", async () => {
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(300 * 1024) } });
    const res = await POST(post({ authorization: "Bearer mcp-token" }, big));
    expect(res.status).toBe(413);
    const declared = await POST(post({ authorization: "Bearer mcp-token", "content-length": String(10 * 1024 * 1024) }));
    expect(declared.status).toBe(413);
  });
  it("counts BYTES, not characters: 100k three-byte characters (~300 KB) are refused (review of 3b)", async () => {
    const wide = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "€".repeat(100_000) } });
    expect(wide.length).toBeLessThan(256 * 1024); // the old character count let this through
    const res = await POST(post({ authorization: "Bearer mcp-token" }, wide));
    expect(res.status).toBe(413);
  });
});

describe("device routes — the other side of the kind check (SEC-019)", () => {
  const req = (headers: Record<string, string>) => new NextRequest("http://localhost/api/mobile/summary", { headers });
  it("accept the watch, and sessions from before deviceType existed", async () => {
    expect((await requireMobileSession(req({ authorization: "Bearer watch-token" })))?.id).toBe("watch-1");
    expect((await requireMobileSession(req({ authorization: "Bearer old-token" })))?.id).toBe("old-1");
  });
  it("refuse a connector token, and ignore the api-key headers", async () => {
    expect(await requireMobileSession(req({ authorization: "Bearer mcp-token" }))).toBeNull();
    expect(await authenticateSession(req({ authorization: "Bearer mcp-token" }), "device")).toEqual({ ok: false, reason: "wrong-kind" });
    expect(await requireMobileSession(req({ "x-api-key": "watch-token" }))).toBeNull();
    expect(await authenticateSession(req({ "x-api-key": "watch-token" }), "device")).toEqual({ ok: false, reason: "missing" });
  });
});
