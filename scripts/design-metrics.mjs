#!/usr/bin/env node
// Design-debt metrics (lane C, 2026-10-17): the numbers behind the screen
// audit, and the counting half of the Phase-2 ratchet gate.
//
// Per file under app/, components/ and lib/ (.tsx, .ts, .css — not tests,
// not .d.ts), counts the things the design system is meant to retire:
//   hex        raw colour literals (#abc, #aabbcc, #aabbccdd)
//   palette    Tailwind palette colour classes (text-red-500, bg-teal-50,
//              border-blue-500/20 …) — the old identity; use the role tokens
//   arbText    arbitrary Tailwind type sizes (text-[12.5px])
//   inlineStyle style={{…}} blocks that set colour/type by hand
//   rawButton  <button> outside components/ui (should be the kit's Button)
//   rawField   <input>/<select>/<textarea> outside components/ui
//   lucide     names imported from lucide-react (designed surfaces use
//              components/pitaya-icons.tsx)
//   motion     transition-all, duration-N outside the standard, duration-[…],
//              and literal timings in transition/animation declarations
//              (inline styles, <style> blocks, CSS). Standard: 90 · 150 ·
//              220 ms (app/globals.css block 6, look-plan D2).
// app/globals.css is the token file: its hex values are the tokens, so it is
// exempt from hex and palette (its motion literals still count).
//
// Per route: the page file plus the components it imports directly from
// @/components (one level; components/ui is the kit and is not counted).
//
//   node scripts/design-metrics.mjs            # markdown table on stdout
//   node scripts/design-metrics.mjs --json out.json
//   node scripts/design-metrics.mjs --by-file  # every file, sorted by debt

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

export const STANDARD_DURATIONS = new Set(["90", "150", "220"]);
const STANDARD_MS = new Set([90, 150, 220]);

/** The counts the gate ratchets, in report order. */
export const METRIC_KEYS = ["hex", "palette", "arbText", "inlineStyle", "rawButton", "rawField", "lucide", "motion"];

export const TOKEN_FILE = "app/globals.css";

const PALETTE_HUES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";

const PATTERNS = {
  hex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  palette: new RegExp(
    `\\b(?:text|bg|border|ring|from|to|via|fill|stroke|outline|divide|decoration|accent|caret|placeholder|shadow)(?:-[trblxyse])?-(?:${PALETTE_HUES})-(?:50|[1-9]00|950)\\b`,
    "g"
  ),
  arbDuration: /\bduration-\[[^\]]+\]/g,
  timingDecl: /(?:transition|animation)(?:-?(?:duration|delay)|Duration|Delay)?\s*:\s*([^;}\n]*)/g,
  arbText: /\btext-\[[0-9.]+px\]/g,
  inlineStyle: /style=\{\{[^}]*\b(?:color|fontSize|background|backgroundColor|fontFamily|letterSpacing|fontWeight|borderColor)\b/g,
  rawButton: /<button\b/g,
  rawField: /<(?:input|select|textarea)\b/g,
  transitionAll: /\btransition-all\b/g,
  duration: /\bduration-(\d+)\b/g,
  lucideImport: /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g,
};

/** Strip comments so a `// was #fff` line is not counted as debt. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Literal times in a transition/animation value that are not the standard. */
function offStandardTimes(value) {
  let n = 0;
  for (const m of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
    const ms = m[2] === "s" ? Math.round(Number(m[1]) * 1000) : Number(m[1]);
    if (ms === 0) continue;
    if (!STANDARD_MS.has(ms)) n++;
  }
  return n;
}

export function scanSource(text, { isKit = false, isTokenFile = false } = {}) {
  const src = stripComments(text);
  const count = (re) => (src.match(re) ?? []).length;
  let motion = count(PATTERNS.transitionAll) + count(PATTERNS.arbDuration);
  for (const m of src.matchAll(PATTERNS.duration)) if (!STANDARD_DURATIONS.has(m[1])) motion++;
  for (const m of src.matchAll(PATTERNS.timingDecl)) motion += offStandardTimes(m[1]);
  let lucide = 0;
  for (const m of src.matchAll(PATTERNS.lucideImport)) {
    lucide += m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length;
  }
  return {
    hex: isTokenFile ? 0 : count(PATTERNS.hex),
    palette: isTokenFile ? 0 : count(PATTERNS.palette),
    arbText: count(PATTERNS.arbText),
    inlineStyle: count(PATTERNS.inlineStyle),
    rawButton: isKit ? 0 : count(PATTERNS.rawButton),
    rawField: isKit ? 0 : count(PATTERNS.rawField),
    lucide,
    motion,
    lines: src.split("\n").length,
  };
}

export function sumMetrics(list) {
  const out = { hex: 0, palette: 0, arbText: 0, inlineStyle: 0, rawButton: 0, rawField: 0, lucide: 0, motion: 0, lines: 0 };
  for (const m of list) for (const k of Object.keys(out)) out[k] += m[k] ?? 0;
  return out;
}

