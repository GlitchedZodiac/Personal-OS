import { describe, expect, it } from "vitest";
import { normalizeFoodDescription, normalizeFoodSource, sourceFromChat } from "@/lib/food-normalize";

describe("normalizeFoodSource — a closed vocabulary with the caller's fallback", () => {
  it("accepts the seven real sources and import", () => {
    for (const s of ["chat", "voice", "photo", "label", "usual", "mcp", "manual", "import"]) {
      expect(normalizeFoodSource(s, "voice")).toBe(s);
    }
  });
  it("maps the chat page's 'text' to chat and anything unknown to the fallback", () => {
    expect(normalizeFoodSource("text", "voice")).toBe("chat");
    expect(normalizeFoodSource(" VOICE ", "manual")).toBe("voice");
    expect(normalizeFoodSource("ai", "voice")).toBe("voice");
    expect(normalizeFoodSource(undefined, "manual")).toBe("manual");
    expect(normalizeFoodSource(42, "voice")).toBe("voice");
  });
  it("derives the row's source from the chat message's", () => {
    expect(sourceFromChat("voice")).toBe("voice");
    expect(sourceFromChat("photo")).toBe("photo");
    expect(sourceFromChat("text")).toBe("chat");
  });
});

describe("normalizeFoodDescription — his words, minus keyboard and model noise", () => {
  it("trims, collapses spaces, strips a trailing full stop, capitalises the first letter", () => {
    expect(normalizeFoodDescription("  arepa con   queso (1, ~80 g). ")).toBe("Arepa con queso (1, ~80 g)");
  });
  it("keeps accents, Spanish, and an exclamation he may have meant", () => {
    expect(normalizeFoodDescription("ñame cocido!")).toBe("Ñame cocido!");
    expect(normalizeFoodDescription("Jugo de lulo")).toBe("Jugo de lulo");
  });
  it("closes a parenthesis the model dropped", () => {
    expect(normalizeFoodDescription("Bandeja paisa (full plate")).toBe("Bandeja paisa (full plate)");
  });
  it("returns an empty string for a non-string", () => {
    expect(normalizeFoodDescription(null)).toBe("");
  });
});
