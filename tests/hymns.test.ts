import { describe, expect, it } from "vitest";
import { parseHymn, firstLine } from "@/lib/hymns";

const HYMN = [
  "Venid al Padre del Señor,",
  "En Cristo Él nos dio bendición.",
  "",
  "Coro:",
  "Te daremos la gloria",
  "Por Tu gracia y amor.",
  "",
  "Venid creyentes del Señor,",
  "El sello de Su Espíritu.",
].join("\n");

describe("parseHymn", () => {
  it("blank lines split stanzas; a lone label attaches to the FOLLOWING stanza", () => {
    const s = parseHymn(HYMN);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ label: null, lines: ["Venid al Padre del Señor,", "En Cristo Él nos dio bendición."] });
    expect(s[1].label).toBe("Coro");
    expect(s[1].lines).toEqual(["Te daremos la gloria", "Por Tu gracia y amor."]);
    expect(s[2].label).toBeNull();
  });

  it("a label leading its own block also labels it", () => {
    const s = parseHymn("Chorus:\nGlory to God\nForever amen");
    expect(s).toEqual([{ label: "Chorus", lines: ["Glory to God", "Forever amen"] }]);
  });

  it("CRLF and 3+ newlines normalize", () => {
    const s = parseHymn("line one\r\n\r\n\r\n\r\nline two");
    expect(s).toHaveLength(2);
  });

  it("Estribillo counts as a chorus label", () => {
    const s = parseHymn("Uno dos\n\nEstribillo\nAleluya");
    expect(s[1].label).toBe("Estribillo");
  });

  it("empty input is safe", () => {
    expect(parseHymn("")).toEqual([]);
    expect(firstLine("")).toBe("");
  });
});

describe("firstLine", () => {
  it("is the first sung line, not a label", () => {
    expect(firstLine(HYMN)).toBe("Venid al Padre del Señor,");
    expect(firstLine("Coro:\nSolo el coro")).toBe("Solo el coro");
  });
});
