// The food eval's database guard (2026-10-20, after review of d3f537a).
//
// The harness writes and deletes rows, so it must only ever touch a LOCAL
// copy. The first guard read `new URL(DATABASE_URL).hostname` — but
// node-postgres honours a `?host=` (or `hostaddr=`) query parameter and
// connects THERE, so `postgresql://u:p@127.0.0.1/db?host=prod.example.com`
// passed the check and pointed at production. Now: any query override of
// where to connect is refused outright, the string is parsed with the same
// parser pg uses, and the pool is built from that parsed config — the
// checked host and the connected host are one value.

import parseModule from "pg-connection-string";

const parse = parseModule.parse ?? parseModule;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** Query parameters that would change where (or how) pg connects. */
const FORBIDDEN_PARAMS = ["host", "hostaddr", "port", "options", "sslmode", "service", "target_session_attrs"];

export function isLoopbackHost(host) {
  return typeof host === "string" && LOOPBACK.has(host.toLowerCase());
}

/**
 * Throws unless `url` can only reach a database on this machine. Returns the
 * node-postgres config to connect with (TLS off: a local copy has none).
 * `sslmode=disable` is the one query parameter allowed, since the lane's
 * .env.local carries it; everything else that steers the connection is refused.
 */
export function loopbackPgConfig(url) {
  if (typeof url !== "string" || !url.trim()) throw new Error("DATABASE_URL missing (.env.local)");
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    throw new Error("DATABASE_URL is not a URL");
  }
  if (!/^postgres(ql)?:$/.test(parsedUrl.protocol)) throw new Error(`refusing a non-postgres URL (${parsedUrl.protocol})`);
  for (const key of parsedUrl.searchParams.keys()) {
    const k = key.toLowerCase();
    if (k === "sslmode" && parsedUrl.searchParams.get(key) === "disable") continue;
    if (FORBIDDEN_PARAMS.includes(k)) throw new Error(`refusing a DATABASE_URL that overrides the connection with ?${key}=`);
  }
  if (!isLoopbackHost(parsedUrl.hostname)) {
    throw new Error(`refusing to run the eval against a non-loopback database (${parsedUrl.hostname || "no host"})`);
  }
  parsedUrl.searchParams.delete("sslmode");
  const config = parse(parsedUrl.toString());
  // belt and braces: what pg itself will connect to
  if (!isLoopbackHost(config.host)) {
    throw new Error(`refusing to run the eval against a non-loopback database (${config.host || "no host"})`);
  }
  return {
    host: config.host,
    port: config.port ? Number(config.port) : 5432,
    database: config.database ?? undefined,
    user: config.user ?? undefined,
    password: config.password ?? undefined,
    ssl: false,
  };
}
