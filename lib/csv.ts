// Minimal RFC 4180 CSV writer. Domain-free on purpose — lib/vesync.ts owns a
// CSV *parser* for one vendor's scale export and says so in its header; a
// generic writer does not belong in that charter.

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvOptions {
  delimiter?: string;
  eol?: string;
  /** UTF-8 BOM. Excel needs it or accented characters in notes come out mangled. */
  bom?: boolean;
}

const DEFAULT_DELIMITER = ",";
const DEFAULT_EOL = "\r\n";

/**
 * Rules that matter here, all pinned by tests:
 *   null/undefined -> empty and UNQUOTED. A missing waistCm is not 0.
 *   0              -> "0". visceralFat: 0 is a real reading.
 *   ""             -> two quote chars, so empty-string stays distinguishable
 *                     from null on the way back in.
 *   NaN/Infinity   -> empty. Never leak "NaN" into a cell.
 */
export function escapeCsvValue(
  value: CsvValue,
  delimiter: string = DEFAULT_DELIMITER
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";

  const text = String(value);
  const needsQuoting =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim() ||
    text === "";
  return needsQuoting ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly CsvValue[][],
  options: CsvOptions = {}
): string {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
  const eol = options.eol ?? DEFAULT_EOL;
  const bom = options.bom ?? true;

  const lines: string[] = [
    headers.map((h) => escapeCsvValue(h, delimiter)).join(delimiter),
  ];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvValue(cell, delimiter)).join(delimiter));
  }
  return `${bom ? "﻿" : ""}${lines.join(eol)}${eol}`;
}
