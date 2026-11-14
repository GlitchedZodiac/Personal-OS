#!/usr/bin/env node
// The design gate — a RATCHET (lane C, 2026-10).
//
// Counts per file the things the design system retires (see
// scripts/design-metrics.mjs: raw hex, Tailwind palette colours, arbitrary
// text-[Npx], inline colour/type styles, raw <button>/<input>/<select>/
// <textarea> outside components/ui, lucide icons, non-standard motion) in
// app/, components/ and lib/, and compares them with the committed baseline,
// scripts/design-gate.baseline.json.
//
// The unit of the ratchet is the FAMILY (design-metrics familyOf: a tab
// section, a components folder, lib …), so debt may move between files of
// one family — a rename, a split, an extracted component — but:
//
//   FAIL  when any family's total of any metric RISES above its baseline,
//         or a family the baseline does not know has any count at all.
//   PASS  otherwise — totals may only fall. The gate never writes in CI.
//
//   npm run design-gate                 # check (first step of `npm run build`)
//   npm run design-gate -- --update     # after a pass: lock the new, lower counts in
//   npm run design-gate -- --init       # write the baseline from scratch
//
// --update refuses unless the check passes, so it can only lower family
// totals. A deliberate raise is a hand edit of the baseline JSON, visible in
// review. --init is for the first baseline and for the merge-time re-take:
// lane C merges LAST, rebased on main after lanes A, D and B, and the
// baseline is re-taken at that point (docs/design/look-plan.md D11).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { METRIC_KEYS, familyOf, scanRepo } from "./design-metrics.mjs";

export const BASELINE_PATH = join(process.cwd(), "scripts", "design-gate.baseline.json");

const LABEL = {
  hex: "raw hex colour",
  palette: "Tailwind palette colour (text-red-500 …) — use the role tokens",
  arbText: "arbitrary text-[Npx] size",
  inlineStyle: "inline colour/type style",
  rawButton: "raw <button> (use components/ui)",
  rawField: "raw <input>/<select>/<textarea> (use components/ui)",
  lucide: "lucide icon (use components/pitaya-icons on designed surfaces)",
  motion: "non-standard motion (transition-all / off-standard duration / literal timing)",
};

/** Keep only non-zero counts; drop files with nothing. */
export function compact(byFile) {
  const out = {};
  for (const [file, metrics] of Object.entries(byFile)) {
    const kept = {};
    for (const key of METRIC_KEYS) if ((metrics[key] ?? 0) > 0) kept[key] = metrics[key];
    if (Object.keys(kept).length) out[file] = kept;
  }
  return out;
}

/** Per-family totals of per-file counts. */
export function familyTotals(byFile) {
  const out = {};
  for (const [file, metrics] of Object.entries(byFile ?? {})) {
    const fam = familyOf(file);
    out[fam] ??= Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
    for (const key of METRIC_KEYS) out[fam][key] += metrics[key] ?? 0;
  }
  return out;
}

/**
 * Compare current per-file counts with the baseline, family by family.
 * Returns { failures, improvements }, each item
 * { family, metric, was, now, isNewFamily, files: [{ file, was, now }] }.
 */
export function compareToBaseline(current, baseline) {
  const now = familyTotals(current);
  const was = familyTotals(baseline);
  const failures = [];
  const improvements = [];
  const filesIn = (fam, key) =>
    [...new Set([...Object.keys(current), ...Object.keys(baseline ?? {})])]
      .filter((f) => familyOf(f) === fam)
      .map((f) => ({ file: f, was: baseline?.[f]?.[key] ?? 0, now: current[f]?.[key] ?? 0 }))
      .filter((r) => r.was !== r.now);
  for (const fam of new Set([...Object.keys(now), ...Object.keys(was)])) {
    for (const key of METRIC_KEYS) {
      const a = was[fam]?.[key] ?? 0;
      const b = now[fam]?.[key] ?? 0;
      if (b > a) failures.push({ family: fam, metric: key, was: a, now: b, isNewFamily: !was[fam], files: filesIn(fam, key) });
      else if (b < a) improvements.push({ family: fam, metric: key, was: a, now: b, isNewFamily: false, files: filesIn(fam, key) });
    }
  }
  return { failures, improvements };
}

export function totals(byFile) {
  const t = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
  for (const m of Object.values(byFile)) for (const k of METRIC_KEYS) t[k] += m[k] ?? 0;
  return t;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(files) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const doc = {
    note: "Design-gate ratchet baseline. Family totals may only fall. Lower with `npm run design-gate -- --update`; raise only by a reviewed hand edit. See scripts/design-gate.mjs.",
    metrics: METRIC_KEYS,
    totals: totals(sorted),
    files: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(doc, null, 2) + "\n");
  return doc;
}

function fmtTotals(t) {
  return METRIC_KEYS.map((k) => `${k} ${t[k]}`).join(" · ");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const current = compact(scanRepo());

  if (args.has("--init")) {
    const doc = writeBaseline(current);
    console.log(`design-gate: baseline written (${Object.keys(doc.files).length} files) — ${fmtTotals(doc.totals)}`);
    return 0;
  }

  const baselineDoc = readBaseline();
  if (!baselineDoc) {
    console.error("design-gate: no baseline at scripts/design-gate.baseline.json — run `npm run design-gate -- --init` once.");
    return 1;
  }
  const baseline = baselineDoc.files ?? {};
  const { failures, improvements } = compareToBaseline(current, baseline);

  if (failures.length) {
    console.error(`design-gate: FAILED — ${failures.length} family total(s) rose above the baseline.\n`);
    for (const f of failures) {
      const where = f.isNewFamily ? "new family — must be clean" : `was ${f.was}`;
      console.error(`  ${f.family}: ${LABEL[f.metric]} — ${f.now} (${where})`);
      for (const r of f.files) console.error(`      ${r.file}: ${r.was} → ${r.now}`);
    }
    console.error(
      "\nUse the tokens (app/globals.css) and the kit (components/ui) instead. If debt moved between families on purpose, edit scripts/design-gate.baseline.json by hand so the change is reviewed."
    );
    return 1;
  }

  if (args.has("--update")) {
    const doc = writeBaseline(current);
    console.log(`design-gate: baseline updated — ${fmtTotals(doc.totals)}`);
    return 0;
  }

  const fell = improvements.reduce((n, i) => n + (i.was - i.now), 0);
  console.log(
    `design-gate: passed — ${fmtTotals(totals(current))}` +
      (fell > 0 ? `\n  ${fell} fewer than the baseline; lock it in with \`npm run design-gate -- --update\`.` : "")
  );
  return 0;
}

const isMain = process.argv[1] && /design-gate\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main());
