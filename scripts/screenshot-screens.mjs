#!/usr/bin/env node
// Screen audit screenshots (lane C, 2026-10-17).
//
// Drives a running dev server with Playwright's Chromium and captures every
// page route in three modes — phone light, phone dark, desktop light (add
// desktop-dark with --modes) — one PNG per route per mode, plus a manifest
// the audit table is generated from.
//
//   node scripts/screenshot-screens.mjs \
//     --base http://localhost:3103 --pin 2468 --out docs/design/screen-audit
//
// Flags: --modes phone-light,phone-dark,desktop-light,desktop-dark
//        --only slug,slug   (route slugs; see ROUTES)
//        --dsf 1            (device scale factor; 1 keeps the set small)
//        --max-height 4400  (tall pages are clipped to this many CSS px)
//
// Dark mode: the app defines `.dark` tokens in app/globals.css but, as of
// this audit, nothing toggles the class (Settings → Appearance reads
// "Night — next build"). The dark shots therefore FORCE `.dark` on <html>
// and emulate prefers-color-scheme: dark (the Body screen follows the
// system) — they show what the existing dark tokens produce, which is the
// honest input for the dark-mode findings.
//
// Reduced motion is emulated so every capture is the settled end state.
// Never point this at production.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

// Captures over this size are re-encoded as a 256-colour palette PNG so the
// committed set stays small (each ≤ ~300 KB). Text survives quantisation;
// smaller captures stay lossless.
const MAX_BYTES = 280 * 1024;
async function shrink(abs) {
  if (statSync(abs).size <= MAX_BYTES) return;
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return; // sharp is optional — leave the file as captured
  }
  const buf = await sharp(abs).png({ palette: true, colours: 256, quality: 90, effort: 8, compressionLevel: 9 }).toBuffer();
  writeFileSync(abs, buf);
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, [])
);
const BASE = (args.base ?? "http://localhost:3103").replace(/\/$/, "");
const PIN = args.pin ?? process.env.APP_PIN ?? "";
const OUT = args.out ?? "docs/design/screen-audit";
const DSF = Number(args.dsf ?? 1);
const MAX_H = Number(args["max-height"] ?? 4400);
const MODES = (args.modes ?? "phone-light,phone-dark,desktop-light").split(",");
const ONLY = args.only ? new Set(args.only.split(",")) : null;

if (/vercel\.app|https:\/\//.test(BASE)) {
  console.error("Refusing a non-local base URL — this script drives a local dev server only.");
  process.exit(1);
}