export function debtScore(m) {
  return METRIC_KEYS.reduce((n, k) => n + (m[k] ?? 0), 0);
}

/**
 * The ratchet's unit: debt may move freely between files of one family
 * (a rename, a split, an extracted component), never grow inside it.
 *   app/(tabs)/<section>/…  → app/(tabs)/<section>
 *   app/(desk)/…            → app/(desk)
 *   app/api/…               → app/api
 *   app/<file|dir>…         → app
 *   components/<dir>/…      → components/<dir>
 *   components/<file>       → components
 *   lib/…                   → lib
 */
export function familyOf(file) {
  const parts = file.split("/");
  if (parts[0] === "app") {
    if (parts[1] === "(tabs)" && parts.length > 3) return `app/(tabs)/${parts[2]}`;
    if (parts[1] === "(desk)") return "app/(desk)";
    if (parts[1] === "api") return "app/api";
    return "app";
  }
  if (parts[0] === "components") return parts.length > 2 ? `components/${parts[1]}` : "components";
  return parts[0];
}

function walk(dir, acc = [], test = /\.(tsx|ts|css)$/) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, acc, test);
    } else if (test.test(name) && !/\.d\.ts$|\.test\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

export function scanRepo(root = ROOT) {
  const files = ["app", "components", "lib"].flatMap((d) => {
    try {
      return walk(join(root, d));
    } catch {
      return [];
    }
  });
  const byFile = {};
  for (const abs of files) {
    const rel = relative(root, abs).split("\\").join("/");
    byFile[rel] = scanSource(readFileSync(abs, "utf8"), {
      isKit: rel.startsWith("components/ui/"),
      isTokenFile: rel === TOKEN_FILE,
    });
  }
  return byFile;
}

/** Direct @/components imports of a file (one level), kit excluded. */
function directComponentImports(abs) {
  const src = readFileSync(abs, "utf8");
  const out = [];
  for (const m of src.matchAll(/from\s*"@\/components\/([^"]+)"/g)) {
    const spec = m[1];
    if (spec.startsWith("ui/")) continue;
    const candidates = [`components/${spec}.tsx`, `components/${spec}/index.tsx`];
    for (const c of candidates) {
      try {
        statSync(join(ROOT, c));
        out.push(c);
        break;
      } catch {
        // not a tsx module
      }
    }
  }
  return out;
}

export function scanRoutes(root = ROOT) {
  const byFile = scanRepo(root);
  const pages = walk(join(root, "app"), [], /^page\.tsx$/);
  const routes = [];
  for (const abs of pages) {
    const rel = relative(root, abs);
    const route = "/" + rel.replace(/^app\//, "").replace(/\/page\.tsx$/, "").replace(/\((tabs|desk)\)\/?/g, "").replace(/\/$/, "");
    const deps = directComponentImports(abs);
    const own = byFile[rel];
    const withDeps = sumMetrics([own, ...deps.map((d) => byFile[d]).filter(Boolean)]);
    routes.push({ route: route || "/", file: rel, deps, own, withDeps, score: debtScore(withDeps) });
  }
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return { byFile, routes };
}

function md(routes) {
  const head = "| Route | Lines | Hex | Palette | text-[px] | Inline style | Raw button | Raw field | lucide | Motion | Debt |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = routes.map((r) => {
    const m = r.withDeps;
    return `| \`${r.route}\` | ${m.lines} | ${m.hex} | ${m.palette} | ${m.arbText} | ${m.inlineStyle} | ${m.rawButton} | ${m.rawField} | ${m.lucide} | ${m.motion} | **${r.score}** |`;
  });
  return [head, ...rows].join("\n");
}

const isMain = process.argv[1] && /design-metrics\.mjs$/.test(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const { byFile, routes } = scanRoutes();
  const jsonAt = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
  if (jsonAt) {
    writeFileSync(jsonAt, JSON.stringify({ generatedAt: new Date().toISOString(), byFile, routes }, null, 2));
    console.log(`wrote ${jsonAt}`);
  }
  if (args.includes("--by-file")) {
    const rows = Object.entries(byFile)
      .map(([f, m]) => ({ f, m, s: debtScore(m) }))
      .sort((a, b) => b.s - a.s);
    console.log("| File | Lines | Hex | Palette | text-[px] | Inline | Button | Field | lucide | Motion | Debt |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const { f, m, s } of rows) console.log(`| \`${f}\` | ${m.lines} | ${m.hex} | ${m.palette} | ${m.arbText} | ${m.inlineStyle} | ${m.rawButton} | ${m.rawField} | ${m.lucide} | ${m.motion} | **${s}** |`);
  } else if (!jsonAt || args.includes("--md")) {
    console.log(md(routes));
    const total = sumMetrics(Object.values(byFile));
    console.log(`\nTotals (app + components + lib, ${Object.keys(byFile).length} files): hex ${total.hex} · palette ${total.palette} · text-[px] ${total.arbText} · inline style ${total.inlineStyle} · raw button ${total.rawButton} · raw field ${total.rawField} · lucide ${total.lucide} · motion ${total.motion}`);
  }
}
