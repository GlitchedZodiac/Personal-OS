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
//   node scripts/food-eval.mjs --tag baseline
//   node scripts/food-eval.mjs --limit 3 --skip-labels --skip-photos   (smoke)
//   node scripts/food-eval.mjs --resummarize tests/food-eval/baseline.json --tag baseline
//        (re-emit the tables of a saved run with the current metric code)
//   --base URL (default http://localhost:3104)  --pin 2468  --concurrency 3
//   --repeat 3 (consistency runs)  --only A,B (id prefixes or groups)  --dry
//
// Everything it creates — the seeded usual, the seeded history rows, the
// chats, any food rows a correction flow saved — is deleted at the end
// unless --keep-seeds. It reads ai_usage_events for cost. It needs
// DATABASE_URL from .env.local and refuses a non-loopback host.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
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
const BASE = args.base || "http://localhost:3104";
const PIN = String(args.pin || process.env.APP_PIN || "2468");
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
if (!DB_URL) throw new Error("DATABASE_URL missing (.env.local)");
{
  const host = new URL(DB_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(`refusing to run the eval against a non-loopback database (${host})`);
  }
}
const pool = new pg.Pool({ connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""), ssl: false, max: 3 });
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
async function streamChat({ message, images, conversationId, source = "text" }) {
  const t0 = Date.now();
  const out = { events: [], proposals: [], reply: "", conversationId: conversationId ?? null, ms: 0, error: null, tools: [] };
  let res;
  try {
    res = await fetch(`${BASE}/api/ai/chat/stream`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ message, source, timeZone: TZ, ...(images ? { images } : {}), ...(conversationId ? { conversationId } : {}) }),
    });
  } catch (e) { out.error = `fetch: ${e?.cause?.code ?? e.message}`; out.ms = Date.now() - t0; return out; }
  if (!res.ok || !res.body) { out.error = `http ${res.status} ${(await res.text()).slice(0, 200)}`; out.ms = Date.now() - t0; return out; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    let value, end;
    try { ({ value, done: end } = await reader.read()); } catch (e) { out.error = `stream: ${e?.cause?.code ?? e.message}`; break; }
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        out.events.push(ev.type);
        if (ev.type === "conversation") out.conversationId = ev.id;
        else if (ev.type === "delta") out.reply += ev.text;
        else if (ev.type === "proposal") out.proposals.push({ id: ev.id, kind: ev.kind, data: ev.data });
        else if (ev.type === "tool") out.tools.push(ev.query ?? ev.name);
        else if (ev.type === "error") out.error = ev.message;
        // Latency is measured to `done`; the stream is then read to its end
        // (the route still sends a `title` after `done` and closes itself —
        // cancelling here made it throw "Controller is already closed").
        else if (ev.type === "done") out.ms = Date.now() - t0;
      }
    }
  }
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
    id: fixture.id, group: fixture.group, twinOf: fixture.twinOf ?? null, ms: result.ms, error: result.error,
    cardCount: result.proposals.filter((p) => p.kind === "food").length, items: items.length,
    tools: result.tools.length, reply: result.reply.slice(0, 120),
    totals: { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) },
    ref: ref.point,
    inRange: null, errPct: null, itemsOk: null, macroSane: null, mealOk: null, timeOk: null, usualOk: null,
    perItem: [],
  };
  if (!items.length) return s;
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
    const wantDay = addDays(runLocal.day, fixture.time.day);
    const stamps = s.perItem.map((i) => (i.loggedAt ? localParts(new Date(i.loggedAt)) : null));
    s.timeOk = stamps.length > 0 && stamps.every((st) => st && st.day === wantDay && st.hour === fixture.time.hour);
    s.timeGot = stamps.map((st) => (st ? `${st.day} ${st.hour}h` : "—")).join(", ");
    s.timeExpected = `${wantDay} ${fixture.time.hour}h`;
  }
  if (typeof fixture.usual === "boolean") s.usualOk = Boolean(items[0]?.usual) === fixture.usual;
  s.usualMatched = Boolean(items[0]?.usual);
  return s;
}

