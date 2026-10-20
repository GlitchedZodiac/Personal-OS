import { afterEach, describe, expect, it, vi } from "vitest";

// CIMD client ids are URLs the server fetches at approve time (SEC-018, and
// the review of 3b): public https hostnames on port 443 only, resolving only
// to public addresses, and no redirects. Residual (stated in lib/oauth.ts):
// DNS can change between the lookup and the fetch.

vi.mock("@/lib/prisma", () => ({ prisma: { oAuthCode: {} } }));
const { dns } = vi.hoisted(() => ({ dns: { answers: {} as Record<string, string[]> } }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    const a = dns.answers[host];
    if (!a) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return a.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  }),
}));
import { isPrivateAddress, isPublicHttpsUrl, resolvesPublicly, validateClient } from "@/lib/oauth";

afterEach(() => {
  vi.restoreAllMocks();
  dns.answers = {};
});

describe("isPublicHttpsUrl (the text check)", () => {
  it("allows public https hosts on the standard port, nothing that could be internal", () => {
    expect(isPublicHttpsUrl("https://claude.ai/client.json")).toBe(true);
    expect(isPublicHttpsUrl("https://claude.ai:443/client.json")).toBe(true);
    for (const bad of [
      "http://claude.ai/client.json",
      "https://claude.ai:8443/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://localhost/x",
      "https://intranet/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "not a url",
    ]) {
      expect(isPublicHttpsUrl(bad), bad).toBe(false);
    }
  });
});

describe("isPrivateAddress", () => {
  it("knows the private, loopback, link-local, CGNAT and mapped ranges", () => {
    for (const a of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "::"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ["160.79.104.10", "8.8.8.8", "2607:6bc0::10"]) expect(isPrivateAddress(a), a).toBe(false);
  });
  it("also knows the forms the second-pass review found missing", () => {
    for (const a of ["::ffff:7f00:1", "64:ff9b::a00:1", "64:ff9b:1::1", "2002:a00:1::1", "fec0::1", "2001:0:4136:e378::1", "2001:db8::1"]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
  });
});

describe("resolving before fetching", () => {
  it("a public-looking name that resolves to a private address is refused (*.nip.io, localtest.me)", async () => {
    dns.answers["10.0.0.5.nip.io"] = ["10.0.0.5"];
    dns.answers["localtest.me"] = ["127.0.0.1"];
    dns.answers["mixed.example.com"] = ["160.79.104.10", "192.168.0.9"];
    expect(await resolvesPublicly("10.0.0.5.nip.io")).toBe(false);
    expect(await resolvesPublicly("localtest.me")).toBe(false);
    expect(await resolvesPublicly("mixed.example.com")).toBe(false); // any private answer refuses
    expect(await resolvesPublicly("does-not-resolve.example")).toBe(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await validateClient("https://10.0.0.5.nip.io/client.json", "https://claude.ai/cb");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a private client_id without resolving or fetching it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await validateClient("https://169.254.169.254/latest/meta-data", "https://claude.ai/cb");
    expect(res).toEqual({ ok: false, error: "client_id must be a public https URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fetches a public document that resolves publicly, without following redirects", async () => {
    dns.answers["claude.ai"] = ["160.79.104.10"];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const res = await validateClient("https://claude.ai/client-cimd-test.json", "https://claude.ai/cb");
    expect(res.ok).toBe(true);
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("error");
  });
});