// Every page route under app/ (listed from the filesystem, 2026-10-17),
// grouped the way the audit groups them. `resolve` fills a dynamic segment
// from the API; `query` adds the params a page needs to show its real face.
export const ROUTES = [
  // Today + chat
  { slug: "dashboard", path: "/dashboard", group: "Today" },
  { slug: "chat", path: "/chat", group: "Today" },
  { slug: "journal", path: "/journal", group: "Today" },
  { slug: "todos", path: "/todos", group: "Today" },
  { slug: "actions", path: "/actions", group: "Today" },
  // Train
  { slug: "health-workouts", path: "/health/workouts", group: "Train" },
  { slug: "health-workouts-activities", path: "/health/workouts/activities", group: "Train" },
  { slug: "health-workouts-activities-id", path: "/health/workouts/activities/:id", group: "Train", resolve: "activity" },
  { slug: "health-workouts-plan", path: "/health/workouts/plan", group: "Train" },
  { slug: "health-workouts-routines", path: "/health/workouts/routines", group: "Train" },
  { slug: "health-activity", path: "/health/activity", group: "Train" },
  { slug: "health-progress", path: "/health/progress", group: "Train" },
  { slug: "health-report", path: "/health/report", group: "Train" },
  { slug: "health-recovery", path: "/health/recovery", group: "Train" },
  { slug: "health-coach", path: "/health/coach", group: "Train" },
  { slug: "health-outcomes", path: "/health/outcomes", group: "Train" },
  { slug: "health-automations", path: "/health/automations", group: "Train" },
  { slug: "health-command-center", path: "/health/command-center", group: "Train" },
  // Body
  { slug: "health-body", path: "/health/body", group: "Body" },
  { slug: "health-body-metric", path: "/health/body/metric", query: "m=weightKg", group: "Body" },
  // Food
  { slug: "health-food", path: "/health/food", group: "Food" },
  { slug: "health-food-history", path: "/health/food/history", group: "Food" },
  { slug: "health-water", path: "/health/water", group: "Food" },
  // Trends
  { slug: "trends", path: "/trends", group: "Trends" },
  { slug: "trends-weekly-report", path: "/trends", query: "tab=weekly-report", group: "Trends" },
  { slug: "trends-daily-log", path: "/trends/daily-log", group: "Trends" },
  // Settings
  { slug: "settings", path: "/settings", group: "Settings" },
  { slug: "settings-notifications", path: "/settings/notifications", group: "Settings" },
  { slug: "settings-claude", path: "/settings/claude", group: "Settings" },
  { slug: "settings-export", path: "/settings/export", group: "Settings" },
  { slug: "settings-import", path: "/settings/import", group: "Settings" },
  // Spirit (phone)
  { slug: "spirit", path: "/spirit", group: "Spirit" },
  { slug: "spirit-study", path: "/spirit/study", group: "Spirit" },
  { slug: "spirit-read", path: "/spirit/read", group: "Spirit" },
  { slug: "spirit-bible", path: "/spirit/bible", group: "Spirit" },
  { slug: "spirit-term", path: "/spirit/term", group: "Spirit" },
  { slug: "spirit-term-start", path: "/spirit/term/start", group: "Spirit" },
  { slug: "spirit-notebook", path: "/spirit/notebook", group: "Spirit" },
  { slug: "spirit-notebook-page-id", path: "/spirit/notebook/page/:id", group: "Spirit", resolve: "inkPage" },
  { slug: "spirit-memory", path: "/spirit/memory", group: "Spirit" },
  { slug: "spirit-church", path: "/spirit/church", group: "Spirit" },
  { slug: "spirit-library", path: "/spirit/library", group: "Spirit" },
  { slug: "spirit-track2", path: "/spirit/track2", group: "Spirit" },
  { slug: "spirit-transcript", path: "/spirit/transcript", group: "Spirit" },
  { slug: "spirit-settings", path: "/spirit/settings", group: "Spirit" },
  // Desk (iPad, full-bleed)
  { slug: "desk-home", path: "/home", group: "Desk" },
  { slug: "desk-spirit-desk", path: "/spirit/desk", query: "ctx=study", group: "Desk" },
  { slug: "desk-spirit-notebooks", path: "/spirit/notebooks", group: "Desk" },
  { slug: "desk-spirit-recordings", path: "/spirit/recordings", group: "Desk" },
  { slug: "desk-spirit-hymns", path: "/spirit/hymns", group: "Desk" },
  { slug: "desk-spirit-desk-settings", path: "/spirit/desk-settings", group: "Desk" },
  // Finance
  { slug: "finances", path: "/finances", group: "Finance" },
  { slug: "finances-transactions", path: "/finances/transactions", group: "Finance" },
  { slug: "finances-budget", path: "/finances/budget", group: "Finance" },
  { slug: "finances-goals", path: "/finances/goals", group: "Finance" },
  { slug: "finances-pockets", path: "/finances/pockets", group: "Finance" },
  { slug: "finances-obligations", path: "/finances/obligations", group: "Finance" },
  { slug: "finances-inbox", path: "/finances/inbox", group: "Finance" },
  { slug: "finances-sources", path: "/finances/sources", group: "Finance" },
  { slug: "finances-merchants", path: "/finances/merchants", group: "Finance" },
  { slug: "finances-reports", path: "/finances/reports", group: "Finance" },
  { slug: "finances-import", path: "/finances/import", group: "Finance" },
  // Auth surfaces
  { slug: "pin-gate", path: "/dashboard", group: "Auth", unauthenticated: true },
  {
    slug: "oauth-authorize",
    path: "/oauth/authorize",
    query: "client_id=demo-client&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=audit&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
    group: "Auth",
  },
  // Redirect-only routes, recorded for completeness
  { slug: "root", path: "/", group: "Redirect", redirect: "/dashboard" },
  { slug: "health", path: "/health", group: "Redirect", redirect: "/dashboard" },
];

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

async function resolveIds(request) {
  const ids = {};
  try {
    const r = await request.get(`${BASE}/api/health/workouts/activities?limit=1`);
    const j = await r.json();
    ids.activity = j?.items?.[0]?.id ?? null;
  } catch {
    ids.activity = null;
  }
  try {
    const r = await request.get(`${BASE}/api/spirit/ink`);
    const j = await r.json();
    const find = (v) => {
      if (!v || typeof v !== "object") return null;
      if (Array.isArray(v)) {
        for (const x of v) {
          const f = find(x);
          if (f) return f;
        }
        return null;
      }
      if (typeof v.id === "string" && typeof v.kind === "string" && "title" in v) return v.id;
      for (const k of Object.keys(v)) {
        const f = find(v[k]);
        if (f) return f;
      }
      return null;
    };
    ids.inkPage = find(j);
  } catch {
    ids.inkPage = null;
  }
  return ids;
}

function urlFor(route, ids) {
  let path = route.path;
  if (route.resolve) {
    const id = ids[route.resolve];
    if (!id) return null;
    path = path.replace(":id", encodeURIComponent(id));
  }
  return `${BASE}${path}${route.query ? `?${route.query}` : ""}`;
}

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 12_000 });
  } catch {
    // maps and streams never go idle — take the settled frame anyway
  }
  await page.waitForTimeout(1_000);
}

