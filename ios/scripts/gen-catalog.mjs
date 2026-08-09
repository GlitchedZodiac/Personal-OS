#!/usr/bin/env node
// Regenerates ios/Shared/ExerciseCatalog.swift from lib/exercises.ts so the
// watch's exercise ids can never drift from the web catalog. Run from repo
// root whenever lib/exercises.ts changes:
//
//   node ios/scripts/gen-catalog.mjs
//
// Aliases ARE mirrored: historical workout rows store free-text names
// ("Kettlebell swings", "sentadilla goblet"), so on-watch PR baselines need
// the same normalization the server uses (fold + alias + whole-word match) —
// exact-name matching alone missed his real 20 kg swing baseline.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "lib", "exercises.ts"), "utf8");

const entryRe =
  /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*aliases:\s*\[([^\]]*)\]/g;
const entries = [];
let match;
while ((match = entryRe.exec(source)) !== null) {
  const aliases = [...match[4].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  entries.push({ id: match[1], name: match[2], category: match[3], aliases });
}

if (entries.length < 40) {
  console.error(
    `Parsed only ${entries.length} catalog entries — lib/exercises.ts format changed? Aborting.`
  );
  process.exit(1);
}

const categories = [...new Set(entries.map((e) => e.category))];
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
    public let aliases: [String]
}

public enum ExerciseCategory: String, CaseIterable, Sendable {
${categories.map((c) => `    case ${c.replace(/-/g, "_")} = "${c}"`).join("\n")}
}

public enum ExerciseCatalog {
    public static let all: [ExerciseDef] = [
${entries
  .map(
    (e) =>
      `        ExerciseDef(id: "${e.id}", name: "${esc(e.name)}", category: .${e.category.replace(/-/g, "_")}, aliases: [${e.aliases.map((a) => `"${esc(a)}"`).join(", ")}]),`
  )
  .join("\n")}
    ]

    /// Kettlebell first — the wrist picker's primary set.
    public static let kettlebell: [ExerciseDef] = all.filter { $0.category == .kettlebell }

    public static func byId(_ id: String) -> ExerciseDef? {
        all.first { $0.id == id }
    }

    // MARK: - Normalization (ports normalizeExerciseName from lib/exercises.ts)

    /// Accent-fold + lowercase + strip punctuation, hyphens/underscores to
    /// spaces — the same folding the server applies before matching.
    static func fold(_ value: String) -> String {
        let lowered = value.lowercased()
            .folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en"))
        var out = ""
        for ch in lowered {
            if ch == "-" || ch == "_" {
                out.append(" ")
            } else if ch.isLetter || ch.isNumber || ch == " " {
                out.append(ch)
            } else {
                out.append(" ")
            }
        }
        return out.split(separator: " ").joined(separator: " ")
    }

    struct IndexEntry {
        let key: String
        let def: ExerciseDef
    }

    /// Longest keys first so "clean and press" wins over "clean" on the
    /// containment pass — mirrors the server index ordering.
    static let index: [IndexEntry] = {
        var entries: [IndexEntry] = []
        for def in all {
            entries.append(IndexEntry(key: fold(def.name), def: def))
            entries.append(IndexEntry(key: def.id, def: def))
            entries.append(IndexEntry(key: fold(def.id), def: def))
            for alias in def.aliases {
                entries.append(IndexEntry(key: fold(alias), def: def))
            }
        }
        return entries.sorted { $0.key.count > $1.key.count }
    }()

    /// Map a free-text exercise name (typed, spoken, or from history rows)
    /// to a catalog entry — exact fold-match first, then whole-word
    /// containment. Returns nil for unknown movements.
    public static func normalize(_ raw: String) -> ExerciseDef? {
        let folded = fold(raw)
        guard !folded.isEmpty else { return nil }

        for entry in index where entry.key == folded {
            return entry.def
        }
        let words = folded.split(separator: " ").map(String.init)
        for entry in index where entry.key.count >= 4 {
            let keyWords = entry.key.split(separator: " ").map(String.init)
            if keyWords.count <= words.count {
                for start in 0...(words.count - keyWords.count) {
                    if Array(words[start..<(start + keyWords.count)]) == keyWords {
                        return entry.def
                    }
                }
            }
        }
        return nil
    }
}
`;

writeFileSync(join(root, "ios", "Shared", "ExerciseCatalog.swift"), swift);
console.log(
  `Wrote ios/Shared/ExerciseCatalog.swift — ${entries.length} exercises, ${entries.reduce((n, e) => n + e.aliases.length, 0)} aliases (${entries.filter((e) => e.category === "kettlebell").length} kettlebell).`
);
