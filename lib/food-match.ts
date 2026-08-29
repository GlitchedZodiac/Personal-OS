// Food fuzzy matching (2026-08-29, the token-ROI round): the deterministic
// bridge between what he SAYS ("egg wrap with the pea protein") and a saved
// usual ("Egg wrap with pea protein"). Exact-string equality caught 3% of
// repeats in prod; word-overlap catches phrasing drift with zero tokens.
// Same fold idiom as lib/exercises.ts — accents/punct/case are noise.

export function foldFoodDescription(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/// Words too generic to signal a match on their own.
const STOP_WORDS = new Set([
  "a", "an", "the", "of", "with", "and", "de", "con", "y", "la", "el",
  "some", "my", "one", "two", "half", "big", "small", "little",
]);

function tokens(value: string): Set<string> {
  return new Set(
    foldFoodDescription(value)
      .split(" ")
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  );
}

export interface UsualCandidate {
  id: string;
  foodDescription: string;
}

export interface UsualMatch {
  id: string;
  foodDescription: string;
  /// 0–1 — containment-biased overlap: how much of the SHORTER description
  /// is covered by the other (a usual is often a subset of the spoken one).
  score: number;
}

/// Best usual for a spoken description, or null under the threshold.
/// 0.8 means: nearly all of the shorter side's meaningful words overlap —
/// strict enough that "egg wrap" never matches "chicken wrap".
export function matchUsual(
  description: string,
  usuals: UsualCandidate[],
  threshold = 0.8
): UsualMatch | null {
  const spoken = tokens(description);
  if (spoken.size === 0) return null;
  let best: UsualMatch | null = null;
  for (const u of usuals) {
    const saved = tokens(u.foodDescription);
    if (saved.size === 0) continue;
    let overlap = 0;
    for (const w of saved) if (spoken.has(w)) overlap++;
    const score = overlap / Math.min(saved.size, spoken.size);
    if (score >= threshold && (best == null || score > best.score)) {
      best = { id: u.id, foodDescription: u.foodDescription, score };
    }
  }
  return best;
}
