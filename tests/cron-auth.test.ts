import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { cronSecretMatches, requireCronSecret, secretEquals } from "@/lib/cron-auth";

// SEC-038 (audit 2026-10): every cron route refuses when CRON_SECRET is unset
// and compares in constant time. Before, three of seven ran for anyone when
// the variable was missing.

const SECRET = "a-reasonably-long-cron-secret-0123";

function req(auth?: string) {
  return new NextRequest("http://localhost/api/cron/weekly-report", {
    headers: auth ? { authorization: auth } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cronSecretMatches", () => {
  it("fails closed when the secret is unset or blank", () => {
    expect(cronSecretMatches("Bearer anything", undefined)).toBe(false);
    expect(cronSecretMatches("Bearer anything", "")).toBe(false);
    expect(cronSecretMatches("Bearer anything", "   ")).toBe(false);
  });
  it("accepts only an exact Bearer match", () => {
    expect(cronSecretMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronSecretMatches(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronSecretMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronSecretMatches(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(cronSecretMatches(SECRET, SECRET)).toBe(false); // no scheme
    expect(cronSecretMatches(null, SECRET)).toBe(false);
  });
  it("secretEquals is false for empty inputs and true only for equal strings", () => {
    expect(secretEquals("", "x")).toBe(false);
    expect(secretEquals("x", null)).toBe(false);
    expect(secretEquals("abc", "abc")).toBe(true);
    expect(secretEquals("abc", "abd")).toBe(false);
  });
});

describe("requireCronSecret", () => {
  it("returns a 401 and logs when CRON_SECRET is unset — the old fail-open shape is gone", () => {
    vi.stubEnv("CRON_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const denied = requireCronSecret(req("Bearer whatever"));
    expect(denied?.status).toBe(401);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET is not set"));
  });
  it("returns null for the right secret and 401 for a wrong one", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(requireCronSecret(req(`Bearer ${SECRET}`))).toBeNull();
    expect(requireCronSecret(req("Bearer nope"))?.status).toBe(401);
    expect(requireCronSecret(req())?.status).toBe(401);
  });
});

describe("every cron route goes through the shared gate", () => {
  const dir = path.join(process.cwd(), "app/api/cron");
  const routes = fs.readdirSync(dir).map((d) => path.join(dir, d, "route.ts")).filter((p) => fs.existsSync(p));
  it("finds the seven crons", () => {
    expect(routes.length).toBe(7);
  });
  for (const file of routes) {
    it(`${path.relative(process.cwd(), file)} calls requireCronSecret and hand-rolls no CRON_SECRET compare`, () => {
      const src = fs.readFileSync(file, "utf8");
      expect(src).toMatch(/requireCronSecret\(request\)/);
      expect(src).not.toMatch(/process\.env\.CRON_SECRET/);
    });
  }
});
