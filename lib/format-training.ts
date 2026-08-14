// Shared number formatting for training surfaces. Codified 2026-08-14 after
// the Train screen shipped "6,190 kg this week" — a tonnage (sets × reps ×
// bell) rendered as if it were a weight you could pick up. Tonnage is the
// right metric; five raw digits are the wrong presentation.

/**
 * Session/weekly tonnage → a number a human reads at a glance.
 *   840   → "840 kg"
 *   6190  → "6.2 t"
 *   24500 → "25 t"
 * Below 1000 kg stays in kilos (the honest unit at that scale); at and above
 * it flips to tonnes so the tile never shows a five-digit kilo count.
 */
export function formatTonnage(kg: number): { value: string; unit: string } {
  const safe = Number.isFinite(kg) && kg > 0 ? kg : 0;
  if (safe < 1000) {
    return { value: Math.round(safe).toLocaleString("en-US"), unit: "kg" };
  }
  const tonnes = safe / 1000;
  return {
    value: tonnes < 10 ? tonnes.toFixed(1) : String(Math.round(tonnes)),
    unit: "t",
  };
}

/** "6.2 t" / "840 kg" as one string. */
export function tonnageLabel(kg: number): string {
  const { value, unit } = formatTonnage(kg);
  return `${value} ${unit}`;
}

/**
 * Week-over-week trend for the volume chart. The old math compared the LAST
 * bucket to the FIRST NON-ZERO one, so a single week of data compared itself
 * and printed a confident "+0%". Needs two distinct weeks with work in them
 * or it returns null and the caller shows nothing.
 */
export function volumeTrendPct(
  buckets: { volumeKg: number }[]
): number | null {
  const withWork = buckets.filter((b) => b.volumeKg > 0);
  if (withWork.length < 2) return null;
  const last = withWork[withWork.length - 1].volumeKg;
  const prior = withWork[withWork.length - 2].volumeKg;
  if (prior <= 0) return null;
  return Math.round(((last - prior) / prior) * 100);
}

/**
 * Signed calorie balance (eaten − burned − target) → plain words.
 *
 * Deliberately "left", not "under": at 9am with nothing logged the number is
 * −2000, and calling that "2,000 under" would claim a deficit that hasn't
 * been earned — it just means the day hasn't started. "Left" is honest at
 * every hour and becomes "over" the moment the budget is spent. Training
 * burn is added back because the target is an INTAKE goal.
 */
export function netVsTargetLabel(net: number): {
  text: string;
  tone: "left" | "over" | "even";
} {
  const rounded = Math.round(net);
  if (Math.abs(rounded) < 25) return { text: "on target", tone: "even" };
  return rounded < 0
    ? { text: `${Math.abs(rounded).toLocaleString("en-US")} left`, tone: "left" }
    : { text: `${rounded.toLocaleString("en-US")} over`, tone: "over" };
}
