import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

const codes: Array<Record<string, unknown> & { codeHash: string; usedAt: Date | null }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthCode: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { usedAt: null, ...data } as (typeof codes)[number];
        codes.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where }: { where: { codeHash: string; expiresAt: { gt: Date } } }) => {
          const row = codes.find(
            (c) =>
              c.codeHash === where.codeHash &&
              c.usedAt === null &&
              (c.expiresAt as Date) > where.expiresAt.gt
          );
          if (!row) return { count: 0 };
          row.usedAt = new Date();
          return { count: 1 };
        }
      ),
      findUnique: vi.fn(async ({ where }: { where: { codeHash: string } }) =>
        codes.find((c) => c.codeHash === where.codeHash) ?? null
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import {
  consumeAuthCode,
  mintAuthCode,
  mintDcrClientId,
  pkceMatches,
  redirectUriAllowed,
  validateClient,
} from "@/lib/oauth";

beforeEach(() => {
  codes.length = 0;
});

describe("redirect policy", () => {
  it("allows Anthropic surfaces and local tooling only", () => {
    expect(redirectUriAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriAllowed("https://claude.com/x")).toBe(true);
    expect(redirectUriAllowed("http://localhost:6274/oauth/callback")).toBe(true);
    expect(redirectUriAllowed("http://127.0.0.1:33418/cb")).toBe(true);
    expect(redirectUriAllowed("https://evil.example.com/cb")).toBe(false);
    expect(redirectUriAllowed("http://claude.ai/cb")).toBe(false); // https only
    expect(redirectUriAllowed("https://claude.ai.evil.com/cb")).toBe(false);
    expect(redirectUriAllowed("not a url")).toBe(false);
  });
});

describe("client identity", () => {
  it("stateless DCR ids carry and enforce their redirect set", async () => {
    const id = mintDcrClientId(["https://claude.ai/cb"], "Claude");
    const ok = await validateClient(id, "https://claude.ai/cb");
    expect(ok).toEqual({ ok: true, clientLabel: "Claude" });
    const wrongUri = await validateClient(id, "https://claude.ai/other");
    expect(wrongUri.ok).toBe(false);
    const tampered = await validateClient(`${id}x`, "https://claude.ai/cb");
    expect(tampered.ok).toBe(false);
  });

  it("CIMD client ids fetch their metadata document", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] }), {
          headers: { "content-type": "application/json" },
        })
      );
    const ok = await validateClient("https://claude.ai/client.json", "https://claude.ai/cb");
    expect(ok.ok).toBe(true);
    const bad = await validateClient(
      "https://claude.ai/client.json",
      "https://claude.ai/not-listed"
    );
    expect(bad.ok).toBe(false);
    fetchMock.mockRestore();
  });
});

describe("PKCE + codes", () => {
  const verifier = "a-very-long-verifier-string-for-the-tests";
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  it("pkce S256 matches only the right verifier", () => {
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches("wrong", challenge)).toBe(false);
  });

  it("codes are single-use and bound to client+redirect+PKCE", async () => {
    const mint = () =>
      mintAuthCode({
        clientId: "pos1.x",
        redirectUri: "https://claude.ai/cb",
        codeChallenge: challenge,
        scope: "pitaya",
      });

    const code = await mint();
    const wrongVerifier = await consumeAuthCode({
      code,
      clientId: "pos1.x",
      redirectUri: "https://claude.ai/cb",
      codeVerifier: "wrong",
    });
    expect(wrongVerifier.ok).toBe(false);

    // The failed attempt burned the code (claimed on first touch) — replay
    // with the RIGHT verifier must also fail.
    const replay = await consumeAuthCode({
      code,
      clientId: "pos1.x",
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(replay.ok).toBe(false);

    const fresh = await mint();
    const good = await consumeAuthCode({
      code: fresh,
      clientId: "pos1.x",
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(good).toEqual({ ok: true, scope: "pitaya" });

    const again = await consumeAuthCode({
      code: fresh,
      clientId: "pos1.x",
      redirectUri: "https://claude.ai/cb",
      codeVerifier: verifier,
    });
    expect(again.ok).toBe(false);
  });
});
