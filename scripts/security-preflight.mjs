#!/usr/bin/env node
// Build-time guard for the signing secrets (SEC-001/SEC-002, PLAN D1 as
// revised by review, 2026-10). A PRODUCTION build must not ship without
// AUTH_COOKIE_SECRET and APP_AUTH_SECRET of at least 32 characters: a failed
// Vercel build keeps the last good deployment live, whereas the runtime
// refusal (the second line of defence in lib/auth.ts and lib/security.ts)
// would take the web app, the watch, the iPhone and the Claude connector
// down together. Runs first in `npm run build`.
//
// Strict when VERCEL_ENV === "production" (Vercel sets it during the build)
// or when SECURITY_PREFLIGHT_STRICT=1. Elsewhere it only warns.
//
// It reads process.env only: on Vercel the project's variables are in the
// build's environment; locally `npm run build` does NOT load .env.local (Next
// does that itself later), so a local run warns about variables that are in
// fact set in the file — harmless, and strict mode is never on locally.

const MIN_LENGTH = 32;
const REQUIRED = ["AUTH_COOKIE_SECRET", "APP_AUTH_SECRET"];

export function evaluate(env = process.env) {
  const problems = [];
  for (const name of REQUIRED) {
    const value = (env[name] ?? "").trim();
    if (!value) problems.push(`${name} is not set`);
    else if (value.length < MIN_LENGTH) problems.push(`${name} is shorter than ${MIN_LENGTH} characters`);
  }
  const warnings = [];
  if (!(env.CRON_SECRET ?? "").trim()) warnings.push("CRON_SECRET is not set — every /api/cron/* call will be refused");
  const strict = env.VERCEL_ENV === "production" || env.SECURITY_PREFLIGHT_STRICT === "1";
  return { problems, warnings, strict, ok: !(strict && problems.length > 0) };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { problems, warnings, strict, ok } = evaluate();
  const where = `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`;
  for (const w of warnings) console.warn(`[security-preflight] warning: ${w}`);
  if (!ok) {
    console.error(`[security-preflight] REFUSING a production build (${where}):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `  Set each in Vercel → Settings → Environment Variables (Production) to a value from \`openssl rand -hex 32\` (${MIN_LENGTH}+ characters), then redeploy. The previous deployment stays live meanwhile.`
    );
    process.exit(1);
  }
  if (problems.length > 0) {
    console.warn(`[security-preflight] ${problems.join("; ")} — allowed because this is not a production build (${where}).`);
  } else {
    console.log(`[security-preflight] ok (${strict ? "strict" : "advisory"}, ${where})`);
  }
}
