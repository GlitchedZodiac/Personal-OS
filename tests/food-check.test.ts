import { describe, expect, it } from "vitest";
import {
  checkFoodItems,
  coerceFoodItem,
  collapseDuplicateItems,
  isAlcohol,
  macroMismatch,
} from "@/lib/food-check";

const egg = { mealType: "breakfast", foodDescription: "Scrambled eggs (2)", calories: 144, proteinG: 13, carbsG: 1, fatG: 10 };

describe("coerceFoodItem", () => {
  it("turns strings into numbers, drops negatives and NaN, rounds", () => {
    const it_ = coerceFoodItem({ ...egg, calories: "144.6", proteinG: "13,25", carbsG: -3, fatG: "nope" });
    expect(it_.calories).toBe(145);
    expect(it_.proteinG).toBe(13.3);
    expect(it_.carbsG).toBe(0);
    expect(it_.fatG).toBe(0);
  });
  it("keeps a valid meal type and falls back to snack otherwise", () => {
    expect(coerceFoodItem({ ...egg, mealType: "Dinner" }).mealType).toBe("dinner");
    expect(coerceFoodItem({ ...egg, mealType: "brunch" }).mealType).toBe("snack");
  });
  it("keeps confidence only when it is one of the three words", () => {
    expect(coerceFoodItem({ ...egg, confidence: "Low" }).confidence).toBe("low");
    expect(coerceFoodItem({ ...egg, confidence: "sure" }).confidence).toBeUndefined();
  });
  it("drops empty notes and loggedAt instead of storing empty strings", () => {
    const it_ = coerceFoodItem({ ...egg, notes: "  ", loggedAt: "" });
    expect("notes" in it_).toBe(false);
    expect("loggedAt" in it_).toBe(false);
  });
});

describe("macroMismatch — a flag, never a rewrite", () => {
  it("is silent when kcal and 4P+4C+9F agree within 15 %", () => {
    expect(macroMismatch(egg)).toBeNull(); // 13·4 + 1·4 + 10·9 = 146 vs 144
  });
  it("flags a real disagreement with the macro-derived kcal and the gap", () => {
    const f = macroMismatch({ ...egg, calories: 300 });
    expect(f).toEqual({ kind: "macro_mismatch", macroKcal: 146, pct: 51.3 });
  });
  it("does not judge items under 30 kcal (the 2 kcal coffee vs 0 by the formula)", () => {
    expect(macroMismatch({ foodDescription: "Black coffee", calories: 2, proteinG: 0, carbsG: 0, fatG: 0 })).toBeNull();
    expect(macroMismatch({ foodDescription: "Ají", calories: 10, proteinG: 0, carbsG: 2, fatG: 0 })).toBeNull();
  });
  it("exempts alcohol — 7 kcal/g the formula cannot see", () => {
    expect(isAlcohol("Cerveza 330 ml")).toBe(true);
    expect(isAlcohol("Red wine (150 ml)")).toBe(true);
    expect(isAlcohol("Ginger tea")).toBe(false);
    expect(macroMismatch({ foodDescription: "Beer (330 ml)", calories: 142, proteinG: 1.6, carbsG: 11.9, fatG: 0 })).toBeNull();
  });
});

describe("collapseDuplicateItems — the doubled bandeja paisa, and nothing else", () => {
  const row = (d: string, k: number) => ({ foodDescription: d, calories: k, flags: [] as never[] });
  it("folds a card whose whole list is repeated, flagging each kept row", () => {
    const plate = [row("White rice (~1 cup)", 205), row("Frijoles (~1 cup)", 230), row("Chicharrón (~80 g)", 455)];
    const doubled = [...plate, ...plate.map((r) => ({ ...r, flags: [] as never[] }))];
    const { items, collapsed } = collapseDuplicateItems(doubled);
    expect(collapsed).toBe(3);
    expect(items.map((i) => i.foodDescription)).toEqual(["White rice (~1 cup)", "Frijoles (~1 cup)", "Chicharrón (~80 g)"]);
    expect(items[0].flags).toEqual([{ kind: "duplicate_collapsed", copies: 2 }]);
  });
  it("matches the copy through case and trailing punctuation", () => {
    const { collapsed } = collapseDuplicateItems([row("Arepa (1)", 175), row("Queso (30 g)", 90), row("arepa (1).", 175), row("queso (30 g)", 90)]);
    expect(collapsed).toBe(2);
  });
  it("KEEPS two identical rows — 'two 65 g beef empanadas' is two empanadas (K06)", () => {
    const { items, collapsed } = collapseDuplicateItems([row("Beef empanada (~65 g)", 215), row("Beef empanada (~65 g)", 215)]);
    expect(collapsed).toBe(0);
    expect(items).toHaveLength(2);
  });
  it("keeps a list where only some rows repeat", () => {
    const rows = [row("Egg", 75), row("Egg", 75), row("Arepa", 175)];
    expect(collapseDuplicateItems(rows).collapsed).toBe(0);
  });
  it("leaves two different portions of the same food alone", () => {
    expect(collapseDuplicateItems([row("Arepa (1)", 175), row("Arepa (1 small)", 110)]).collapsed).toBe(0);
  });
});

describe("checkFoodItems — the whole pass", () => {
  it("coerces, flags, keeps two identical rows, and drops rows with no description", () => {
    const r = checkFoodItems([
      { ...egg, calories: "144" },
      { ...egg, calories: 144 },
      { mealType: "lunch", foodDescription: "", calories: 500, proteinG: 0, carbsG: 0, fatG: 0 },
      { mealType: "lunch", foodDescription: "Mystery plate", calories: 900, proteinG: 10, carbsG: 10, fatG: 10 },
    ]);
    expect(r.items).toHaveLength(3);
    expect(r.collapsed).toBe(0);
    expect(r.mismatched).toBe(1);
    expect(r.items[2].flags[0]).toMatchObject({ kind: "macro_mismatch", macroKcal: 170 });
  });
  it("folds a doubled plate on the way through", () => {
    const plate = [egg, { ...egg, foodDescription: "Arepa (1)", calories: 175, proteinG: 4, carbsG: 30, fatG: 4 }];
    expect(checkFoodItems([...plate, ...plate]).collapsed).toBe(2);
  });
  it("returns nothing for a non-array", () => {
    expect(checkFoodItems(undefined)).toEqual({ items: [], collapsed: 0, mismatched: 0 });
  });
});