async function capture(context, route, mode, ids, outDir) {
  const [device, scheme] = mode.split("-");
  const url = urlFor(route, ids);
  const entry = { slug: route.slug, path: route.path, query: route.query ?? null, group: route.group, mode, url, file: null, bytes: 0, width: VIEWPORTS[device].width, height: 0, scrollHeight: 0, title: "", errors: [], note: route.redirect ? `redirects to ${route.redirect}` : null };
  if (!url) {
    entry.note = `no ${route.resolve} id available`;
    return entry;
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => entry.errors.push(String(e.message ?? e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") entry.errors.push(m.text().slice(0, 200));
  });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    if (scheme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
    // Next's dev indicator / issue badge is not part of the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
    await settle(page);
    const scrollHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const height = Math.max(VIEWPORTS[device].height, Math.min(scrollHeight, MAX_H));
    await page.setViewportSize({ width: VIEWPORTS[device].width, height });
    await page.waitForTimeout(400);
    entry.title = await page.title();
    entry.scrollHeight = scrollHeight;
    entry.height = height;
    entry.finalUrl = page.url().replace(BASE, "");
    const file = `${route.slug}--${mode}.png`;
    const abs = join(outDir, file);
    await page.screenshot({ path: abs, type: "png", fullPage: false, scale: "css" });
    await shrink(abs);
    entry.file = file;
    entry.bytes = statSync(abs).size;
  } catch (err) {
    entry.errors.push(`capture failed: ${String(err.message ?? err).slice(0, 200)}`);
  } finally {
    await page.close();
  }
  return entry;
}


// Merge into an existing manifest: a partial re-run (--only / --modes)
// replaces its own slug+mode entries and keeps the rest. Written after every
// capture, so a server that dies mid-run loses nothing already taken.
function writeManifest(manifest) {
  const manifestPath = join(OUT, "manifest.json");
  let entries = manifest;
  if (existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
      const fresh = new Set(manifest.map((e) => `${e.slug}|${e.mode}`));
      entries = [...(prev.entries ?? []).filter((e) => !fresh.has(`${e.slug}|${e.mode}`)), ...manifest];
    } catch {
      // unreadable manifest — start over
    }
  }
  const order = new Map(ROUTES.map((r, i) => [r.slug, i]));
  entries.sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999) || a.mode.localeCompare(b.mode));
  const total = entries.reduce((s, e) => s + e.bytes, 0);
  const modes = [...new Set(entries.map((e) => e.mode))];
  writeFileSync(manifestPath, JSON.stringify({ base: BASE, takenAt: new Date().toISOString(), modes, dsf: DSF, totalBytes: total, entries }, null, 2));
  return total;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // SwiftShader gives headless Chromium a WebGL2 context, which MapLibre
  // (trail and activity maps) needs; without it the map throws on mount.
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const manifest = [];
  let ids = {};

  for (const mode of MODES) {
    const [device, scheme] = mode.split("-");
    const makeContext = async () => {
      const context = await browser.newContext({
        viewport: VIEWPORTS[device],
        deviceScaleFactor: DSF,
        colorScheme: scheme === "dark" ? "dark" : "light",
        reducedMotion: "reduce",
        isMobile: device === "phone",
        hasTouch: device === "phone",
        locale: "en-US",
        timezoneId: "America/Bogota",
        userAgent:
          device === "phone"
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1 PitayaAudit"
            : undefined,
      });
      if (scheme === "dark") {
        // The init script can run before <html> exists; wait for it, and the
        // capture re-applies the class after load as a belt-and-braces step.
        await context.addInitScript(() => {
          const apply = () => document.documentElement && document.documentElement.classList.add("dark");
          if (!apply()) new MutationObserver((_, o) => apply() && o.disconnect()).observe(document, { childList: true });
        });
      }
      return context;
    };

    // authenticated context
    const context = await makeContext();
    if (PIN) {
      const r = await context.request.post(`${BASE}/api/auth`, { data: { pin: PIN } });
      if (!r.ok()) {
        console.error(`login failed (${r.status()}) — check --pin / APP_PIN`);
        process.exit(1);
      }
    }
    if (!Object.keys(ids).length) ids = await resolveIds(context.request);

    for (const route of ROUTES) {
      if (ONLY && !ONLY.has(route.slug)) continue;
      if (route.unauthenticated) {
        const fresh = await makeContext();
        const e = await capture(fresh, route, mode, ids, OUT);
        await fresh.close();
        manifest.push(e);
      } else {
        manifest.push(await capture(context, route, mode, ids, OUT));
      }
      writeManifest(manifest);
      const last = manifest[manifest.length - 1];
      console.log(`${mode.padEnd(14)} ${route.slug.padEnd(36)} ${last.file ? `${Math.round(last.bytes / 1024)} KB  h=${last.scrollHeight}` : "—"}${last.errors.length ? `  ⚠ ${last.errors.length}` : ""}`);
    }
    await context.close();
  }
  await browser.close();

  const total = writeManifest(manifest);
  console.log(`\n${manifest.filter((e) => e.file).length} captured this run · ${(total / 1024 / 1024).toFixed(1)} MB in the set → ${join(OUT, "manifest.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
