// Privacy guards for the screen-audit tooling (lane C, 2026-10). The repo
// is public: nothing captured from a real database may land under docs/.
// Shared by scripts/seed-screens.mjs and scripts/screenshot-screens.mjs, and
// tested in tests/screens-guards.test.ts.

import { relative, resolve } from "node:path";
import { parse as parseConnection } from "pg-connection-string";

export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Why a connection string may NOT be seeded (wiped and refilled), or null
 * when it may. Parsed the way pg parses it, so `?host=` cannot redirect a
 * "localhost" URL; any query parameter other than sslmode is refused.
 */
export function seedRefusal(connectionString) {
  let url;
  let parsed;
  try {
    url = new URL(connectionString);
    parsed = parseConnection(connectionString);
  } catch {
    return "not a postgres connection string";
  }
  const extra = [...url.searchParams.keys()].filter((k) => k !== "sslmode");
  if (extra.length) return `unexpected query parameter(s): ${extra.join(", ")}`;
  const host = String(parsed.host ?? "");
  if (!LOCAL_HOSTS.has(host)) return `host ${host || "(socket)"} is not local`;
  if (!String(parsed.database ?? "").endsWith("_demo")) return `database ${parsed.database} does not end in _demo`;
  return null;
}

/** Why a base URL may not be driven by the screenshot script, or null. */
export function baseRefusal(base) {
  let u;
  try {
    u = new URL(base);
  } catch {
    return "not a URL";
  }
  if (u.protocol !== "http:") return `protocol ${u.protocol} (local dev servers are http)`;
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) return `host ${u.hostname} is not local`;
  return null;
}

/** True when `out` resolves inside the repository's docs/ directory. */
export function writesUnderDocs(out, repoRoot = process.cwd()) {
  const rel = relative(resolve(repoRoot, "docs"), resolve(repoRoot, out));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}
