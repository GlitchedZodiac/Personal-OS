import { describe, expect, it } from "vitest";
import { foldFoodDescription, matchUsual } from "@/lib/food-match";

const usuals = [
  { id: "u1", foodDescription: "Egg wrap with pea protein" },
  { id: "u2", foodDescription: "Bandeja paisa (half portion)" },
  { id: "u3", foodDescription: "Chicken wrap" },
];

describe("food-match", () => {
  it("folds accents, punctuation, case", () => {
    expect(foldFoodDescription("  Arepa con Queso!! ")).toBe("arepa con queso");
    expect(foldFoodDescription("café-con_leche")).toBe("cafe con leche");
  });

  it("matches phrasing drift onto the right usual", () => {
    const m = matchUsual("the egg wrap with the pea protein again", usuals)!;
    expect(m.id).toBe("u1");
    expect(m.score).toBeGreaterThanOrEqual(0.8);
  });

  it("never crosses distinct foods sharing a generic word", () => {
    // "wrap" alone must not pull chicken wrap for an egg wrap (or reverse).
    const m = matchUsual("chicken wrap with hot sauce", usuals);
    expect(m?.id).toBe("u3");
    expect(matchUsual("veggie wrap", usuals)).toBeNull();
  });

  it("stays quiet on unrelated descriptions", () => {
    expect(matchUsual("grilled salmon with rice", usuals)).toBeNull();
    expect(matchUsual("", usuals)).toBeNull();
  });
});

// ─── history (2026-10-18) ────────────────────────────────────────────────
import {
  anchorEligible,
  foodNameOf,
  matchHistory,
  messageHasQuantity,
  usualPromotionEligible,
} from "@/lib/food-match";

const day = (d: string, h = 8) => new Date(`2026-10-${d}T${String(h).padStart(2, "0")}:00:00-05:00`);
const history = [
  { foodDescription: "Arepa con queso (1, ~80 g, queso campesino)", calories: 320, proteinG: 10, carbsG: 38, fatG: 12, loggedAt: day("01") },
  { foodDescription: "Arepa con queso (1, ~80 g)", calories: 330, proteinG: 10, carbsG: 38, fatG: 13, loggedAt: day("05") },
  { foodDescription: "Arepa con queso (1, ~80 g, queso campesino)", calories: 320, proteinG: 10, carbsG: 38, fatG: 12, loggedAt: day("09") },
  { foodDescription: "Patacones con hogao (3)", calories: 360, proteinG: 3, carbsG: 54, fatG: 16, loggedAt: day("02", 20) },
  { foodDescription: "Patacones con hogao (3)", calories: 360, proteinG: 3, carbsG: 54, fatG: 16, loggedAt: day("02", 21) },
  { foodDescription: "Chicken wrap", calories: 410, proteinG: 30, carbsG: 35, fatG: 14, loggedAt: day("03", 13) },
];

describe("foodNameOf", () => {
  it("drops the portion note in parentheses or after a dash", () => {
    expect(foodNameOf("Arepa con queso (1, ~80 g, queso campesino)")).toBe("Arepa con queso");
    expect(foodNameOf("Grilled chicken breast - 200 g")).toBe("Grilled chicken breast");
    expect(foodNameOf("Black coffee")).toBe("Black coffee");
  });
});

describe("matchHistory", () => {
  it("summarises the matching rows: count, distinct days, medians, spread, last", () => {
    const m = matchHistory("Arepa con queso (~1)", history)!;
    expect(m.count).toBe(3);
    expect(m.days).toBe(3);
    expect(m.medianKcal).toBe(320);
    expect(m.spreadPct).toBe(3);
    expect(m.lastKcal).toBe(320);
    expect(m.lastAt.startsWith("2026-10-09")).toBe(true);
    expect(m.medianProteinG).toBe(10);
  });
  it("counts two rows on one evening as ONE day", () => {
    const m = matchHistory("patacones con hogao", history)!;
    expect(m.count).toBe(2);
    expect(m.days).toBe(1);
  });
  it("never crosses foods that share a generic word", () => {
    expect(matchHistory("egg wrap", history)).toBeNull();
    expect(matchHistory("Chicken wrap (1)", history)?.count).toBe(1);
  });
  it("never lets a COMPONENT borrow a dish's history (the Phase 3 eval's Hogao and Arepa rows)", () => {
    expect(matchHistory("Hogao (~60 g)", history)).toBeNull();
    expect(matchHistory("Arepa (~50 g)", history)).toBeNull();
    expect(matchHistory("Patacones fritos (~45 g each)", history)).toBeNull();
  });
  it("ignores the default variety words the model adds", () => {
    expect(matchHistory("Arepa de maíz with queso campesino (~110 g)", history)?.count).toBe(3);
  });
  it("ignores vessel and portion words", () => {
    const soup = [{ foodDescription: "Sancocho de pollo (1 bowl)", calories: 550, proteinG: 40, carbsG: 50, fatG: 18, loggedAt: day("02", 13) }];
    expect(matchHistory("Sancocho de pollo, restaurant-style bowl (~550 g)", soup)?.count).toBe(1);
  });
  it("in message mode: the saved name must be inside the message, and only one food may qualify", () => {
    expect(matchHistory("Arepa con queso for breakfast, just one arepa", history, { mode: "message" })?.count).toBe(3);
    expect(matchHistory("arepa con queso and patacones con hogao", history, { mode: "message" })).toBeNull();
    expect(matchHistory("an arepa", history, { mode: "message" })).toBeNull();
  });
  it("never blends two foods into one median", () => {
    const rows = [...history, { foodDescription: "Arepa con queso y huevo", calories: 450, proteinG: 18, carbsG: 38, fatG: 22, loggedAt: day("10") }];
    expect(matchHistory("Arepa con queso (1)", rows)?.medianKcal).toBe(320);
  });
});

