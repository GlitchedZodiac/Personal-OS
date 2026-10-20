#!/usr/bin/env node
// Food-logging accuracy eval — ON DEMAND ONLY (it calls the model; never in
// `vitest`). Drives the REAL chat route on a dev server with synthetic
// utterances (tests/food-eval/fixtures.mjs), scores the proposal cards
// against public reference nutrients (foods.mjs), renders synthetic labels
// for the label reader, probes the photo path's failure modes, and writes:
//
//   tests/food-eval/last-run.json   the committed summary (synthetic only)
//   tests/food-eval/last-run.md     the same as markdown tables
//   tests/food-eval/reference.md    the nutrient table, from foods.mjs
//   tests/food-eval/<tag>.json/.md  a frozen copy when --tag is given
//
// Usage (from the repo root, dev server running against a LOCAL database):
//   DATABASE_URL=<local eval db> node scripts/food-eval.mjs --base http://localhost:3145 --tag after
//   node scripts/food-eval.mjs --limit 3 --skip-labels --skip-photos   (smoke)
//   node scripts/food-eval.mjs --resummarize tests/food-eval/baseline.json --tag baseline
//        (re-emit the tables of a saved run with the current metric code)
//   --base URL (loopback only; default http://localhost:3104)  --pin <PIN> (default: APP_PIN
//   from .env.local)  --server-tree <path> (the checkout the server runs; stamped in meta)
//   --concurrency 3
//   --repeat 3 (consistency runs)  --only A,B (id prefixes or groups)  --dry
//
// Everything it creates — the seeded usual, the seeded history rows, the
// chats, any food rows a correction flow saved — is deleted at the end
// unless --keep-seeds. It reads ai_usage_events for cost. It needs
// DATABASE_URL (process env, else .env.local), refuses anything that can
// reach beyond this machine (scripts/food-eval-db.mjs), refuses a non-loopback
// --base, and proves after seeding that the server and the harness are
// writing to the SAME database before it spends anything.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { isLoopbackHost, loopbackPgConfig } from "./food-eval-db.mjs";
import { FOODS, band, pointFor, referenceMarkdown } from "../tests/food-eval/foods.mjs";
import {
  CONSISTENCY_IDS,
  CORRECTIONS,
  FIXTURES,
  HISTORY_SEEDS,
  USUAL_SEED,
} from "../tests/food-eval/fixtures.mjs";
import { LABELS, LABEL_CHAT, SHAPES_HTML, TINY_PNG, labelHtml } from "../tests/food-eval/labels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tests", "food-eval");
const TZ = "America/Bogota";
const SEED_TAG = "food-eval seed";

// ─── args ────────────────────────────────────────────────────────────────
// --key=value, --key value, or a bare --flag.
const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) args[m[1]] = m[2];
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) args[m[1]] = argv[++i];
    else args[m[1]] = true;
  }
}
const BASE = typeof args.base === "string" ? args.base : "http://localhost:3104";
const SERVER_TREE = typeof args["server-tree"] === "string" ? path.resolve(args["server-tree"]) : null;
const CONCURRENCY = Number(args.concurrency || 3);
const REPEAT = Number(args.repeat || 3);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const ONLY = args.only ? String(args.only).split(",") : null;
const TAG = typeof args.tag === "string" ? args.tag : null;
const DRY = Boolean(args.dry);
const SKIP_LABELS = Boolean(args["skip-labels"]);
const SKIP_PHOTOS = Boolean(args["skip-photos"]);
const SKIP_CORRECTIONS = Boolean(args["skip-corrections"]);
const KEEP = Boolean(args["keep-seeds"]);
const RESUMMARIZE = typeof args.resummarize === "string" ? args.resummarize : null;
// --no-history: seed the usual but NOT the history rows — the "anchor off" arm
// of the D3 comparison (same utterances, nothing to anchor to).
const NO_HISTORY = Boolean(args["no-history"]);
// --stages corrections,labels,photos --merge tests/food-eval/before.json:
// re-run only those stages and fold them into an existing run (its main pass
// and repeats are kept as they were). For a run whose server was killed part
// way (it happened: another process restarting every dev server on the box).
const ONLY_STAGES = typeof args.stages === "string" ? new Set(args.stages.split(",")) : null;
const MERGE = typeof args.merge === "string" ? args.merge : null;
const wants = (stageName) => !ONLY_STAGES || ONLY_STAGES.has(stageName);

// ─── env + db ────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const ENV = loadEnvLocal();
const DB_URL = process.env.DATABASE_URL || ENV.DATABASE_URL;
// No literal default: the PIN comes from the flag, the process or .env.local.
const PIN = typeof args.pin === "string" ? args.pin : process.env.APP_PIN || ENV.APP_PIN;
if (!PIN && !args.dry && !args.resummarize) throw new Error("no PIN: set APP_PIN in .env.local or pass --pin");
{
  // Every write goes through the SERVER; the guard on DATABASE_URL protects
  // only the harness's own connection. A non-loopback --base would write
  // chats and seed rows to that server's database (production) and leave them.
  let host = "";
  try { host = new URL(BASE).hostname; } catch { /* handled below */ }
  if (!isLoopbackHost(host)) throw new Error(`refusing a non-loopback --base (${BASE})`);
}
// Loopback only, checked on the host pg will actually connect to — see
// scripts/food-eval-db.mjs (a `?host=` override used to slip past).
const pool = new pg.Pool({ ...loopbackPgConfig(DB_URL), max: 3 });
const sql = (text, params) => pool.query(text, params);

// ─── helpers ─────────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString();
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : null; }
function median(xs) { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function p90(xs) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : null; }
function cv(xs) { if (xs.length < 2) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; if (!m) return null; const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; return Math.sqrt(v) / m; }
function inRange(v, [lo, hi]) { return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi; }
function r1(n) { return n == null ? null : Math.round(n * 10) / 10; }

function localParts(date, timeZone = TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}
function addDays(dayStr, n) { const d = new Date(`${dayStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** The prompt's rule: <10 breakfast, 10–13 lunch, 14–16 snack, ≥17 dinner. */
function clockMeal(hour) { return hour < 10 ? "breakfast" : hour < 14 ? "lunch" : hour < 17 ? "snack" : "dinner"; }

function refFor(f) {
  if (f.ref) return f.ref;
  return band(pointFor(f.parts), f.bandOpts);
}

// ─── http ────────────────────────────────────────────────────────────────
let COOKIE = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: PIN }) });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const set = res.headers.get("set-cookie") || "";
  const m = set.match(/auth=([^;]+)/);
  if (!m) throw new Error("no auth cookie returned");
  COOKIE = `auth=${m[1]}`;
}
const H = () => ({ "content-type": "application/json", cookie: COOKIE });
async function api(method, p, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await apiOnce(method, p, body);
    if (r.status !== 0) return r;
    process.stdout.write(`  … server unreachable (${r.text}); waiting to resend\n`);
    if (!(await waitForServer())) return r;
    await login().catch(() => null);
  }
  return apiOnce(method, p, body);
}

async function apiOnce(method, p, body) {
  let res;
  try {
    res = await fetch(`${BASE}${p}`, { method, headers: H(), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return { ok: false, status: 0, json: null, text: `fetch: ${e?.cause?.code ?? e.message}` };
  }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text };
}

/** One turn through the real stream route. */
const TURN_TIMEOUT_MS = 75_000;
const INFRA_RE = /^(fetch|stream): /;

/** Wait until the server answers again (it may be restarted under us). */
async function waitForServer(maxMs = 180_000) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/auth`, { method: "GET" });
      if (r.status > 0) return true;
    } catch { /* still down */ }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return false;
}

