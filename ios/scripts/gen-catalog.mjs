#!/usr/bin/env node
// Regenerates ios/Shared/ExerciseCatalog.swift from lib/exercises.ts so the
// watch's exercise ids can never drift from the web catalog. Run from repo
// root whenever lib/exercises.ts changes:
//
//   node ios/scripts/gen-catalog.mjs
//
// The watch only needs ids/names/categories (normalization of free text stays
// server-side); aliases are intentionally not mirrored.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "lib", "exercises.ts"), "utf8");

const entryRe =
  /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g;
const entries = [];
let match;
while ((match = entryRe.exec(source)) !== null) {
  entries.push({ id: match[1], name: match[2], category: match[3] });
}

if (entries.length < 40) {
  console.error(
    `Parsed only ${entries.length} catalog entries — lib/exercises.ts format changed? Aborting.`
  );
  process.exit(1);
}

const categories = [...new Set(entries.map((e) => e.category))];

const swift = `// GENERATED from lib/exercises.ts — do not edit by hand.
// Regenerate with: node ios/scripts/gen-catalog.mjs
// ${entries.length} exercises, categories: ${categories.join(", ")}.

import Foundation

public struct ExerciseDef: Hashable, Identifiable, Sendable {
    /// Canonical id — must match lib/exercises.ts exactly; stored in
    /// personal_records and written into workout exercises payloads.
    public let id: String
    public let name: String
    public let category: ExerciseCategory
}

public enum ExerciseCategory: String, CaseIterable, Sendable {
${categories.map((c) => `    case ${c.replace(/-/g, "_")} = "${c}"`).join("\n")}
}

public enum ExerciseCatalog {
    public static let all: [ExerciseDef] = [
${entries
  .map(
    (e) =>
      `        ExerciseDef(id: "${e.id}", name: "${e.name}", category: .${e.category.replace(/-/g, "_")}),`
  )
  .join("\n")}
    ]

    /// Kettlebell first — the wrist picker's primary set.
    public static let kettlebell: [ExerciseDef] = all.filter { $0.category == .kettlebell }

    public static func byId(_ id: String) -> ExerciseDef? {
        all.first { $0.id == id }
    }

    /// Exact-name lookup for mapping synced web workouts back to canonical
    /// ids on-watch (used when computing local PR baselines). Lowercased
    /// name/id match only — fuzzy alias matching stays server-side.
    public static func byLooseName(_ raw: String) -> ExerciseDef? {
        let folded = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return all.first {
            $0.id == folded || $0.name.lowercased() == folded
        }
    }
}
`;

writeFileSync(join(root, "ios", "Shared", "ExerciseCatalog.swift"), swift);
console.log(
  `Wrote ios/Shared/ExerciseCatalog.swift — ${entries.length} exercises (${entries.filter((e) => e.category === "kettlebell").length} kettlebell).`
);
