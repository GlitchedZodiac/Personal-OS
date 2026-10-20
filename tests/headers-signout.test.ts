import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Phase 3e (audit 2026-10): SEC-059 security headers, SEC-066 the service
// worker forgets his data when the server says this device is signed out,
// SEC-061 the chat-wide wipe is gone.

describe("SEC-059 security headers", () => {
  it("every path carries the safe set — frame-ancestors 'self' (the desk embeds itself), never 'none'", async () => {
    const { default: config } = await import("@/next.config");
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const h = Object.fromEntries(rules[0].headers.map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(self\)/);
    expect(h["Permissions-Policy"]).toMatch(/microphone=\(self\)/);
    expect(h["Permissions-Policy"]).toMatch(/geolocation=\(self\)/);
    // The desk's compact pane is a same-origin iframe; 'none' would blank it.
    const desk = fs.readFileSync(path.join(process.cwd(), "app/(desk)/home/page.tsx"), "utf8");
    expect(desk).toMatch(/<iframe src=\{compact\.href\}/);
  });
});

describe("SEC-066 the service worker clears his cached data on request", () => {
  it("CLEAR_PRIVATE_CACHE deletes /api/ responses and keeps the app shell (and never touches scripture)", async () => {
    const src = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    const handlers: Record<string, (e: unknown) => void> = {};
    const store = new Map<string, Request>([
      ["https://x/api/spirit/notebooks", new Request("https://x/api/spirit/notebooks")],
      ["https://x/api/spirit/ink/p1", new Request("https://x/api/spirit/ink/p1")],
      ["https://x/dashboard", new Request("https://x/dashboard")],
    ]);
    const opened: string[] = [];
    const cache = {
      keys: async () => [...store.values()],
      delete: async (req: Request) => store.delete(req.url),
    };
    const fakeSelf = {
      location: { hostname: "pitaya.example", origin: "https://x" },
      addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
      skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: { showNotification: vi.fn() },
    };
    const fakeCaches = { open: async (name: string) => { opened.push(name); return cache; } };
    new Function("self", "caches", src)(fakeSelf, fakeCaches);
    let done: Promise<unknown> = Promise.resolve();
    handlers.message({ data: { type: "CLEAR_PRIVATE_CACHE" }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect([...store.keys()]).toEqual(["https://x/dashboard"]);
    expect(opened.every((n) => !n.includes("scripture"))).toBe(true);
  });
  it("PinGate asks for it when the server says no", () => {
    const gate = fs.readFileSync(path.join(process.cwd(), "components/pin-gate.tsx"), "utf8");
    expect(gate).toMatch(/postMessage\(\{ type: "CLEAR_PRIVATE_CACHE" \}\)/);
  });
});

describe("SEC-061 the chat-wide wipe is gone", () => {
  it("the messages route exports no DELETE", async () => {
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    const mod = await import("@/app/api/ai/chat/messages/route");
    expect("DELETE" in mod).toBe(false);
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.PATCH).toBe("function");
  });
});