/**
 * A turn lost to the INFRASTRUCTURE (connection refused, socket dropped) is
 * resent once the server is back — it never reached the model, so resending
 * it cannot bias the measurement. A timeout or a model error is NOT retried.
 * (2026-10-20: another process kept restarting every dev server on the box.)
 */
async function streamChat(args) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await streamChatOnce(args);
    if (!last.error || !INFRA_RE.test(last.error)) return last;
    process.stdout.write(`  … server unreachable (${last.error}); waiting to resend\n`);
    if (!(await waitForServer())) return last;
    await login().catch(() => null);
  }
  return last;
}

async function streamChatOnce({ message, images, conversationId, source = "text" }) {
  const t0 = Date.now();
  const out = { events: [], proposals: [], reply: "", conversationId: conversationId ?? null, ms: 0, msToCard: null, error: null, tools: [] };
  // A turn that never finishes is a miss, not a hang.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/api/ai/chat/stream`, {
      method: "POST", headers: H(), signal: abort.signal,
      body: JSON.stringify({ message, source, timeZone: TZ, ...(images ? { images } : {}), ...(conversationId ? { conversationId } : {}) }),
    });
  } catch (e) { clearTimeout(timer); out.error = abort.signal.aborted ? "timeout" : `fetch: ${e?.cause?.code ?? e.message}`; out.ms = Date.now() - t0; return out; }
  if (!res.ok || !res.body) { clearTimeout(timer); out.error = `http ${res.status} ${(await res.text()).slice(0, 200)}`; out.ms = Date.now() - t0; return out; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    let value, end;
    try { ({ value, done: end } = await reader.read()); } catch (e) { out.error = abort.signal.aborted ? "timeout" : `stream: ${e?.cause?.code ?? e.message}`; break; }
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        out.events.push(ev.type);
        if (ev.type === "conversation") { out.conversationId = ev.id; trackConversation(ev.id); }
        else if (ev.type === "delta") out.reply += ev.text;
        else if (ev.type === "proposal") { if (out.msToCard == null) out.msToCard = Date.now() - t0; out.proposals.push({ id: ev.id, kind: ev.kind, data: ev.data }); }
        else if (ev.type === "tool") out.tools.push(ev.query ?? ev.name);
        else if (ev.type === "error") out.error = ev.message;
        // Latency is measured to `done`; the stream is then read to its end
        // (the route still sends a `title` after `done` and closes itself —
        // cancelling here made it throw "Controller is already closed").
        else if (ev.type === "done") out.ms = Date.now() - t0;
      }
    }
  }
  clearTimeout(timer);
  if (!out.ms) out.ms = Date.now() - t0;
  return out;
}

async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const k = i++; results[k] = await tasks[k](); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return results;
}

// ─── scoring ─────────────────────────────────────────────────────────────
function foodItems(result) {
  return result.proposals.filter((p) => p.kind === "food").flatMap((p) => (Array.isArray(p.data?.items) ? p.data.items : []));
}
function totals(items) {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const it of items) { t.kcal += Number(it.calories) || 0; t.proteinG += Number(it.proteinG) || 0; t.carbsG += Number(it.carbsG) || 0; t.fatG += Number(it.fatG) || 0; }
  return t;
}
function macroKcal(t) { return 4 * t.proteinG + 4 * t.carbsG + 9 * t.fatG; }

function score(fixture, result, runLocal) {
  const items = foodItems(result);
  const ref = refFor(fixture);
  const t = totals(items);
  const s = {
    id: fixture.id, group: fixture.group, twinOf: fixture.twinOf ?? null, ms: result.ms, msToCard: result.msToCard ?? null, error: result.error,
    cardCount: result.proposals.filter((p) => p.kind === "food").length, items: items.length,
    carded: items.length > 0,
    tools: result.tools.length, toolNames: result.tools, reply: result.reply.slice(0, 120),
    // A refused or dropped connection is the infrastructure, not the model:
    // reported loudly and kept out of the rates. A timeout still counts.
    infra: typeof result.error === "string" && /^(fetch|stream): /.test(result.error),
    // the raw answer, so --resummarize can RE-SCORE when the scoring changes
    raw: { proposals: result.proposals, reply: result.reply, tools: result.tools, ms: result.ms, msToCard: result.msToCard ?? null, error: result.error },
    totals: { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) },
    ref: ref.point,
    inRange: null, errPct: null, itemsOk: null, macroSane: null, mealOk: null, timeOk: null, usualOk: null,
    perItem: [],
  };
  if (!items.length) {
    // No card (an error, a timeout, or a question back) is a MISS on every
    // expectation — a prompt that asks "how big was the bowl?" must not raise
    // the in-band rate by dropping the hard items.
    s.itemsOk = false;
    s.inRange = { kcal: false, proteinG: false, carbsG: false, fatG: false };
    s.mealOk = false;
    if (fixture.time || fixture.timesByItem) s.timeOk = false;
    if (typeof fixture.usual === "boolean") s.usualOk = false;
    if (fixture.history) s.historyOk = false;
    if (typeof fixture.anchor === "boolean") s.anchorOk = false;
    return s;
  }
  const [lo, hi] = Array.isArray(fixture.items) ? fixture.items : [fixture.items, fixture.items];
  s.itemsOk = items.length >= lo && items.length <= hi;
  s.inRange = { kcal: inRange(t.kcal, ref.kcal), proteinG: inRange(t.proteinG, ref.proteinG), carbsG: inRange(t.carbsG, ref.carbsG), fatG: inRange(t.fatG, ref.fatG) };
  s.errPct = {
    kcal: r1(((t.kcal - ref.point.kcal) / ref.point.kcal) * 100),
    proteinG: ref.point.proteinG ? r1(((t.proteinG - ref.point.proteinG) / ref.point.proteinG) * 100) : null,
    carbsG: ref.point.carbsG ? r1(((t.carbsG - ref.point.carbsG) / ref.point.carbsG) * 100) : null,
    fatG: ref.point.fatG ? r1(((t.fatG - ref.point.fatG) / ref.point.fatG) * 100) : null,
  };
  // D2 evidence: for the total AND per item, which side agrees with the reference
  const mk = macroKcal(t);
  s.macroSane = t.kcal > 0 ? Math.abs(mk - t.kcal) / t.kcal <= 0.15 : false;
  s.macroKcalInRange = inRange(mk, ref.kcal);
  s.macroKcalErrPct = r1(((mk - ref.point.kcal) / ref.point.kcal) * 100);
  s.perItem = items.map((it) => {
    const k = Number(it.calories) || 0, p = Number(it.proteinG) || 0, c = Number(it.carbsG) || 0, f = Number(it.fatG) || 0;
    const m = 4 * p + 4 * c + 9 * f;
    return { desc: String(it.foodDescription ?? "").slice(0, 60), kcal: k, macroKcal: Math.round(m), sane: k > 0 ? Math.abs(m - k) / k <= 0.15 : false, mealType: it.mealType, loggedAt: it.loggedAt ?? null, usual: Boolean(it.usual), confidence: it.confidence ?? null };
  });
  // meal type: explicit expectation, else the clock rule at run time
  const expectMeal = fixture.mealType ? (Array.isArray(fixture.mealType) ? fixture.mealType : [fixture.mealType]) : [clockMeal(runLocal.hour)];
  const meals = s.perItem.map((i) => i.mealType);
  s.mealOk = meals.length > 0 && meals.every((m) => expectMeal.includes(m));
  s.mealExpected = expectMeal.join("|");
  s.mealGot = [...new Set(meals)].join("|");
  // time: only when the fixture states one
  if (fixture.time) {
    // A stated clock time later than the run clock means the day before
    // ("at 7pm I ate…" said at 8 am). Identical to the old rule for any
    // run after the stated hour, so re-summarized runs score the same.
    const back = fixture.time.day === 0 && fixture.time.hour > runLocal.hour ? -1 : 0;
    const wantDay = addDays(runLocal.day, fixture.time.day + back);
    const stamps = s.perItem.map((i) => (i.loggedAt ? localParts(new Date(i.loggedAt)) : null));
    s.timeOk = stamps.length > 0 && stamps.every((st) => st && st.day === wantDay && st.hour === fixture.time.hour);
    s.timeGot = stamps.map((st) => (st ? `${st.day} ${st.hour}h` : "—")).join(", ");
    s.timeExpected = `${wantDay} ${fixture.time.hour}h`;
  }
  if (fixture.timesByItem && fixture.timesByItem.some((r) => r.hour > runLocal.hour)) {
    // "this morning … and at lunch" cannot be said before lunch; not scorable now
    s.timeOk = null;
    s.timeExpected = `not scorable before ${Math.max(...fixture.timesByItem.map((r) => r.hour))}h`;
  } else if (fixture.timesByItem) {
    const stamps = s.perItem.map((i) => ({ desc: i.desc, at: i.loggedAt ? localParts(new Date(i.loggedAt)) : null }));
    s.timeOk = stamps.length > 0 && stamps.every(({ desc, at }) => {
      const rule = fixture.timesByItem.find((r) => new RegExp(r.re, "i").test(desc));
      return !rule || (at && at.day === runLocal.day && at.hour === rule.hour);
    });
    s.timeGot = stamps.map(({ at }) => (at ? `${at.day} ${at.hour}h` : "—")).join(", ");
    s.timeExpected = fixture.timesByItem.map((r) => `${r.re}→${r.hour}h`).join(", ");
  }
  if (typeof fixture.usual === "boolean") s.usualOk = Boolean(items[0]?.usual) === fixture.usual;
  s.usualMatched = Boolean(items[0]?.usual);
  // Phase 3 additions (all additive on the proposal; null = not expected / not present)
  const card = result.proposals.find((p) => p.kind === "food");
  s.source = card?.data?.source ?? null;
  s.sourceOk = card ? card.data?.source === "chat" : null;
  s.confidenceShare = items.length ? pct(items.filter((it) => it.confidence).length, items.length) : null;
  s.historyPresent = items.some((it) => it.history);
  s.historyOk = fixture.history ? s.historyPresent : null;
  s.anchorPresent = Boolean(card?.data?.anchor);
  s.anchorOk = typeof fixture.anchor === "boolean" ? s.anchorPresent === fixture.anchor : null;
  s.suggestUsual = items.filter((it) => it.suggestUsual).length;
  s.collapsed = card?.data?.collapsed ?? 0;
  s.flagged = items.filter((it) => Array.isArray(it.flags) && it.flags.length).length;
  return s;
}

