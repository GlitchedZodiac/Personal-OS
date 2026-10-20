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

// ─── History (2026-10-18, the intake lane) ────────────────────────────────
//
// The same word-overlap idea over his own past rows, so a card can say "last
// time: 320 kcal" and the model can be handed a stable number for a food he
// logs again and again. Portion notes are stripped before matching — his
// descriptions carry them in parentheses ("Arepa con queso (1, ~80 g)") and
// the overlap score would otherwise be diluted by "80" and "g".

/** The food's name without the portion note: text before the first "(" or " - ". */
export function foodNameOf(description: string): string {
  const cut = description.split(/\s*[(\[—–]|\s+-\s+|,\s*~/)[0] ?? description;
  return cut.trim() || description.trim();
}

export interface HistoryRow {
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedAt: Date | string;
}

export interface HistoryMatch {
  /** rows that matched */
  count: number;
  /** distinct local days those rows were logged on */
  days: number;
  medianKcal: number;
  medianProteinG: number;
  medianCarbsG: number;
  medianFatG: number;
  /** (max − min) / median of the matched kcal, as a percentage */
  spreadPct: number;
  lastKcal: number;
  lastAt: string;
  /** the most recent matched description, as he wrote it */
  matchedDescription: string;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function dayKey(at: Date | string, timeZone: string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Vessel, portion and default-variety words: they describe how much, how it
 * was served or the usual kind, not what it was. "Sancocho de pollo,
 * restaurant-style bowl" is still sancocho de pollo.
 */
const PORTION_WORDS = new Set([
  "restaurant", "style", "bowl", "bowls", "plate", "plato", "portion", "porcion", "serving", "servings",
  "cup", "cups", "taza", "tazas", "glass", "vaso", "slice", "slices", "piece", "pieces", "each",
  "cooked", "homemade", "casero", "casera", "typical", "regular", "full", "about", "approx",
  "large", "medium", "small", "grande", "mediano", "pequeno", "just", "for", "breakfast", "lunch",
  "dinner", "snack", "desayuno", "almuerzo", "cena", "had", "ate",
  // the default variety: "arepa de maíz con queso campesino" IS "arepa con queso"
  "maiz", "campesino", "campesina", "colombiano", "colombiana", "criollo", "criolla", "tipico", "tipica",
]);

function nameTokens(description: string): Set<string> {
  return new Set([...tokens(foodNameOf(description))].filter((w) => !PORTION_WORDS.has(w) && !/^\d+$/.test(w)));
}

/**
 * How the new text is compared with a past row's name.
 *  - "item": a card row. The two names must be essentially the same food:
 *    overlap over the LARGER name. A component never matches a dish it is
 *    part of — "Hogao" is not "Patacones con hogao", "Arepa" is not "Arepa
 *    con queso" (both happened with the usuals rule, which is containment).
 *  - "message": the whole utterance. The past name must be fully inside it
 *    (a message carries other words), and only one food may qualify.
 */
export type HistoryMode = "item" | "message";

/**
 * Past rows for the same food, summarised — one food, never a blend: rows
 * are grouped by name and the best-matching group is returned. Null when
 * nothing matches (or, for a message, when it names more than one past food).
 */
export function matchHistory(
  description: string,
  rows: readonly HistoryRow[],
  options: { threshold?: number; timeZone?: string; mode?: HistoryMode } = {}
): HistoryMatch | null {
  const threshold = options.threshold ?? 0.8;
  const timeZone = options.timeZone ?? "America/Bogota";
  const mode = options.mode ?? "item";
  const spoken = mode === "message" ? tokens(description) : nameTokens(description);
  if (spoken.size === 0) return null;

  const groups = new Map<string, { score: number; rows: HistoryRow[] }>();
  for (const row of rows) {
    const saved = nameTokens(row.foodDescription);
    if (saved.size === 0) continue;
    let overlap = 0;
    for (const w of saved) if (spoken.has(w)) overlap++;
    const score = mode === "message" ? overlap / saved.size : overlap / Math.max(saved.size, spoken.size);
    if (score < threshold) continue;
    const key = [...saved].sort().join(" ");
    const g = groups.get(key) ?? { score, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  if (groups.size === 0) return null;
  if (mode === "message" && groups.size > 1) return null;
  const best = [...groups.values()].sort((a, b) => b.score - a.score || b.rows.length - a.rows.length)[0];
  const hits = best.rows;
  const kcal = hits.map((h) => h.calories).filter((k) => Number.isFinite(k) && k > 0);
  const med = kcal.length ? median(kcal) : 0;
  const sorted = [...hits].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
  );
  return {
    count: hits.length,
    days: new Set(hits.map((h) => dayKey(h.loggedAt, timeZone))).size,
    medianKcal: Math.round(med),
    medianProteinG: Math.round(median(hits.map((h) => h.proteinG)) * 10) / 10,
    medianCarbsG: Math.round(median(hits.map((h) => h.carbsG)) * 10) / 10,
    medianFatG: Math.round(median(hits.map((h) => h.fatG)) * 10) / 10,
    spreadPct: med > 0 && kcal.length > 1 ? Math.round(((Math.max(...kcal) - Math.min(...kcal)) / med) * 100) : 0,
    lastKcal: Math.round(sorted[0].calories),
    lastAt: new Date(sorted[0].loggedAt).toISOString(),
    matchedDescription: sorted[0].foodDescription,
  };
}

/** Words that state an amount — a message carrying one may mean a different portion. */
const QUANTITY_RE =
  /(\d+(?:[.,]\d+)?\s*(?:g|gr|gramos?|grams?|ml|oz|kg|cups?|tazas?|scoops?|cucharadas?|tbsp|tsp|slices?|tajadas?|porciones?|servings?|pieces?|unidades?)?\b)|\b(two|three|four|five|six|dos|tres|cuatro|cinco|seis|half|media|medio|mitad|quarter|cuarto|double|doble|triple|couple|par de|a few|unos|unas|varias|varios|large|small|big|grande|peque[nñ][oa]|extra)\b/i;

export function messageHasQuantity(message: string): boolean {
  return QUANTITY_RE.test(message);
}

/**
 * Decision D3: the model is handed a past number only when the food is a
 * genuine repeat (three different days), the number has been stable (spread
 * ≤ 25 %), and the new message does not state an amount that could differ
 * from those rows. Anything less stays on the card as "last time" only.
 */
export function anchorEligible(match: HistoryMatch | null, message: string): match is HistoryMatch {
  return Boolean(match && match.days >= 3 && match.spreadPct <= 25 && !messageHasQuantity(message));
}

/** Decision D3's other half: a repeat worth saving as a usual. */
export function usualPromotionEligible(match: HistoryMatch | null): match is HistoryMatch {
  return Boolean(match && match.days >= 3 && match.spreadPct <= 25);
}

// ─── "My usual" in any language (2026-10-20) ──────────────────────────────
//
// The model is never told which usuals exist, so "my usual green morning
// shake" — his own saved "Mi batido verde de la mañana", said in English —
// got a question back instead of a card (Phase 2 baseline, G03). Word
// overlap cannot cross languages; the model can. When the message asks for
// a usual, it is handed the names and numbers (a few dozen tokens, and only
// on those turns), and names the item exactly so the card's usual match and
// "Log usual" button work as they do for an exact phrase.

const USUAL_WORDS = /\b(usual|usuals|my regular|the regular|same as always|de siempre|lo de siempre|el de siempre|la de siempre|lo habitual|mi habitual)\b/i;

export function mentionsUsual(message: string): boolean {
  return USUAL_WORDS.test(message);
}

export interface UsualForPrompt {
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  kind?: string | null;
  servingLabel?: string | null;
}

/** One short line listing his usuals for the model; empty when there are none. */
export function usualsPromptNote(usuals: readonly UsualForPrompt[], max = 20): string {
  const list = usuals
    .filter((u) => u.foodDescription && u.foodDescription.trim())
    .slice(0, max)
    .map((u) => {
      const per = u.kind === "product" && u.servingLabel ? ` per ${u.servingLabel}` : "";
      const r = (n: number) => Math.round(n);
      return `"${u.foodDescription.trim()}" (${r(u.calories)} kcal${per}, ${r(u.proteinG)}P/${r(u.carbsG)}C/${r(u.fatG)}F)`;
    });
  if (list.length === 0) return "";
  return (
    `\n\n[His saved usuals: ${list.join("; ")}. If he is asking for one of these, in any language or wording, ` +
    `log it with exactly that name as foodDescription and exactly those numbers.]`
  );
}
