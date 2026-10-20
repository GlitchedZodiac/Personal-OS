// Deterministic checks on a food card before it reaches him (2026-10-18,
// the intake lane). Pure: the stream route runs it on the model's proposal
// and the batch route runs it again on save, so every writer gets the same
// numbers.
//
// What the Phase 2 baseline showed (docs/food-accuracy.md): on 135 items the
// model's kcal and 4P+4C+9F agreed on every item that mattered — the only
// "mismatches" were a 2 kcal coffee against 0 and a 10 kcal spoon of ají
// against 8. So nothing here REWRITES a number. It coerces types, FLAGS a real
// disagreement (with a 30 kcal floor, alcohol exempt — 7 kcal/g the formula
// cannot see), and folds a card that repeats its whole list (one bandeja
// paisa card carried every row twice, 3,090 kcal).

import { foldFoodDescription } from "@/lib/food-match";

export type FoodConfidence = "high" | "medium" | "low";

export interface FoodItemIn {
  mealType?: unknown;
  foodDescription?: unknown;
  calories?: unknown;
  proteinG?: unknown;
  carbsG?: unknown;
  fatG?: unknown;
  notes?: unknown;
  loggedAt?: unknown;
  confidence?: unknown;
  [key: string]: unknown;
}

export interface FoodItemChecked {
  mealType: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes?: string;
  loggedAt?: string;
  confidence?: FoodConfidence;
  /** What the check noticed. Empty when nothing did. */
  flags: FoodFlag[];
  [key: string]: unknown;
}

export type FoodFlag =
  | { kind: "macro_mismatch"; macroKcal: number; pct: number }
  | { kind: "duplicate_collapsed"; copies: number };

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

/** 4P + 4C + 9F cannot see alcohol; a drink that names one is not judged. */
export const ALCOHOL_RE =
  /\b(beer|cerveza|wine|vino|alcohol|aguardiente|ron|rum|whisk(?:e)?y|cocktail|tequila|vodka|gin|licor|liquor|michelada|sangr[ií]a|champagne|prosecco|cider|sidra)\b/i;

/** Below this an item's kcal is too small for a relative check to mean anything. */
export const MACRO_CHECK_FLOOR_KCAL = 30;
/** Relative disagreement that counts. */
export const MACRO_MISMATCH_PCT = 15;

function num(value: unknown, digits: number): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function macroKcal(item: { proteinG: number; carbsG: number; fatG: number }): number {
  return 4 * item.proteinG + 4 * item.carbsG + 9 * item.fatG;
}

export function isAlcohol(description: string): boolean {
  return ALCOHOL_RE.test(description);
}

/** Types, rounding, a valid meal type and confidence — never a new number. */
export function coerceFoodItem(raw: FoodItemIn): FoodItemChecked {
  const { mealType, foodDescription, calories, proteinG, carbsG, fatG, notes, loggedAt, confidence, ...rest } = raw;
  const meal = str(mealType).toLowerCase();
  const conf = str(confidence).toLowerCase();
  const out: FoodItemChecked = {
    ...(rest as Record<string, unknown>),
    mealType: (MEAL_TYPES as readonly string[]).includes(meal) ? meal : "snack",
    foodDescription: str(foodDescription),
    calories: num(calories, 0),
    proteinG: num(proteinG, 1),
    carbsG: num(carbsG, 1),
    fatG: num(fatG, 1),
    flags: [],
  };
  const noteText = str(notes);
  if (noteText) out.notes = noteText;
  const at = str(loggedAt);
  if (at) out.loggedAt = at;
  if (conf === "high" || conf === "medium" || conf === "low") out.confidence = conf;
  return out;
}

/** A real disagreement between an item's kcal and its own macros, or null. */
export function macroMismatch(item: {
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Extract<FoodFlag, { kind: "macro_mismatch" }> | null {
  if (item.calories < MACRO_CHECK_FLOOR_KCAL) return null;
  if (isAlcohol(item.foodDescription)) return null;
  const mk = macroKcal(item);
  const pct = Math.round((Math.abs(mk - item.calories) / item.calories) * 1000) / 10;
  if (pct <= MACRO_MISMATCH_PCT) return null;
  return { kind: "macro_mismatch", macroKcal: Math.round(mk), pct };
}

/**
 * Collapse a card the model wrote out twice. The defect the baseline found
 * was a whole PLATE repeated — a bandeja paisa's eight components, then the
 * same eight again (16 rows, 3,090 kcal). Two identical rows on their own are
 * NOT that: "two 65 g beef empanadas" written as one row per empanada is
 * right, and folding it halved the meal (found in the Phase 3 eval, K06). So
 * only a list that is k ≥ 2 copies of a block of two or more rows is folded,
 * back to one block; anything else is left exactly as the model wrote it.
 */
export function collapseDuplicateItems<T extends { foodDescription: string; calories: number; flags: FoodFlag[] }>(
  items: T[]
): { items: T[]; collapsed: number } {
  const n = items.length;
  const key = (it: T) => `${foldFoodDescription(it.foodDescription)}|${it.calories}`;
  for (let block = 2; block <= n / 2; block++) {
    if (n % block !== 0) continue;
    let repeats = true;
    for (let i = block; i < n && repeats; i++) {
      if (key(items[i]) !== key(items[i % block])) repeats = false;
    }
    if (!repeats) continue;
    const copies = n / block;
    const kept = items.slice(0, block);
    for (const it of kept) it.flags.push({ kind: "duplicate_collapsed", copies });
    return { items: kept, collapsed: n - block };
  }
  return { items, collapsed: 0 };
}

export interface FoodCheckResult {
  items: FoodItemChecked[];
  /** rows removed as copies */
  collapsed: number;
  /** items flagged for a kcal/macro disagreement */
  mismatched: number;
}

/** The whole pass, in the order the card needs: coerce → flag → collapse. */
export function checkFoodItems(raw: unknown): FoodCheckResult {
  const list = Array.isArray(raw) ? (raw as FoodItemIn[]) : [];
  const coerced = list
    .filter((r) => r && typeof r === "object")
    .map((r) => coerceFoodItem(r))
    .filter((it) => it.foodDescription.length > 0);
  let mismatched = 0;
  for (const item of coerced) {
    const flag = macroMismatch(item);
    if (flag) {
      item.flags.push(flag);
      mismatched++;
    }
  }
  const { items, collapsed } = collapseDuplicateItems(coerced);
  return { items, collapsed, mismatched };
}