// ─── seeds + cleanup ─────────────────────────────────────────────────────
const created = { favoriteIds: [], foodIds: [], conversationIds: new Set() };
// Chats are deleted by the ids the server reported, never by a time window
// (a time window once swept a chat that was not the run's). The ids are also
// written to a file as they arrive, so a run that dies is cleaned by the next.
const PENDING_FILE = path.join(os.tmpdir(), `food-eval-pending-${crypto.createHash("sha1").update(String(DB_URL)).digest("hex").slice(0, 10)}.json`);
function trackConversation(id) {
  if (!id || created.conversationIds.has(id)) return;
  created.conversationIds.add(id);
  try { fs.writeFileSync(PENDING_FILE, JSON.stringify([...created.conversationIds])); } catch { /* best effort */ }
}
async function seed() {
  const fav = await api("POST", "/api/health/favorites", USUAL_SEED);
  if (fav.ok && fav.json?.id) created.favoriteIds.push(fav.json.id);
  for (const { daysAgo, ...row } of NO_HISTORY ? [] : HISTORY_SEEDS) {
    const loggedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const r = await api("POST", "/api/health/food", { ...row, loggedAt, notes: SEED_TAG, source: "manual" });
    if (r.ok && r.json?.id) created.foodIds.push(r.json.id);
  }
}
/** Tagged rows and recorded chats only — never a time window. */
async function cleanup() {
  if (KEEP) { console.log("[cleanup] --keep-seeds: leaving seeds and chats in place"); return; }
  let pending = [];
  try { pending = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")); } catch { /* none */ }
  const ids = [...new Set([...created.conversationIds, ...pending])];
  const food = await sql(`delete from food_logs where notes like $1 or notes like $2`, ["food-eval%", `%${SEED_TAG}%`]);
  const fav = await sql(`delete from favorite_foods where "foodDescription" = $1`, [USUAL_SEED.foodDescription]);
  const msgs = ids.length ? await sql(`delete from chat_messages where "conversationId" = any($1)`, [ids]) : { rowCount: 0 };
  const convs = ids.length ? await sql(`delete from chat_conversations where id = any($1)`, [ids]) : { rowCount: 0 };
  try { fs.unlinkSync(PENDING_FILE); } catch { /* none */ }
  console.log(`[cleanup] food rows ${food.rowCount} · favourites ${fav.rowCount} · chats ${convs.rowCount} (${msgs.rowCount} messages)`);
}

/** The server must be writing to the database the harness reads. */
async function verifySeedsVisible() {
  const food = created.foodIds.length
    ? (await sql(`select count(*)::int as n from food_logs where id = any($1)`, [created.foodIds])).rows[0].n
    : 0;
  const fav = created.favoriteIds.length
    ? (await sql(`select count(*)::int as n from favorite_foods where id = any($1)`, [created.favoriteIds])).rows[0].n
    : 0;
  if (food !== created.foodIds.length || fav !== created.favoriteIds.length || created.favoriteIds.length === 0) {
    throw new Error(`the server at ${BASE} is not writing to the harness's database (seeded ${created.foodIds.length}+${created.favoriteIds.length}, visible ${food}+${fav}) — refusing to run`);
  }
}

/** Code, data and model the numbers came from. */
async function fingerprint(startedAt) {
  const tree = SERVER_TREE ?? ROOT;
  const git = (cmd) => { try { return execSync(`git -C "${tree}" ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };
  const status = git("status --porcelain");
  const diffHash = crypto.createHash("sha1").update(git("diff HEAD")).update(status).digest("hex").slice(0, 12);
  const counts = (await sql(`select current_database() as db,
      (select count(*)::int from food_logs) as food_logs,
      (select count(*)::int from favorite_foods) as favorite_foods,
      (select count(*)::int from chat_conversations) as chat_conversations,
      (select count(*)::int from user_settings) as user_settings`)).rows[0];
  const models = (await sql(`select distinct model from ai_usage_events where "createdAt" >= $1::timestamp and surface = 'chat'`, [startedAt])).rows.map((r) => r.model);
  return { serverTree: path.basename(tree), commit: git("rev-parse --short HEAD").trim() || "unknown", dirty: status.trim().length > 0, treeHash: diffHash, db: counts, modelsObserved: models };
}

// ─── labels + photos ─────────────────────────────────────────────────────
let browserPromise = null;
async function browser() {
  if (!browserPromise) browserPromise = import("@playwright/test").then(({ chromium }) => chromium.launch());
  return browserPromise;
}
async function renderPng(html, { width, height, scale }) {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png", fullPage: true });
    return `data:image/png;base64,${png.toString("base64")}`;
  } finally { await ctx.close(); }
}
async function runLabels() {
  const out = [];
  for (const l of LABELS) {
    for (const [res, scale] of [["hi", 2], ["lo", 0.9]]) {
      const image = await renderPng(labelHtml(l), { width: 560, height: 10, scale });
      const t0 = Date.now();
      const r = await api("POST", "/api/health/food/scan-label", { image });
      const got = r.json ?? {};
      const ps = got.perServing ?? {};
      const close = (a, b, tol) => typeof a === "number" && Math.abs(a - b) <= tol;
      const grams = l.servingLabel.match(/\((\d+) g\)/)?.[1];
      out.push({
        id: l.id, res, lang: l.lang, ms: Date.now() - t0, ok: r.ok, confident: got.confident ?? null,
        productOk: typeof got.productName === "string" && (got.productName.toLowerCase().includes(l.brand.toLowerCase().split(" ")[0]) || got.productName.toLowerCase().includes(l.product.toLowerCase().split(" ")[0])),
        servingOk: typeof got.servingLabel === "string" && (!grams || got.servingLabel.includes(grams)),
        servingsOk: got.servingsPerContainer === l.servingsPerContainer,
        kcalOk: close(ps.calories, l.calories, 2), proteinOk: close(ps.proteinG, l.proteinG, 0.5), carbsOk: close(ps.carbsG, l.carbsG, 0.5), fatOk: close(ps.fatG, l.fatG, 0.5),
        got: { productName: got.productName, servingLabel: got.servingLabel, servingsPerContainer: got.servingsPerContainer, perServing: ps },
      });
      process.stdout.write(`  label ${l.id}/${res} ${r.ok ? "ok" : `HTTP ${r.status}`} kcal=${ps.calories} P=${ps.proteinG} C=${ps.carbsG} F=${ps.fatG}\n`);
    }
  }
  // the same panels through the chat with a servings multiplier
  const chat = [];
  for (const c of LABEL_CHAT) {
    const l = LABELS.find((x) => x.id === c.label);
    const image = await renderPng(labelHtml(l), { width: 560, height: 10, scale: 2 });
    const r = await streamChat({ message: c.text, images: [image], source: "photo" });
    const items = foodItems(r);
    const t = totals(items);
    const want = { kcal: l.calories * c.multiplier, proteinG: l.proteinG * c.multiplier, carbsG: l.carbsG * c.multiplier, fatG: l.fatG * c.multiplier };
    const within = (a, b) => (b === 0 ? Math.abs(a) <= 1 : Math.abs(a - b) / b <= 0.08);
    const rec = { id: c.id, label: c.label, multiplier: c.multiplier, ms: r.ms, error: r.error, cards: r.proposals.map((p) => p.kind), items: items.length, got: { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) }, want, scaledOk: items.length > 0 && within(t.kcal, want.kcal) && within(t.proteinG, want.proteinG) && within(t.carbsG, want.carbsG) && within(t.fatG, want.fatG), reply: r.reply.slice(0, 120) };
    chat.push(rec);
    process.stdout.write(`  label-chat ${c.id} cards=${rec.cards.join(",") || "none"} kcal=${rec.got.kcal} want=${want.kcal}\n`);
  }
  return { scan: out, chat };
}
async function runPhotoProbes() {
  const shapes = await renderPng(SHAPES_HTML, { width: 600, height: 600, scale: 1 });
  const probes = [
    { id: "P01", what: "coloured shapes, no food, no words", images: [shapes] },
    { id: "P02", what: "a 1×1 blank image, no words", images: [TINY_PNG] },
  ];
  const out = [];
  for (const p of probes) {
    const r = await streamChat({ message: "", images: p.images, source: "photo" });
    const invented = r.proposals.some((x) => x.kind === "food");
    out.push({ id: p.id, what: p.what, ms: r.ms, error: r.error, cards: r.proposals.map((x) => x.kind), inventedFood: invented, honest: !invented && !r.error, reply: r.reply.slice(0, 160) });
    process.stdout.write(`  probe ${p.id} cards=${out.at(-1).cards.join(",") || "none"} ${invented ? "INVENTED FOOD" : "no food card"}\n`);
  }
  return out;
}

// ─── corrections (two turns) ─────────────────────────────────────────────
async function runCorrections() {
  const out = [];
  for (const c of CORRECTIONS) {
    const t1 = await streamChat({ message: c.first });
    const card = t1.proposals.find((p) => p.kind === "food");
    let saved = false;
    let savedRows = [];
    if (c.confirm && card) {
      const items = (card.data.items ?? []).map((it) => ({ ...it, notes: `food-eval ${c.id}` }));
      const r = await api("POST", "/api/health/food/batch", { items, loggedAt: nowIso() });
      saved = r.ok;
      savedRows = Array.isArray(r.json) ? r.json.map((row) => ({ id: row.id, calories: Number(row.calories) || 0 })) : [];
      await api("PATCH", "/api/ai/chat/messages", { id: card.id, status: "saved" });
    }
    const t2 = await streamChat({ message: c.second, conversationId: t1.conversationId });
    const rec = { id: c.id, first: c.first, second: c.second, confirmed: saved, turn1Cards: t1.proposals.map((p) => p.kind), turn2Cards: t2.proposals.map((p) => p.kind), turn2Tools: t2.tools, ms: t1.ms + t2.ms, pass: false, note: "", raw: { turn1: t1.proposals, turn2: t2.proposals, reply2: t2.reply, error: t1.error ?? t2.error } };
    if (t1.error || t2.error) { rec.infra = /^(fetch|stream): /.test(t1.error ?? t2.error); rec.note = `error: ${t1.error ?? t2.error}`; out.push(rec); process.stdout.write(`  correction ${c.id} FAIL — ${rec.note}\n`); continue; }
    if (c.expect.kind === "edit_food") {
      const edits = t2.proposals.filter((p) => p.kind === "edit_food");
      if (!edits.length) rec.note = `no edit_food card (got ${rec.turn2Cards.join(",") || "text only"}); reply: ${t2.reply.slice(0, 80)}`;
      else if (c.expect.impliedTotal != null) {
        // Row-exact: each edit names the row it changes (the ids the save
        // returned); the meal's new total is every saved row at its new
        // kcal, or its old one when no edit touched it.
        const newById = new Map(edits.map((e) => [e.data?.id, Number(e.data?.set?.calories)]).filter(([id, k]) => id && Number.isFinite(k)));
        const unknown = [...newById.keys()].filter((id) => !savedRows.some((r) => r.id === id));
        const implied = savedRows.reduce((a, r) => a + (newById.has(r.id) ? newById.get(r.id) : r.calories), 0);
        rec.pass = unknown.length === 0 && newById.size > 0 && Math.abs(implied - c.expect.impliedTotal) / c.expect.impliedTotal <= 0.05;
        rec.note = `saved rows ${savedRows.map((r) => Math.round(r.calories)).join("+")} · edits ${[...newById.values()].join("+")}${unknown.length ? ` · ${unknown.length} edit(s) on a row it did not save` : ""} · new total ${Math.round(implied)} (want ${c.expect.impliedTotal})`;
      }
    } else if (c.expect.kind === "food") {
      const items = foodItems(t2);
      const ref = band(pointFor(c.expect.parts));
      const t = totals(items);
      rec.pass = items.length > 0 && inRange(t.kcal, ref.kcal);
      rec.note = items.length ? `re-proposed ${Math.round(t.kcal)} kcal (want ${ref.point.kcal})` : `no food card (got ${rec.turn2Cards.join(",") || "text only"}); reply: ${t2.reply.slice(0, 80)}`;
    }
    out.push(rec);
    process.stdout.write(`  correction ${c.id} ${rec.pass ? "PASS" : "FAIL"} — ${rec.note}\n`);
  }
  return out;
}

// ─── markdown ────────────────────────────────────────────────────────────
function tbl(headers, rows) { return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n"); }
const yn = (b) => (b === null || b === undefined ? "—" : b ? "yes" : "no");
const fmtPct = (v) => (v == null ? "—" : `${v} %`);
const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

const ALCOHOL_RE = /\b(beer|cerveza|wine|vino|alcohol|aguardiente|ron\b|rum|whisk|cocktail|tequila|vodka|gin|licor|liquor|michelada|sangr[ií]a)\b/i;

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/**
 * Builds the summary from per-utterance records. Rates are over EVERY
 * utterance sent — a missing card is a miss — and the card rate is reported
 * beside them; medians of error and time are over the utterances that got a
 * card (n stated). `stages` carries the cost of each stage's own time window.
 */
function summarize(allScores, allRuns, meta, labels, probes, corrections, stages) {
  const infraErrors = allScores.concat(allRuns).filter((s) => s.infra).map((s) => s.id);
  const scores = allScores.filter((s) => !s.infra);
  const runs = allRuns.filter((s) => !s.infra);
  for (const s of scores.concat(runs)) {
    for (const i of s.perItem ?? []) {
      i.alcohol = ALCOHOL_RE.test(i.desc ?? "");
      // Same rule as the app's check (lib/food-check.ts): items under 30 kcal
      // are not judged — a 2 kcal coffee is "0" by 4P+4C+9F and that is not
      // an error.
      i.sane = i.kcal < 30 ? true : Math.abs(i.macroKcal - i.kcal) / i.kcal <= 0.15;
    }
    const checkable = (s.perItem ?? []).filter((i) => !i.alcohol);
    s.hasAlcohol = (s.perItem ?? []).some((i) => i.alcohol);
    s.itemsSane = checkable.length > 0 ? checkable.every((i) => i.sane) : null;
  }
  const carded = scores.filter((s) => s.items > 0);
  const groups = [...new Set(FIXTURES.map((f) => f.group))];
  const rate = (xs, f) => pct(xs.filter(f).length, xs.length);
  const rateOf = (xs, key) => { const t = xs.filter((s) => s[key] !== null && s[key] !== undefined); return t.length ? pct(t.filter((s) => s[key]).length, t.length) : null; };
  const groupRows = [...groups.map((g) => [g, scores.filter((s) => s.group === g)]), ["ALL", scores]].filter(([, xs]) => xs.length).map(([g, xs]) => {
    const c = xs.filter((s) => s.items > 0);
    return {
      group: g, n: xs.length, cards: c.length,
      itemsOk: rate(xs, (s) => s.itemsOk), kcal: rate(xs, (s) => s.inRange?.kcal), protein: rate(xs, (s) => s.inRange?.proteinG), carbs: rate(xs, (s) => s.inRange?.carbsG), fat: rate(xs, (s) => s.inRange?.fatG),
      allFour: rate(xs, (s) => s.inRange?.kcal && s.inRange?.proteinG && s.inRange?.carbsG && s.inRange?.fatG),
      medAbsKcalErr: r1(median(c.map((s) => Math.abs(s.errPct.kcal)))), medKcalBias: r1(median(c.map((s) => s.errPct.kcal))),
      macroSane: (() => { const t = c.filter((s) => s.itemsSane !== null); return t.length ? pct(t.filter((s) => s.itemsSane).length, t.length) : null; })(),
      mealOk: rate(xs, (s) => s.mealOk), timeOk: rateOf(xs, "timeOk"), usualOk: rateOf(xs, "usualOk"),
      medMs: median(c.map((s) => s.ms)), medMsToCard: median(c.map((s) => s.msToCard).filter((v) => v != null)),
    };
  });

  // ── Consistency, primary: PAIRED TWINS — same food and portion, different
  // phrasing. Spread is the pair's coefficient of variation, |a−b| / (a+b),
  // the SAME unit as the noise floor below.
  const byId = Object.fromEntries(scores.map((s) => [s.id, s]));
  const pairs = FIXTURES.filter((f) => f.twinOf && byId[f.id] && byId[f.twinOf]).map((f) => {
    const a = byId[f.id], b = byId[f.twinOf];
    const both = a.items > 0 && b.items > 0;
    const cvPct = both && a.totals.kcal + b.totals.kcal > 0 ? r1((Math.abs(a.totals.kcal - b.totals.kcal) / (a.totals.kcal + b.totals.kcal)) * 100) : null;
    return { id: f.id, twinOf: f.twinOf, kind: f.group === "transcript" ? "transcript" : "paraphrase", kcalA: a.totals.kcal, kcalB: b.totals.kcal, bothCarded: both, cvPct, bothInRange: Boolean(a.inRange?.kcal && b.inRange?.kcal), itemsAgree: both && a.items === b.items };
  });
  const cvs = pairs.map((p) => p.cvPct).filter((v) => v != null);
  const paired = {
    pairs, n: pairs.length, scored: cvs.length,
    medianCvPct: r1(median(cvs)), meanCvPct: r1(mean(cvs)), p90CvPct: r1(p90(cvs)),
    shareBothInRange: pct(pairs.filter((p) => p.bothInRange).length, pairs.length),
    shareItemsAgree: pct(pairs.filter((p) => p.itemsAgree).length, pairs.length),
  };

  // ── Consistency, secondary: the SAMPLING NOISE FLOOR — identical text ×N.
  // He never sends the same text twice, so this says only how much of a
  // twin's spread is the model's own dice; differences between runs smaller
  // than its mean are not claimable.
  const cons = [];
  for (const id of CONSISTENCY_IDS) {
    const xs = runs.filter((r) => r.id === id);
    if (xs.length < 2) continue;
    const ok = xs.filter((r) => r.items > 0);
    const kc = ok.map((r) => r.totals.kcal);
    const ref = refFor(FIXTURES.find((f) => f.id === id));
    cons.push({ id, runs: xs.length, carded: ok.length, kcal: kc, cv: kc.length > 1 ? r1((cv(kc) ?? 0) * 100) : null, allInRange: ok.length === xs.length && kc.every((k) => inRange(k, ref.kcal)), spreadKcal: kc.length ? Math.max(...kc) - Math.min(...kc) : null });
  }
  const floorCvs = cons.map((c) => c.cv).filter((v) => v != null);
  const noiseFloor = { fixtures: cons, medianCvPct: r1(median(floorCvs)), meanCvPct: r1(mean(floorCvs)), p90CvPct: r1(p90(floorCvs)), shareAllInRange: pct(cons.filter((c) => c.allInRange).length, cons.length), within10Kcal: cons.filter((c) => c.spreadKcal != null && c.spreadKcal <= 10).length, cvUnder10: cons.filter((c) => c.cv != null && c.cv <= 10).length };

  // ── D2 evidence: an item whose kcal and 4P+4C+9F disagree — which side is
  // closer to the reference? (single-item utterances: the only ones with an
  // item-level reference; alcohol exempt)
  const single = carded.filter((s) => s.items === 1 && !s.hasAlcohol);
  const mismatched = single.filter((s) => !s.perItem[0].sane);
  const d2 = {
    singleItemUtterances: single.length, mismatched: mismatched.length,
    kcalCloser: mismatched.filter((s) => Math.abs(s.totals.kcal - s.ref.kcal) < Math.abs(s.perItem[0].macroKcal - s.ref.kcal)).length,
    macroCloser: mismatched.filter((s) => Math.abs(s.perItem[0].macroKcal - s.ref.kcal) < Math.abs(s.totals.kcal - s.ref.kcal)).length,
    rows: mismatched.map((s) => ({ id: s.id, desc: s.perItem[0].desc, kcal: s.totals.kcal, macroKcal: s.perItem[0].macroKcal, ref: s.ref.kcal, closer: Math.abs(s.totals.kcal - s.ref.kcal) <= Math.abs(s.perItem[0].macroKcal - s.ref.kcal) ? "kcal" : "macros" })),
    itemsChecked: carded.flatMap((s) => s.perItem).filter((i) => !i.alcohol && i.kcal >= 30).length,
    itemsMismatched: carded.flatMap((s) => s.perItem).filter((i) => !i.alcohol && !i.sane).length,
    alcoholItems: carded.flatMap((s) => s.perItem).filter((i) => i.alcohol).length,
  };
  d2.itemsMismatchedShare = pct(d2.itemsMismatched, d2.itemsChecked);

  const phase3 = {
    confidenceOnItems: pct(carded.flatMap((s) => s.perItem).filter((i) => i.confidence).length, carded.flatMap((s) => s.perItem).length),
    sourceChat: rateOf(scores, "sourceOk"),
    historyExpected: scores.filter((s) => s.historyOk !== null && s.historyOk !== undefined).length, historyOk: scores.filter((s) => s.historyOk).length,
    anchorExpected: scores.filter((s) => s.anchorOk !== null && s.anchorOk !== undefined).length, anchorOk: scores.filter((s) => s.anchorOk).length,
    anchorsInjected: carded.filter((s) => s.anchorPresent).map((s) => s.id),
    suggestUsualCards: carded.filter((s) => s.suggestUsual > 0).map((s) => s.id),
    collapsedCards: carded.filter((s) => s.collapsed > 0).map((s) => `${s.id}×${s.collapsed}`),
    flaggedItems: carded.reduce((a, s) => a + (s.flagged ?? 0), 0),
  };

  // ── cost by stage (each stage's own time window; stages run one after another)
  const stageCost = Object.fromEntries(Object.entries(stages ?? {}).map(([name, st]) => {
    const u = st.usage ?? {};
    const chat = u.chat ?? { calls: 0, input: 0, output: 0, usd: 0 };
    const usd = Object.values(u).reduce((a, x) => a + Number(x.usd ?? 0), 0);
    return [name, { chatCalls: chat.calls, meanInputTokens: chat.calls ? Math.round(chat.input / chat.calls) : null, meanOutputTokens: chat.calls ? Math.round(chat.output / chat.calls) : null, usdPerChatCall: chat.calls ? Math.round((Number(chat.usd) / chat.calls) * 10000) / 10000 : null, usd: Math.round(usd * 1000) / 1000, bySurface: u }];
  }));
  const toolTally = {};
  for (const s of carded) for (const t of s.toolNames ?? []) toolTally[t] = (toolTally[t] ?? 0) + 1;
  const cost = {
    stages: stageCost,
    totalUsd: Math.round(Object.values(stageCost).reduce((a, c) => a + c.usd, 0) * 1000) / 1000,
    latencyMs: { median: median(carded.map((s) => s.ms)), p90: p90(carded.map((s) => s.ms)), medianToCard: median(carded.map((s) => s.msToCard).filter((v) => v != null)) },
    readFirst: pct(carded.filter((s) => (s.toolNames ?? []).length > 0).length, carded.length),
    toolTally,
  };
  const errors = scores.filter((s) => s.error || s.items === 0).map((s) => ({ id: s.id, error: s.error, cards: s.cardCount, reply: s.reply }));
  const summary = { meta, infraErrors, groups: groupRows, paired, noiseFloor, d2, phase3, labels, probes, corrections, cost, errors, scores: allScores, runs: allRuns };

  const fp = meta.fingerprint ?? {};
  const md = [];
  md.push(`# Food eval — ${meta.tag ?? "run"} · ${meta.startedAt}`);
  md.push(`Server code \`${fp.commit ?? meta.commit}\`${fp.dirty ? ` + uncommitted changes (tree ${fp.treeHash})` : ""} · database \`${fp.db?.db ?? "?"}\` (${fp.db ? `${fp.db.food_logs} food rows, ${fp.db.favorite_foods} usuals, ${fp.db.chat_conversations} chats before seeding` : "not fingerprinted"}) · model observed \`${(fp.modelsObserved ?? []).join(", ") || meta.model}\` · reasoning \`${meta.reasoning}\` · temperature ${meta.temperature} · run clock ${meta.localDay} ${meta.localHour}h ${TZ} · ${meta.fixtureCount} utterances · synthetic fixtures only${meta.complete === false ? " · **PARTIAL RUN — written mid-way**" : ""}${meta.stageErrors && Object.keys(meta.stageErrors).length ? ` · stage errors: ${Object.entries(meta.stageErrors).map(([k, v]) => `${k}: ${v}`).join("; ")}` : ""}${meta.rescoredAt ? ` · re-scored ${meta.rescoredAt} with the current references` : ""}`);
  if (infraErrors.length) md.push(`\n**⚠ ${infraErrors.length} turn(s) lost to infrastructure (connection refused or dropped), excluded from every rate: ${infraErrors.join(", ")}. A run with any is re-run before it is used.**`);
  md.push("");
  md.push("## Cost by stage");
  md.push(tbl(["stage", "chat calls", "mean input tokens / call", "mean output tokens / call", "$ per chat call", "stage $"], Object.entries(stageCost).map(([k, c]) => [k, c.chatCalls, c.meanInputTokens ?? "—", c.meanOutputTokens ?? "—", c.usdPerChatCall ?? "—", c.usd])));
  md.push("");
  md.push(`Run total $${cost.totalUsd} · median ${cost.latencyMs.medianToCard ?? "—"} ms to the card (${cost.latencyMs.median ?? "—"} ms to the end of the turn) · read data before proposing on ${fmtPct(cost.readFirst)} of carded utterances${Object.keys(toolTally).length ? ` (${Object.entries(toolTally).map(([k, v]) => `${k} ×${v}`).join(", ")})` : ""}`);
  md.push("");
  md.push("## Accuracy by group — rates over EVERY utterance sent (no card = a miss)");
  md.push(tbl(["group", "n", "cards", "items split ok", "kcal in band", "P", "C", "F", "all four", "median |kcal err|", "median kcal bias", "items: macros≈kcal", "meal type", "time", "usual", "median ms to card"],
    groupRows.map((g) => [g.group, g.n, `${g.cards}/${g.n}`, fmtPct(g.itemsOk), fmtPct(g.kcal), fmtPct(g.protein), fmtPct(g.carbs), fmtPct(g.fat), fmtPct(g.allFour), fmtPct(g.medAbsKcalErr), g.medKcalBias == null ? "—" : `${g.medKcalBias > 0 ? "+" : ""}${g.medKcalBias} %`, fmtPct(g.macroSane), fmtPct(g.mealOk), fmtPct(g.timeOk), fmtPct(g.usualOk), g.medMsToCard ?? "—"])));
  md.push("");
  md.push("## Card fields (Phase 3 additions — absent before by design)");
  md.push(tbl(["items with confidence", "cards with source = chat", "history shown where seeded", "anchor gate right", "anchors handed to the model", "save-as-usual offered", "rows folded as duplicates", "items flagged"],
    [[fmtPct(phase3.confidenceOnItems), fmtPct(phase3.sourceChat), `${phase3.historyOk}/${phase3.historyExpected}`, `${phase3.anchorOk}/${phase3.anchorExpected}`, phase3.anchorsInjected.join(", ") || "none", phase3.suggestUsualCards.join(", ") || "none", phase3.collapsedCards.join(", ") || "none", phase3.flaggedItems]]));
  md.push("");
  md.push("## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)");
  md.push(`${paired.n} pairs (${paired.scored} with a card on both sides) · pair CV median **${paired.medianCvPct ?? "—"} %**, mean ${paired.meanCvPct ?? "—"} %, p90 ${paired.p90CvPct ?? "—"} % · both in band on **${fmtPct(paired.shareBothInRange)}** · same item count on ${fmtPct(paired.shareItemsAgree)}. Pair CV is |a−b| / (a+b), the same unit as the noise floor's CV.`);
  md.push("");
  md.push(tbl(["pair", "kind", "kcal (twin / clean)", "pair CV", "both in band", "items agree"], pairs.map((p) => [`${p.id} ↔ ${p.twinOf}`, p.kind, `${p.kcalA} / ${p.kcalB}`, p.cvPct == null ? "no card" : `${p.cvPct} %`, yn(p.bothInRange), yn(p.itemsAgree)])));
  md.push("");
  md.push(`## Consistency — NOISE FLOOR: identical text ${meta.repeat} times (sampling only)`);
  md.push(`CV median **${noiseFloor.medianCvPct ?? "—"} %**, mean ${noiseFloor.meanCvPct ?? "—"} %, p90 ${noiseFloor.p90CvPct ?? "—"} % · ${noiseFloor.within10Kcal}/${cons.length} within 10 kcal · ${noiseFloor.cvUnder10}/${cons.length} with CV ≤ 10 % · every run in band on ${fmtPct(noiseFloor.shareAllInRange)}. A twin difference smaller than the mean here is the model's dice, not phrasing.`);
  md.push("");
  md.push(tbl(["id", "runs (cards)", "kcal per run", "spread", "CV", "all in band"], cons.map((c) => [c.id, `${c.runs} (${c.carded})`, c.kcal.join(" / "), c.spreadKcal ?? "—", c.cv == null ? "—" : `${c.cv} %`, yn(c.allInRange)])));
  md.push("");
  md.push("## When an item's calories and macros disagree (> 15 %, items ≥ 30 kcal), which side is right? (D2 evidence)");
  md.push(`Checked ${d2.itemsChecked} items of 30 kcal or more (${d2.alcoholItems} alcohol items exempt): **${fmtPct(d2.itemsMismatchedShare)} disagree**. Single-item utterances: ${d2.singleItemUtterances}; ${d2.mismatched} disagree — kcal closer to the reference on ${d2.kcalCloser}, macros on ${d2.macroCloser}.`);
  if (d2.rows.length) md.push("\n" + tbl(["id", "item", "kcal", "4P+4C+9F", "reference", "closer"], d2.rows.map((r) => [r.id, cell(r.desc), r.kcal, r.macroKcal, r.ref, r.closer])));
  md.push("");
  if (labels) {
    md.push("## Label reader (`/api/health/food/scan-label`) — synthetic panels, exact match per field");
    md.push(tbl(["label", "lang", "res", "confident", "product", "serving", "servings/container", "kcal", "P", "C", "F", "ms"], labels.scan.map((l) => [l.id, l.lang, l.res, yn(l.confident), yn(l.productOk), yn(l.servingOk), yn(l.servingsOk), yn(l.kcalOk), yn(l.proteinOk), yn(l.carbsOk), yn(l.fatOk), l.ms])));
    md.push("");
    md.push("## Label through the chat with a servings multiplier");
    md.push(tbl(["id", "label", "×", "cards", "items", "got kcal/P/C/F", "want", "scaled ok (±8 %)", "ms"], labels.chat.map((c) => [c.id, c.label, c.multiplier, c.cards.join(",") || "none", c.items, `${c.got.kcal}/${c.got.proteinG}/${c.got.carbsG}/${c.got.fatG}`, `${c.want.kcal}/${c.want.proteinG}/${c.want.carbsG}/${c.want.fatG}`, yn(c.scaledOk), c.ms])));
    md.push("");
  }
  if (probes) {
    md.push("## Photo path — failure modes only (no meal photos were downloaded; D6)");
    md.push(tbl(["probe", "image", "cards", "invented a meal?", "honest", "reply (start)", "ms"], probes.map((p) => [p.id, p.what, p.cards.join(",") || "none", yn(p.inventedFood), yn(p.honest), cell(p.reply), p.ms])));
    md.push("");
  }
  if (corrections) {
    md.push("## Corrections (two turns; edits checked against the rows actually saved)");
    md.push(tbl(["id", "turn 1", "saved?", "turn 2", "turn-2 cards", "pass", "note"], corrections.map((c) => [c.id, c.first, yn(c.confirmed), c.second, c.turn2Cards.join(",") || "text only", yn(c.pass), cell(c.note)])));
    md.push("");
  }
  if (errors.length) {
    md.push("## Utterances with no food card or an error (counted as misses above)");
    md.push(tbl(["id", "error", "cards", "reply (start)"], errors.map((e) => [e.id, e.error ?? "—", e.cards, cell(e.reply)])));
    md.push("");
  }
  md.push("## Every utterance");
  md.push(tbl(["id", "group", "items", "kcal got/ref", "P", "C", "F", "kcal in band", "items: macros≈kcal", "meal got/exp", "time ok", "tools", "ms to card"],
    scores.map((s) => [s.id, s.group, `${s.items}`, `${s.totals.kcal}/${s.ref.kcal}`, `${s.totals.proteinG}/${s.ref.proteinG}`, `${s.totals.carbsG}/${s.ref.carbsG}`, `${s.totals.fatG}/${s.ref.fatG}`, s.inRange ? yn(s.inRange.kcal) : "—", s.itemsSane === null || s.itemsSane === undefined ? (s.hasAlcohol ? "alcohol" : "—") : yn(s.itemsSane), s.mealGot ? `${s.mealGot}/${s.mealExpected}` : "—", s.timeOk === null || s.timeOk === undefined ? "—" : yn(s.timeOk), (s.toolNames ?? []).join(",") || "—", s.msToCard ?? "—"])));
  return { summary, md: md.join("\n") + "\n" };
}

async function usageWindow(from, to) {
  const r = await sql(
    `select surface, count(*)::int as calls, coalesce(sum("inputTokens"),0)::int as input, coalesce(sum("outputTokens"),0)::int as output, coalesce(sum("costUsd"),0)::float as usd
       from ai_usage_events where "createdAt" >= $1::timestamp and "createdAt" <= $2::timestamp and surface = any($3) group by surface`,
    [from, to, ["chat", "chat-title", "photo"]]
  );
  return Object.fromEntries(r.rows.map((row) => [row.surface, row]));
}

/** Re-score a saved run with the CURRENT fixtures and references (raw answers required). */
async function resummarize(file) {
  const prior = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
  const runLocal = { day: prior.meta.localDay, hour: prior.meta.localHour };
  const hasRaw = (prior.scores ?? []).every((s) => s.raw);
  if (!hasRaw) throw new Error(`${file} has no raw answers (written before 2026-10-20) — it cannot be re-scored; run the eval again`);
  const rescore = (s) => { const f = FIXTURES.find((x) => x.id === s.id); return f ? score(f, { proposals: s.raw.proposals, reply: s.raw.reply, tools: s.raw.tools, ms: s.raw.ms, msToCard: s.raw.msToCard, error: s.raw.error }, runLocal) : null; };
  const scores = prior.scores.map(rescore).filter(Boolean);
  const runs = (prior.runs ?? []).map(rescore).filter(Boolean);
  const stages = prior.stages ?? {};
  const meta = { ...prior.meta, tag: TAG ?? prior.meta.tag, rescoredAt: nowIso() };
  const { summary, md } = summarize(scores, runs, meta, prior.labels ?? null, prior.probes ?? null, prior.corrections ?? null, stages);
  summary.stages = stages;
  fs.writeFileSync(path.join(OUT_DIR, "last-run.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "last-run.md"), md);
  // A frozen run is only overwritten when the caller names it explicitly.
  if (typeof args.tag === "string") { fs.writeFileSync(path.join(OUT_DIR, `${args.tag}.json`), JSON.stringify(summary, null, 2)); fs.writeFileSync(path.join(OUT_DIR, `${args.tag}.md`), md); }
  console.log(`[food-eval] re-scored ${file} → last-run.{json,md}${typeof args.tag === "string" ? ` and ${args.tag}.{json,md}` : ""}`);
}

async function assertLoopbackServer() {
  // The connection string was checked; this checks where we actually landed.
  const addr = (await sql("select inet_server_addr()::text as a")).rows[0].a;
  if (addr !== null && !/^(127\.|::1)/.test(addr.replace(/\/\d+$/, ""))) {
    throw new Error(`the database server answered from ${addr}, which is not this machine — refusing to run`);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "reference.md"), referenceMarkdown());
  await assertLoopbackServer();
  if (RESUMMARIZE) { await resummarize(RESUMMARIZE); await pool.end(); return; }

  let fixtures = FIXTURES.filter((f) => !ONLY || ONLY.some((g) => f.id.startsWith(g) || f.group === g));
  if (Number.isFinite(LIMIT)) fixtures = fixtures.slice(0, LIMIT);
  const consistencyIds = REPEAT > 1 ? CONSISTENCY_IDS.filter((id) => fixtures.some((f) => f.id === id)) : [];

  // validate references before spending anything
  for (const f of FIXTURES) { const ref = refFor(f); if (!ref.point || !(ref.kcal[1] > ref.kcal[0])) throw new Error(`bad reference for ${f.id}`); }
  for (const key of new Set(FIXTURES.flatMap((f) => (f.parts ?? []).map((p) => p[0])))) if (!FOODS[key]) throw new Error(`fixture uses unknown food ${key}`);

  const startedAt = nowIso();
  const runLocal = localParts(new Date());
  const meta = { tag: TAG, startedAt, localDay: runLocal.day, localHour: runLocal.hour, timeZone: TZ, model: process.env.OPENAI_MODEL || ENV.OPENAI_MODEL || "gpt-5.6-terra", reasoning: "low", temperature: "not set by the route (API default)", base: BASE, fixtureCount: fixtures.length, consistencyCount: consistencyIds.length, repeat: REPEAT, concurrency: CONCURRENCY, synthetic: true, historySeeded: !NO_HISTORY };
  console.log(`[food-eval] ${fixtures.length} utterances · ${consistencyIds.length} × ${REPEAT} noise floor · ${runLocal.day} ${runLocal.hour}h ${TZ} · base ${BASE}${DRY ? " · DRY RUN" : ""}`);
  if (DRY) {
    for (const f of fixtures) { const ref = refFor(f); console.log(`  ${f.id} ${f.group.padEnd(11)} ref ${ref.point.kcal} kcal [${Math.round(ref.kcal[0])}–${Math.round(ref.kcal[1])}] P${ref.point.proteinG} C${ref.point.carbsG} F${ref.point.fatG}  "${f.text}"`); }
    await pool.end();
    return;
  }

  // Leftovers of a run that died are removed before anything is seeded.
  await cleanup();
  meta.fingerprint = await fingerprint(startedAt);
  let stopping = false;
  const onSignal = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.error(`\n[food-eval] ${sig} — cleaning up before exit`);
    try { if (browserPromise) (await browserPromise).close(); } catch { /* fine */ }
    try { await cleanup(); await pool.end(); } catch (e) { console.error(e); }
    process.exit(130);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  let merged = null;
  if (MERGE) {
    merged = JSON.parse(fs.readFileSync(path.resolve(ROOT, MERGE), "utf8"));
    if (!ONLY_STAGES) throw new Error("--merge needs --stages");
    console.log(`[food-eval] merging stages ${[...ONLY_STAGES].join(",")} into ${MERGE}`);
  }

  await login();
  await seed();
  await verifySeedsVisible();
  console.log(`[seed] usual ${created.favoriteIds.length} · history rows ${created.foodIds.length} · visible to the harness: yes`);

  // Written after EVERY stage, so a server that dies mid-run cannot take the
  // earlier calls with it.
  let scores = merged?.scores ?? [], runs = merged?.runs ?? [], corrections = merged?.corrections ?? null, labels = merged?.labels ?? null, probes = merged?.probes ?? null;
  const stageErrors = {};
  const stages = merged?.stages ? { ...merged.stages } : {};
  if (merged) { Object.assign(meta, merged.meta, { mergedAt: nowIso(), mergedStages: [...ONLY_STAGES] }); }
  const persist = async (final = false) => {
    for (const st of Object.values(stages)) st.usage = await usageWindow(st.from, st.to ?? nowIso()).catch(() => ({}));
    if (final) meta.fingerprint.modelsObserved = (await fingerprint(startedAt)).modelsObserved;
    const { summary, md } = summarize(scores, runs, { ...meta, finishedAt: nowIso(), complete: final, stageErrors }, labels, probes, corrections, stages);
    summary.stages = stages;
    fs.writeFileSync(path.join(OUT_DIR, "last-run.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "last-run.md"), md);
    if (TAG && final) { fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(summary, null, 2)); fs.writeFileSync(path.join(OUT_DIR, `${TAG}.md`), md); }
    return summary;
  };
  const stage = async (name, fn) => {
    stages[name] = { from: nowIso(), to: null };
    try { return await fn(); } catch (e) { stageErrors[name] = String(e?.message ?? e); console.error(`[food-eval] stage ${name} failed: ${stageErrors[name]}`); return null; } finally { stages[name].to = nowIso(); }
  };

  try {
    if (wants("main")) scores = (await stage("main", () => runPool(fixtures.map((f) => async () => {
      const r = await streamChat({ message: f.text });
      const s = score(f, r, runLocal);
      process.stdout.write(`  ${f.id} ${s.error ? `ERROR ${s.error}` : s.items ? `${s.items} items · ${s.totals.kcal} kcal (ref ${s.ref.kcal}) ${s.inRange?.kcal ? "✓" : "✗"} · ${s.msToCard} ms` : `NO CARD · ${s.reply.slice(0, 60)}`}\n`);
      return s;
    }), CONCURRENCY))) ?? [];
    await persist();
    if (wants("repeats")) runs = [...scores.filter((s) => consistencyIds.includes(s.id))];
    if (consistencyIds.length && wants("repeats")) {
      await stage("repeats", async () => {
        for (let k = 1; k < REPEAT; k++) {
          runs.push(...await runPool(consistencyIds.map((id) => async () => {
            const f = FIXTURES.find((x) => x.id === id);
            const s = score(f, await streamChat({ message: f.text }), runLocal);
            process.stdout.write(`  ${f.id} run ${k + 1}: ${s.items} items · ${s.totals.kcal} kcal\n`);
            return s;
          }), CONCURRENCY));
        }
      });
      await persist();
    }
    if (!SKIP_CORRECTIONS && wants("corrections")) { corrections = await stage("corrections", runCorrections); await persist(); }
    if (!SKIP_LABELS && wants("labels")) { labels = await stage("labels", runLabels); await persist(); }
    if (!SKIP_PHOTOS && wants("photos")) { probes = await stage("photos", runPhotoProbes); await persist(); }
    const summary = await persist(true);
    const all = summary.groups.at(-1);
    console.log(`\n[food-eval] wrote ${path.relative(ROOT, OUT_DIR)}/last-run.{json,md}${TAG ? ` and ${TAG}.{json,md}` : ""} · $${summary.cost.totalUsd}${Object.keys(stageErrors).length ? ` · STAGE ERRORS: ${JSON.stringify(stageErrors)}` : ""}`);
    if (all) console.log(`[food-eval] ALL: cards ${all.cards}/${all.n} · kcal in band ${all.kcal} % · all four ${all.allFour} % · twins pair CV median ${summary.paired.medianCvPct} % (both in band ${summary.paired.shareBothInRange} %) · noise floor CV mean ${summary.noiseFloor.meanCvPct} %`);
  } finally {
    if (browserPromise) { try { (await browserPromise).close(); } catch { /* fine */ } }
    if (!stopping) { await cleanup(); await pool.end(); }
  }
}

main().catch(async (e) => { console.error(e); try { if (browserPromise) (await browserPromise).close(); } catch { /* fine */ } try { await cleanup(); } catch { /* fine */ } try { await pool.end(); } catch { /* fine */ } process.exit(1); });
