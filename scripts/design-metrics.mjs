#!/usr/bin/env node
// Design-debt metrics (lane C, 2026-10-17): the numbers behind the screen
// audit, and the counting half of the Phase-2 ratchet gate.
//
// Per file under app/ and components/ (tsx), counts the things the design
// system is meant to retire:
//   hex        raw colour literals (#abc, #aabbcc, #aabbccdd)
//   arbText    arbitrary Tailwind type sizes (text-[12.5px])
//   inlineStyle style={{…}} blocks that set colour/type by hand
//   rawButton  <button> outside components/ui (should be the kit's Button)
//   rawField   <input>/<select>/<textarea> outside components/ui
//   lucide     names imported from lucide-react (designed surfaces use
//              components/pitaya-icons.tsx)
//   motion     transition-all / duration-N classes outside the standard
//              (75, 100, 150 are the standard rungs; see look-plan.md)
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

export const STANDARD_DURATIONS = new Set(["75", "100", "150"]);

const PATTERNS = {
  hex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
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

export function scanSource(text, { isKit = false } = {}) {
  const src = stripComments(text);
  const count = (re) => (src.match(re) ?? []).length;
  let motion = count(PATTERNS.transitionAll);
  for (const m of src.matchAll(PATTERNS.duration)) if (!STANDARD_DURATIONS.has(m[1])) motion++;
  let lucide = 0;
  for (const m of src.matchAll(PATTERNS.lucideImport)) {
    lucide += m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length;
  }
  return {
    hex: count(PATTERNS.hex),
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
  const out = { hex: 0, arbText: 0, inlineStyle: 0, rawButton: 0, rawField: 0, lucide: 0, motion: 0, lines: 0 };
  for (const m of list) for (const k of Object.keys(out)) out[k] += m[k] ?? 0;
  return out;
}

export function debtScore(m) {
  return m.hex + m.arbText + m.inlineStyle + m.rawButton + m.rawField + m.lucide + m.motion;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, acc);
    } else if (/\.tsx$/.test(name)) acc.push(p);
  }
  return acc;
}

export function scanRepo(root = ROOT) {
  const files = [...walk(join(root, "app")), ...walk(join(root, "components"))];
  const byFile = {};
  for (const abs of files) {
    const rel = relative(root, abs);
    byFile[rel] = scanSource(readFileSync(abs, "utf8"), { isKit: rel.startsWith("components/ui/") });
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
  const pages = walk(join(root, "app")).filter((p) => /\/page\.tsx$/.test(p));
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
  const head = "| Route | Lines | Hex | text-[px] | Inline style | Raw button | Raw field | lucide | Motion | Debt |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = routes.map((r) => {
    const m = r.withDeps;
    return `| \`${r.route}\` | ${m.lines} | ${m.hex} | ${m.arbText} | ${m.inlineStyle} | ${m.rawButton} | ${m.rawField} | ${m.lucide} | ${m.motion} | **${r.score}** |`;
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
    console.log("| File | Lines | Hex | text-[px] | Inline | Button | Field | lucide | Motion | Debt |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const { f, m, s } of rows) console.log(`| \`${f}\` | ${m.lines} | ${m.hex} | ${m.arbText} | ${m.inlineStyle} | ${m.rawButton} | ${m.rawField} | ${m.lucide} | ${m.motion} | **${s}** |`);
  } else if (!jsonAt || args.includes("--md")) {
    console.log(md(routes));
    const total = sumMetrics(Object.values(byFile));
    console.log(`\nTotals (app + components, ${Object.keys(byFile).length} files): hex ${total.hex} · text-[px] ${total.arbText} · inline style ${total.inlineStyle} · raw button ${total.rawButton} · raw field ${total.rawField} · lucide ${total.lucide} · motion ${total.motion}`);
  }
}
