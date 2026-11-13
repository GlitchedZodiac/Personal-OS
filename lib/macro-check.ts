// Macro sanity check (2026-11-12, gap #13). A nutrition label's calories
// should roughly equal protein×4 + carbs×4 + fat×9 (the Atwater factors).
// When they disagree a lot, either the label is internally inconsistent (the
// Heal chocolate powder: macros add to ~138 kcal, label says 176) or a number
// was misread. Claude already reads the label photo; Pitaya's job is to say
// "these numbers don't agree" before they become every future log.
//
// A warning, never an error: fibre, sugar alcohols and rounding make some
// real labels legitimately off by a little, and the label is what he eats.

export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Calories implied by the macros, in kcal. */
export function kcalFromMacros(m: { proteinG: number; carbsG: number; fatG: number }): number {
  return m.proteinG * ATWATER.protein + m.carbsG * ATWATER.carbs + m.fatG * ATWATER.fat;
}

/**
 * A plain-language warning when stated calories and the macros disagree by
 * more than `tolerance` (default 10%), else null. Tiny items (under 20 kcal
 * both ways) are skipped — rounding dominates there.
 */
export function macroMismatchWarning(
  m: { calories: number; proteinG: number; carbsG: number; fatG: number },
  tolerance = 0.1
): string | null {
  const implied = kcalFromMacros(m);
  const stated = m.calories;
  if (!Number.isFinite(implied) || !Number.isFinite(stated)) return null;
  if (stated < 20 && implied < 20) return null;
  const base = Math.max(stated, implied);
  const gap = Math.abs(stated - implied) / base;
  if (gap <= tolerance) return null;
  return (
    `The macros add up to ${Math.round(implied)} kcal but the calories say ${Math.round(stated)} ` +
    `(${Math.round(gap * 100)}% apart). Check the label — one of the numbers may be misread, ` +
    `or the label itself is inconsistent. Saved as given.`
  );
}
