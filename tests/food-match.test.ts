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