describe("the D3 gate — when the model may be handed a past number", () => {
  it("passes a stable three-day repeat with no quantity in the message", () => {
    const m = matchHistory("arepa con queso for breakfast", history, { mode: "message" });
    expect(anchorEligible(m, "arepa con queso for breakfast")).toBe(true);
    expect(usualPromotionEligible(m)).toBe(true);
  });
  it("refuses when the rows span fewer than three days", () => {
    const m = matchHistory("patacones con hogao", history);
    expect(anchorEligible(m, "patacones con hogao")).toBe(false);
    expect(usualPromotionEligible(m)).toBe(false);
  });
  it("refuses when the message states an amount (one-arepa history, two-arepa plate)", () => {
    const m = matchHistory("arepa con queso", history);
    for (const msg of ["two arepas con queso", "dos arepas con queso", "half an arepa con queso", "arepa con queso, 150 g", "a large arepa con queso"]) {
      expect(anchorEligible(m, msg), msg).toBe(false);
    }
  });
  it("refuses when the number has wandered", () => {
    const wide = history.map((r, i) => (i === 1 ? { ...r, calories: 480 } : r));
    const m = matchHistory("arepa con queso", wide)!;
    expect(m.spreadPct).toBeGreaterThan(25);
    expect(anchorEligible(m, "arepa con queso")).toBe(false);
  });
  it("knows what a quantity looks like, and that 'one' is not a different one", () => {
    expect(messageHasQuantity("arepa con queso, just one")).toBe(false);
    expect(messageHasQuantity("una arepa con queso")).toBe(false);
    expect(messageHasQuantity("3 eggs")).toBe(true);
    expect(messageHasQuantity("a cup and a half of rice")).toBe(true);
  });
});

// ─── "my usual" in any language (2026-10-20) ─────────────────────────────
import { mentionsUsual, usualsPromptNote } from "@/lib/food-match";

describe("mentionsUsual", () => {
  it("hears the ask in English and Spanish", () => {
    for (const m of ["my usual green morning shake", "the usual please", "lo de siempre", "el batido de siempre", "mi habitual"]) {
      expect(mentionsUsual(m), m).toBe(true);
    }
  });
  it("stays quiet otherwise (and 'unusual' is not 'usual')", () => {
    expect(mentionsUsual("two eggs and an arepa")).toBe(false);
    expect(mentionsUsual("an unusual lunch")).toBe(false);
  });
});

describe("usualsPromptNote", () => {
  it("lists names and numbers, per serving for a label product", () => {
    const note = usualsPromptNote([
      { foodDescription: "Batido verde", calories: 310.4, proteinG: 32, carbsG: 28, fatG: 6, kind: "meal" },
      { foodDescription: "Greek yogurt", calories: 53, proteinG: 8.1, carbsG: 5.1, fatG: 0, kind: "product", servingLabel: "100 g" },
    ]);
    expect(note).toContain('"Batido verde" (310 kcal, 32P/28C/6F)');
    expect(note).toContain('"Greek yogurt" (53 kcal per 100 g, 8P/5C/0F)');
    expect(note).toContain("exactly that name");
  });
  it("is empty when there are no usuals, and caps the list", () => {
    expect(usualsPromptNote([])).toBe("");
    const many = Array.from({ length: 30 }, (_, i) => ({ foodDescription: `Food ${i}`, calories: 1, proteinG: 0, carbsG: 0, fatG: 0 }));
    expect(usualsPromptNote(many, 5).match(/"Food/g)).toHaveLength(5);
  });
});