// ─── seeds + cleanup ─────────────────────────────────────────────────────
const created = { favoriteIds: [], foodIds: [] };
async function seed() {
  const fav = await api("POST", "/api/health/favorites", USUAL_SEED);
  if (fav.ok && fav.json?.id) created.favoriteIds.push(fav.json.id);
  for (const row of HISTORY_SEEDS) {
    const daysAgo = 3 + Math.floor(Math.random() * 60);
    const loggedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const r = await api("POST", "/api/health/food", { ...row, loggedAt, notes: SEED_TAG, source: "manual" });
    if (r.ok && r.json?.id) created.foodIds.push(r.json.id);
  }
}
async function cleanup(runStartIso) {
  if (KEEP) { console.log("[cleanup] --keep-seeds: leaving seeds and chats in place"); return; }
  // SQL first: it works even when the dev server has died mid-run (which is
  // exactly when a cleanup matters most). The API deletes are best-effort.
  const food = await sql(`delete from food_logs where notes like $1 or notes like $2`, ["food-eval%", `%${SEED_TAG}%`]);
  const fav = await sql(`delete from favorite_foods where "foodDescription" = $1`, [USUAL_SEED.foodDescription]);
  const msgs = await sql(`delete from chat_messages where "conversationId" in (select id from chat_conversations where "createdAt" >= $1::timestamp)`, [runStartIso]);
  const convs = await sql(`delete from chat_conversations where "createdAt" >= $1::timestamp`, [runStartIso]);
  for (const id of created.favoriteIds) await api("DELETE", `/api/health/favorites?id=${id}`).catch(() => null);
  for (const id of created.foodIds) await api("DELETE", `/api/health/food?id=${id}`).catch(() => null);
  console.log(`[cleanup] food rows ${food.rowCount} · favourites ${fav.rowCount} · chats ${convs.rowCount} (${msgs.rowCount} messages)`);
}
async function usageSince(iso, surfaces) {
  const r = await sql(
    `select surface, count(*)::int as calls, coalesce(sum("inputTokens"),0)::int as input, coalesce(sum("outputTokens"),0)::int as output, coalesce(sum("costUsd"),0)::float as usd
       from ai_usage_events where "createdAt" >= $1::timestamp and surface = any($2) group by surface`,
    [iso, surfaces]
  );
  return Object.fromEntries(r.rows.map((row) => [row.surface, row]));
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
    if (c.confirm && card) {
      const items = (card.data.items ?? []).map((it) => ({ ...it, notes: `food-eval ${c.id}` }));
      const r = await api("POST", "/api/health/food/batch", { items, loggedAt: nowIso() });
      saved = r.ok;
      await api("PATCH", "/api/ai/chat/messages", { id: card.id, status: "saved" });
    }
    const t2 = await streamChat({ message: c.second, conversationId: t1.conversationId });
    const rec = { id: c.id, first: c.first, second: c.second, confirmed: saved, turn1Cards: t1.proposals.map((p) => p.kind), turn2Cards: t2.proposals.map((p) => p.kind), turn2Tools: t2.tools, ms: t1.ms + t2.ms, pass: false, note: "" };
    if (c.expect.kind === "edit_food") {
      const edits = t2.proposals.filter((p) => p.kind === "edit_food");
      if (!edits.length) rec.note = `no edit_food card (got ${rec.turn2Cards.join(",") || "text only"}); reply: ${t2.reply.slice(0, 80)}`;
      else if (c.expect.setCalories != null) {
        rec.pass = edits.some((e) => Number(e.data?.set?.calories) === c.expect.setCalories);
        rec.note = `set.calories = ${edits.map((e) => e.data?.set?.calories).join(",")}`;
      } else if (c.expect.totalKcal) {
        // the lunch total implied by the edits: every edited row's new kcal, plus turn-1 rows left untouched
        const items = card?.data?.items ?? [];
        const total1 = items.reduce((a, it) => a + (Number(it.calories) || 0), 0);
        const newKcal = edits.map((e) => Number(e.data?.set?.calories)).filter(Number.isFinite);
        const editSum = newKcal.reduce((a, b) => a + b, 0);
        // we cannot map ids to turn-1 items without reading rows back, so accept either reading:
        // all rows edited (editSum alone) or one row edited (the other's turn-1 kcal carried over)
        const oneRowCarried = items.length === 2 && newKcal.length === 1 ? Math.min(...items.map((it) => editSum + (Number(it.calories) || 0))) : null;
        rec.pass = inRange(editSum, c.expect.totalKcal) || (oneRowCarried != null && inRange(oneRowCarried, c.expect.totalKcal));
        rec.note = `edits → ${newKcal.join("+")} kcal (turn-1 total ${Math.round(total1)})`;
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

/**
 * Builds the summary. Everything here is derived from the raw per-utterance
 * records, so `--resummarize <json>` can re-emit the tables for an old run
 * when the metrics change (they did after the first review: twins became the
 * primary consistency metric and ×3 the labelled noise floor).
 */
function summarize(scores, runs, meta, labels, probes, corrections, usage) {
  // Alcohol has 7 kcal/g that 4P+4C+9F cannot see: an item that names a
  // drink is exempt from the arithmetic check and counted separately.
  for (const s of scores.concat(runs)) {
    for (const i of s.perItem ?? []) i.alcohol = ALCOHOL_RE.test(i.desc ?? "");
    const checkable = (s.perItem ?? []).filter((i) => !i.alcohol);
    s.hasAlcohol = (s.perItem ?? []).some((i) => i.alcohol);
    // headline arithmetic check: every non-alcohol item on the card agrees with its own kcal
    s.itemsSane = checkable.length > 0 ? checkable.every((i) => i.sane) : null;
  }
  const ok = scores.filter((s) => !s.error && s.items > 0);
  const groups = [...new Set(FIXTURES.map((f) => f.group))];
  const byGroup = (g) => ok.filter((s) => s.group === g);
  const rate = (xs, f) => pct(xs.filter(f).length, xs.length);
  const groupRows = [...groups.map((g) => [g, byGroup(g)]), ["ALL", ok]].filter(([, xs]) => xs.length).map(([g, xs]) => ({
    group: g, n: xs.length,
    itemsOk: rate(xs, (s) => s.itemsOk), kcal: rate(xs, (s) => s.inRange.kcal), protein: rate(xs, (s) => s.inRange.proteinG), carbs: rate(xs, (s) => s.inRange.carbsG), fat: rate(xs, (s) => s.inRange.fatG),
    allFour: rate(xs, (s) => s.inRange.kcal && s.inRange.proteinG && s.inRange.carbsG && s.inRange.fatG),
    medAbsKcalErr: r1(median(xs.map((s) => Math.abs(s.errPct.kcal)))), medKcalBias: r1(median(xs.map((s) => s.errPct.kcal))),
    macroSane: (() => { const t = xs.filter((s) => s.itemsSane !== null); return t.length ? pct(t.filter((s) => s.itemsSane).length, t.length) : null; })(),
    mealOk: rate(xs, (s) => s.mealOk),
    timeOk: (() => { const t = xs.filter((s) => s.timeOk !== null && s.timeOk !== undefined); return t.length ? pct(t.filter((s) => s.timeOk).length, t.length) : null; })(),
    usualOk: (() => { const t = xs.filter((s) => s.usualOk !== null); return t.length ? pct(t.filter((s) => s.usualOk).length, t.length) : null; })(),
    medMs: median(xs.map((s) => s.ms)),
  }));

  // ── Consistency, primary: PAIRED TWINS — same food and stated portion,
  // different phrasing (dictated transcripts and paraphrases). This is the
  // variation he actually meets; the pairs come from the fixture file.
  const byId = Object.fromEntries(ok.map((s) => [s.id, s]));
  const pairs = FIXTURES.filter((f) => f.twinOf && byId[f.id] && byId[f.twinOf]).map((f) => {
    const a = byId[f.id], b = byId[f.twinOf];
    const mean = (a.totals.kcal + b.totals.kcal) / 2;
    return {
      id: f.id, twinOf: f.twinOf, kind: f.group === "transcript" ? "transcript" : "paraphrase",
      kcalA: a.totals.kcal, kcalB: b.totals.kcal, spreadKcal: Math.abs(a.totals.kcal - b.totals.kcal),
      spreadPct: mean ? r1((Math.abs(a.totals.kcal - b.totals.kcal) / mean) * 100) : null,
      bothInRange: Boolean(a.inRange.kcal && b.inRange.kcal), itemsAgree: a.items === b.items,
      aInRange: a.inRange.kcal, bInRange: b.inRange.kcal, aItemsOk: a.itemsOk, bItemsOk: b.itemsOk,
    };
  });
  const paired = {
    pairs, n: pairs.length,
    medianSpreadPct: r1(median(pairs.map((p) => p.spreadPct))), p90SpreadPct: r1(p90(pairs.map((p) => p.spreadPct))),
    shareSpreadUnder10: pct(pairs.filter((p) => p.spreadPct <= 10).length, pairs.length),
    shareSpreadUnder20: pct(pairs.filter((p) => p.spreadPct <= 20).length, pairs.length),
    shareBothInRange: pct(pairs.filter((p) => p.bothInRange).length, pairs.length),
    shareItemsAgree: pct(pairs.filter((p) => p.itemsAgree).length, pairs.length),
  };

  // ── Consistency, secondary: the SAMPLING NOISE FLOOR — the same text
  // three times. He never sends the same text twice (3 % exact repeats), so
  // this only says how much of a twin's spread is the model's own dice.
  const cons = [];
  for (const id of CONSISTENCY_IDS) {
    const xs = runs.filter((r) => r.id === id && !r.error && r.items > 0);
    if (xs.length < 2) continue;
    const kc = xs.map((r) => r.totals.kcal);
    const ref = refFor(FIXTURES.find((f) => f.id === id));
    cons.push({ id, runs: xs.length, kcal: kc, cv: r1((cv(kc) ?? 0) * 100), allInRange: kc.every((k) => inRange(k, ref.kcal)), spreadKcal: Math.max(...kc) - Math.min(...kc) });
  }
  const noiseFloor = { fixtures: cons, medianCvPct: r1(median(cons.map((c) => c.cv))), p90CvPct: r1(p90(cons.map((c) => c.cv))), shareAllInRange: pct(cons.filter((c) => c.allInRange).length, cons.length), shareCvUnder10: pct(cons.filter((c) => c.cv <= 10).length, cons.length) };

  // ── D2 evidence: when an item's kcal and its 4P+4C+9F disagree, which is
  // closer to the reference? Only single-item utterances have an item-level
  // reference; alcohol items are excluded (7 kcal/g).
  const single = ok.filter((s) => s.items === 1 && !s.hasAlcohol);
  const mismatched = single.filter((s) => !s.perItem[0].sane);
  const d2 = {
    singleItemUtterances: single.length,
    mismatched: mismatched.length,
    kcalCloser: mismatched.filter((s) => Math.abs(s.totals.kcal - s.ref.kcal) < Math.abs(s.perItem[0].macroKcal - s.ref.kcal)).length,
    macroCloser: mismatched.filter((s) => Math.abs(s.perItem[0].macroKcal - s.ref.kcal) < Math.abs(s.totals.kcal - s.ref.kcal)).length,
    kcalInRange: mismatched.filter((s) => s.inRange.kcal).length,
    macroInRange: mismatched.filter((s) => s.macroKcalInRange).length,
    rows: mismatched.map((s) => ({ id: s.id, desc: s.perItem[0].desc, kcal: s.totals.kcal, macroKcal: s.perItem[0].macroKcal, ref: s.ref.kcal, closer: Math.abs(s.totals.kcal - s.ref.kcal) <= Math.abs(s.perItem[0].macroKcal - s.ref.kcal) ? "kcal" : "macros" })),
    allUtterances: { medAbsKcalErr: r1(median(ok.map((s) => Math.abs(s.errPct.kcal)))), medAbsMacroKcalErr: r1(median(ok.filter((s) => !s.hasAlcohol).map((s) => Math.abs(s.macroKcalErrPct)))) },
    itemsChecked: ok.flatMap((s) => s.perItem).filter((i) => !i.alcohol).length,
    itemsMismatched: ok.flatMap((s) => s.perItem).filter((i) => !i.alcohol && !i.sane).length,
    alcoholItems: ok.flatMap((s) => s.perItem).filter((i) => i.alcohol).length,
  };
  d2.itemsMismatchedShare = pct(d2.itemsMismatched, d2.itemsChecked);

  const errors = scores.filter((s) => s.error || s.items === 0).map((s) => ({ id: s.id, error: s.error, cards: s.cardCount, reply: s.reply }));
  const chatUsage = usage.chat ?? { calls: 0, input: 0, output: 0, usd: 0 };
  const cost = {
    chatCalls: chatUsage.calls, meanInputTokens: chatUsage.calls ? Math.round(chatUsage.input / chatUsage.calls) : null, meanOutputTokens: chatUsage.calls ? Math.round(chatUsage.output / chatUsage.calls) : null,
    usdPerChatCall: chatUsage.calls ? Math.round((chatUsage.usd / chatUsage.calls) * 10000) / 10000 : null, totalUsd: Math.round(Object.values(usage).reduce((a, u) => a + Number(u.usd), 0) * 1000) / 1000,
    bySurface: Object.fromEntries(Object.entries(usage).map(([k, u]) => [k, { calls: u.calls, input: u.input, output: u.output, usd: Math.round(Number(u.usd) * 1000) / 1000 }])),
    latencyMs: { median: median(ok.map((s) => s.ms)), p90: p90(ok.map((s) => s.ms)) },
    utterancesWithAReadFirst: pct(ok.filter((s) => s.tools > 0).length, ok.length),
  };

  const summary = { meta, groups: groupRows, paired, noiseFloor, d2, labels, probes, corrections, cost, usage, errors, scores, runs };

  const md = [];
  md.push(`# Food eval — ${meta.tag ?? "run"} · ${meta.startedAt}`);
  md.push(`Model \`${meta.model}\` · reasoning \`${meta.reasoning}\` · temperature ${meta.temperature} · commit \`${meta.commit}\` · run clock ${meta.localDay} ${meta.localHour}h ${TZ} · ${meta.fixtureCount} utterances · synthetic fixtures only${meta.complete === false ? ' · **PARTIAL RUN — written mid-way**' : ''}${meta.stageErrors && Object.keys(meta.stageErrors).length ? ` · stage errors: ${Object.entries(meta.stageErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}` : ''}${meta.resummarizedAt ? ` · tables regenerated ${meta.resummarizedAt}` : ''}`);
  md.push("");
  md.push("## Cost per call (every row below was paid for at these rates)");
  md.push(tbl(["chat calls", "mean input tokens / call", "mean output tokens / call", "$ per chat call", "run total $", "median ms to card", "p90 ms", "utterances that read data first"], [[cost.chatCalls, cost.meanInputTokens ?? "—", cost.meanOutputTokens ?? "—", cost.usdPerChatCall ?? "—", cost.totalUsd, cost.latencyMs.median ?? "—", cost.latencyMs.p90 ?? "—", fmtPct(cost.utterancesWithAReadFirst)]]));
  md.push("");
  md.push("## Accuracy by group (totals per utterance vs the reference band)");
  md.push(tbl(["group", "n", "items split ok", "kcal in band", "P", "C", "F", "all four", "median |kcal err|", "median kcal bias", "items: macros≈kcal", "meal type", "time", "usual", "median ms"],
    groupRows.map((g) => [g.group, g.n, fmtPct(g.itemsOk), fmtPct(g.kcal), fmtPct(g.protein), fmtPct(g.carbs), fmtPct(g.fat), fmtPct(g.allFour), fmtPct(g.medAbsKcalErr), g.medKcalBias == null ? "—" : `${g.medKcalBias > 0 ? "+" : ""}${g.medKcalBias} %`, fmtPct(g.macroSane), fmtPct(g.mealOk), fmtPct(g.timeOk), fmtPct(g.usualOk), g.medMs ?? "—"])));
  md.push("");
  md.push("## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)");
  md.push(`${paired.n} pairs · median kcal spread **${paired.medianSpreadPct ?? "—"} %**, p90 ${paired.p90SpreadPct ?? "—"} % · spread ≤ 10 % on ${fmtPct(paired.shareSpreadUnder10)}, ≤ 20 % on ${fmtPct(paired.shareSpreadUnder20)} · both in band on **${fmtPct(paired.shareBothInRange)}** · same item count on ${fmtPct(paired.shareItemsAgree)}`);
  md.push("");
  md.push(tbl(["pair", "kind", "kcal (twin / clean)", "spread", "spread %", "both in band", "items agree"], pairs.map((p) => [`${p.id} ↔ ${p.twinOf}`, p.kind, `${p.kcalA} / ${p.kcalB}`, p.spreadKcal, `${p.spreadPct} %`, yn(p.bothInRange), yn(p.itemsAgree)])));
  md.push("");
  md.push(`## Consistency — NOISE FLOOR: the same text ${meta.repeat} times (sampling only; he never sends the same text twice)`);
  md.push(`Median CV **${noiseFloor.medianCvPct ?? "—"} %**, p90 ${noiseFloor.p90CvPct ?? "—"} % · CV ≤ 10 % on ${fmtPct(noiseFloor.shareCvUnder10)} · all ${meta.repeat} runs in band on ${fmtPct(noiseFloor.shareAllInRange)}`);
  md.push("");
  md.push(tbl(["id", "runs", "kcal per run", "spread", "CV", "all in band"], cons.map((c) => [c.id, c.runs, c.kcal.join(" / "), c.spreadKcal, `${c.cv} %`, yn(c.allInRange)])));
  md.push("");
  md.push("## When an item's calories and macros disagree (> 15 %), which side is right? (D2 evidence)");
  md.push(`Checked ${d2.itemsChecked} items (${d2.alcoholItems} alcohol items exempt — 4P+4C+9F cannot see 7 kcal/g): **${fmtPct(d2.itemsMismatchedShare)} disagree**. Among single-item utterances (${d2.singleItemUtterances}, the only ones with an item-level reference) ${d2.mismatched} disagree: the kcal side was closer on ${d2.kcalCloser}, the macro side on ${d2.macroCloser}; kcal in band on ${d2.kcalInRange}, macro-kcal in band on ${d2.macroInRange}. Over every utterance the median |error| is ${fmtPct(d2.allUtterances.medAbsKcalErr)} for kcal and ${fmtPct(d2.allUtterances.medAbsMacroKcalErr)} for 4P+4C+9F.`);
  md.push("");
  if (d2.rows.length) md.push(tbl(["id", "item", "kcal", "4P+4C+9F", "reference", "closer"], d2.rows.map((r) => [r.id, cell(r.desc), r.kcal, r.macroKcal, r.ref, r.closer])) + "\n");
  if (labels) {
    md.push("## Label reader (`/api/health/food/scan-label`) — synthetic panels, exact match per field");
    md.push(tbl(["label", "lang", "res", "confident", "product", "serving", "servings/container", "kcal", "P", "C", "F", "ms"], labels.scan.map((l) => [l.id, l.lang, l.res, yn(l.confident), yn(l.productOk), yn(l.servingOk), yn(l.servingsOk), yn(l.kcalOk), yn(l.proteinOk), yn(l.carbsOk), yn(l.fatOk), l.ms])));
    md.push("");
    md.push("## Label through the chat with a servings multiplier");
    md.push(tbl(["id", "label", "×", "cards", "items", "got kcal/P/C/F", "want", "scaled ok (±8 %)", "ms"], labels.chat.map((c) => [c.id, c.label, c.multiplier, c.cards.join(",") || "none", c.items, `${c.got.kcal}/${c.got.proteinG}/${c.got.carbsG}/${c.got.fatG}`, `${c.want.kcal}/${c.want.proteinG}/${c.want.carbsG}/${c.want.fatG}`, yn(c.scaledOk), c.ms])));
    md.push("");
  }
  if (probes) {
    md.push("## Photo path — failure modes (no meal photos were downloaded; D6)");
    md.push(tbl(["probe", "image", "cards", "invented a meal?", "honest", "reply (start)", "ms"], probes.map((p) => [p.id, p.what, p.cards.join(",") || "none", yn(p.inventedFood), yn(p.honest), cell(p.reply), p.ms])));
    md.push("");
  }
  if (corrections) {
    md.push("## Corrections (two turns)");
    md.push(tbl(["id", "turn 1", "saved?", "turn 2", "turn-2 cards", "pass", "note"], corrections.map((c) => [c.id, c.first, yn(c.confirmed), c.second, c.turn2Cards.join(",") || "text only", yn(c.pass), cell(c.note)])));
    md.push("");
  }
  if (errors.length) {
    md.push("## Utterances with no food card or an error");
    md.push(tbl(["id", "error", "cards", "reply (start)"], errors.map((e) => [e.id, e.error ?? "—", e.cards, cell(e.reply)])));
    md.push("");
  }
  md.push("## Every utterance");
  md.push(tbl(["id", "group", "items", "kcal got/ref", "P", "C", "F", "kcal in band", "items: macros≈kcal", "meal got/exp", "time ok", "ms"],
    scores.map((s) => [s.id, s.group, `${s.items}`, `${s.totals.kcal}/${s.ref.kcal}`, `${s.totals.proteinG}/${s.ref.proteinG}`, `${s.totals.carbsG}/${s.ref.carbsG}`, `${s.totals.fatG}/${s.ref.fatG}`, s.inRange ? yn(s.inRange.kcal) : "—", s.itemsSane === null ? (s.hasAlcohol ? "alcohol" : "—") : yn(s.itemsSane), s.mealGot ? `${s.mealGot}/${s.mealExpected}` : "—", s.timeOk === null || s.timeOk === undefined ? "—" : yn(s.timeOk), s.ms])));
  return { summary, md: md.join("\n") + "\n" };
}

// ─── main ────────────────────────────────────────────────────────────────
async function resummarize(file) {
  const prior = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
  const meta = { ...prior.meta, tag: TAG ?? prior.meta.tag, resummarizedAt: nowIso() };
  const usage = prior.usage ?? await sql(
    `select surface, count(*)::int as calls, coalesce(sum("inputTokens"),0)::int as input, coalesce(sum("outputTokens"),0)::int as output, coalesce(sum("costUsd"),0)::float as usd
       from ai_usage_events where "createdAt" >= $1::timestamp and "createdAt" <= $2::timestamp and surface = any($3) group by surface`,
    [meta.startedAt, meta.finishedAt ?? nowIso(), ["chat", "chat-title", "photo"]]
  ).then((r) => Object.fromEntries(r.rows.map((row) => [row.surface, row])));
  const { summary, md } = summarize(prior.scores, prior.runs ?? [], meta, prior.labels ?? null, prior.probes ?? null, prior.corrections ?? null, usage);
  fs.writeFileSync(path.join(OUT_DIR, "last-run.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "last-run.md"), md);
  if (meta.tag) { fs.writeFileSync(path.join(OUT_DIR, `${meta.tag}.json`), JSON.stringify(summary, null, 2)); fs.writeFileSync(path.join(OUT_DIR, `${meta.tag}.md`), md); }
  console.log(`[food-eval] re-summarized ${file} → last-run.{json,md}${meta.tag ? ` and ${meta.tag}.{json,md}` : ""}`);
  console.log(`[food-eval] paired twins: ${summary.paired.n} pairs · median spread ${summary.paired.medianSpreadPct} % · both in band ${summary.paired.shareBothInRange} % · noise floor median CV ${summary.noiseFloor.medianCvPct} %`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "reference.md"), referenceMarkdown());
  if (RESUMMARIZE) { await resummarize(RESUMMARIZE); await pool.end(); return; }

  let fixtures = FIXTURES.filter((f) => !ONLY || ONLY.some((g) => f.id.startsWith(g) || f.group === g));
  if (Number.isFinite(LIMIT)) fixtures = fixtures.slice(0, LIMIT);
  const consistencyIds = REPEAT > 1 ? CONSISTENCY_IDS.filter((id) => fixtures.some((f) => f.id === id)) : [];

  // validate references before spending anything
  for (const f of FIXTURES) { const ref = refFor(f); if (!ref.point || !(ref.kcal[1] > ref.kcal[0])) throw new Error(`bad reference for ${f.id}`); }
  for (const key of new Set(FIXTURES.flatMap((f) => (f.parts ?? []).map((p) => p[0])))) if (!FOODS[key]) throw new Error(`fixture uses unknown food ${key}`);

  const startedAt = nowIso();
  const runLocal = localParts(new Date());
  let commit = "unknown"; try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* fine */ }
  const meta = { tag: TAG, startedAt, localDay: runLocal.day, localHour: runLocal.hour, timeZone: TZ, model: process.env.OPENAI_MODEL || ENV.OPENAI_MODEL || "gpt-5.6-terra", reasoning: "low", temperature: "not set by the route (API default)", commit, base: BASE, fixtureCount: fixtures.length, consistencyCount: consistencyIds.length, repeat: REPEAT, concurrency: CONCURRENCY, synthetic: true };
  console.log(`[food-eval] ${fixtures.length} utterances · ${consistencyIds.length} × ${REPEAT} consistency · model ${meta.model} · ${runLocal.day} ${runLocal.hour}h ${TZ}${DRY ? " · DRY RUN" : ""}`);
  if (DRY) {
    for (const f of fixtures) { const ref = refFor(f); console.log(`  ${f.id} ${f.group.padEnd(11)} ref ${ref.point.kcal} kcal [${Math.round(ref.kcal[0])}–${Math.round(ref.kcal[1])}] P${ref.point.proteinG} C${ref.point.carbsG} F${ref.point.fatG}  "${f.text}"`); }
    await pool.end();
    return;
  }

  await login();
  await seed();
  console.log(`[seed] usual ${created.favoriteIds.length} · history rows ${created.foodIds.length}`);

  // Written after EVERY stage, so a dev server that dies mid-run (it did,
  // 2026-10-17, at the first label scan) cannot take the earlier calls with it.
  let scores = [], runs = [], corrections = null, labels = null, probes = null;
  const stageErrors = {};
  const persist = async (final = false) => {
    const usage = await usageSince(startedAt, ["chat", "chat-title", "photo"]).catch(() => ({}));
    const { summary, md } = summarize(scores, runs, { ...meta, finishedAt: nowIso(), complete: final, stageErrors }, labels, probes, corrections, usage);
    fs.writeFileSync(path.join(OUT_DIR, "last-run.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "last-run.md"), md);
    if (TAG && final) { fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(summary, null, 2)); fs.writeFileSync(path.join(OUT_DIR, `${TAG}.md`), md); }
    return summary;
  };
  const stage = async (name, fn) => {
    try { return await fn(); } catch (e) { stageErrors[name] = String(e?.message ?? e); console.error(`[food-eval] stage ${name} failed: ${stageErrors[name]}`); return null; }
  };

  try {
    // main pass
    const tasks = fixtures.map((f) => async () => {
      const r = await streamChat({ message: f.text });
      const s = score(f, r, runLocal);
      process.stdout.write(`  ${f.id} ${s.error ? `ERROR ${s.error}` : `${s.items} items · ${s.totals.kcal} kcal (ref ${s.ref.kcal}) ${s.inRange?.kcal ? "✓" : "✗"} · ${s.ms} ms`}\n`);
      return s;
    });
    scores = await runPool(tasks, CONCURRENCY);
    await persist();
    // consistency repeats
    runs = [...scores.filter((s) => consistencyIds.includes(s.id))];
    for (let k = 1; k < REPEAT; k++) {
      const more = await runPool(consistencyIds.map((id) => async () => {
        const f = FIXTURES.find((x) => x.id === id);
        const r = await streamChat({ message: f.text });
        const s = score(f, r, runLocal);
        process.stdout.write(`  ${f.id} run ${k + 1}: ${s.items} items · ${s.totals.kcal} kcal · ${s.ms} ms\n`);
        return s;
      }), CONCURRENCY);
      runs.push(...more);
      await persist();
    }
    if (!SKIP_CORRECTIONS) { corrections = await stage("corrections", runCorrections); await persist(); }
    if (!SKIP_LABELS) { labels = await stage("labels", runLabels); await persist(); }
    if (!SKIP_PHOTOS) { probes = await stage("photos", runPhotoProbes); await persist(); }
    const summary = await persist(true);
    const all = summary.groups.at(-1);
    console.log(`\n[food-eval] wrote ${path.relative(ROOT, OUT_DIR)}/last-run.{json,md}${TAG ? ` and ${TAG}.{json,md}` : ""} · chat calls ${summary.cost.chatCalls} · $${summary.cost.totalUsd}${Object.keys(stageErrors).length ? ` · STAGE ERRORS: ${JSON.stringify(stageErrors)}` : ""}`);
    if (all) console.log(`[food-eval] ALL: kcal in band ${all.kcal} % · all four ${all.allFour} % · items macros≈kcal ${all.macroSane} % · twins median spread ${summary.paired.medianSpreadPct} % (both in band ${summary.paired.shareBothInRange} %) · noise floor median CV ${summary.noiseFloor.medianCvPct} %`);
  } finally {
    if (browserPromise) { try { (await browserPromise).close(); } catch { /* fine */ } }
    await cleanup(startedAt);
    await pool.end();
  }
}

main().catch(async (e) => { console.error(e); try { if (browserPromise) (await browserPromise).close(); } catch { /* fine */ } try { await pool.end(); } catch { /* fine */ } process.exit(1); });
