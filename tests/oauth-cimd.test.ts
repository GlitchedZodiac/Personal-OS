import { afterEach, describe, expect, it, vi } from "vitest";

// CIMD client ids are URLs the server fetches at approve time (SEC-018):
// public https hostnames only, and no redirects.

vi.mock("@/lib/prisma", () => ({ prisma: { oAuthCode: {} } }));
import { isPublicHttpsUrl, validateClient } from "@/lib/oauth";

afterEach(() => vi.restoreAllMocks());

describe("isPublicHttpsUrl", () => {
  it("allows public https hosts and nothing that could be internal", () => {
    expect(isPublicHttpsUrl("https://claude.ai/client.json")).toBe(true);
    expect(isPublicHttpsUrl("https://platform.claude.com/x")).toBe(true);
    for (const bad of [
      "http://claude.ai/client.json",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
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

describe("validateClient with a CIMD client_id", () => {
  it("refuses a private client_id without ever fetching it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await validateClient("https://169.254.169.254/latest/meta-data", "https://claude.ai/cb");
    expect(res).toEqual({ ok: false, error: "client_id must be a public https URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fetches a public document without following redirects", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const res = await validateClient("https://claude.ai/client-cimd-test.json", "https://claude.ai/cb");
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("error");
  });
});
