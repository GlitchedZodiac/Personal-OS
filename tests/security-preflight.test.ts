import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

// scripts/security-preflight.mjs (D1 as revised): a PRODUCTION build fails
// without 32+-char AUTH_COOKIE_SECRET and APP_AUTH_SECRET, so a misconfigured
// deploy never replaces the last good one. Elsewhere it only warns.

const script = path.join(process.cwd(), "scripts/security-preflight.mjs");
const base: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "test" };

function run(env: Record<string, string>) {
  try {
    const out = execFileSync(process.execPath, [script], {
      env: { ...base, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: out.toString() };
  } catch (error) {
    const e = error as { status: number; stderr: Buffer; stdout: Buffer };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

const strong = "x".repeat(32);

describe("security-preflight", () => {
  it("refuses a production build with the secrets missing, naming each", () => {
    const r = run({ VERCEL_ENV: "production" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/AUTH_COOKIE_SECRET is not set/);
    expect(r.out).toMatch(/APP_AUTH_SECRET is not set/);
    expect(r.out).toMatch(/openssl rand -hex 32/);
  });
  it("refuses a production build with a short secret (the ≥32 rule)", () => {
    const r = run({ VERCEL_ENV: "production", AUTH_COOKIE_SECRET: strong, APP_AUTH_SECRET: "too-short" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/APP_AUTH_SECRET is shorter than 32 characters/);
  });
  it("passes a production build with both secrets set", () => {
    const r = run({ VERCEL_ENV: "production", AUTH_COOKIE_SECRET: strong, APP_AUTH_SECRET: strong, CRON_SECRET: "y".repeat(20) });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ok \(strict/);
  });
  it("only warns outside a production build (local, preview), and SECURITY_PREFLIGHT_STRICT=1 forces strict", () => {
    expect(run({}).code).toBe(0);
    expect(run({ VERCEL_ENV: "preview" }).code).toBe(0);
    expect(run({ SECURITY_PREFLIGHT_STRICT: "1" }).code).toBe(1);
  });
  it("is the first step of npm run build", async () => {
    const pkg = await import("node:fs").then((fs) => JSON.parse(fs.readFileSync("package.json", "utf8")));
    expect(pkg.scripts.build.startsWith("node scripts/security-preflight.mjs &&")).toBe(true);
  });
});
