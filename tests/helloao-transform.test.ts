import { describe, expect, it } from "vitest";
import { resolveHelloaoRef, transformHelloaoChapter, type HelloaoChapter } from "@/lib/helloao";
import { transformApiBibleText } from "@/lib/apibible";
import { refInt } from "@/lib/bible-refs";

// John 3-ish shape, with a heading before v1 and poetry in v3
const CH: HelloaoChapter = {
  chapter: {
    content: [
      { type: "heading", content: ["You Must Be Born Again"] },
      { type: "verse", number: 1, content: ["Now there was a man of the Pharisees named Nicodemus."] },
      { type: "verse", number: 2, content: ["This man came to Jesus by night ", { text: "and said to him." }] },
      {
        type: "verse",
        number: 3,
        content: [
          { text: "Truly, truly, I say to you,", poem: 1 },
          { text: "unless one is born again", poem: 2 },
          { text: "he cannot see the kingdom of God.", poem: 2 },
        ],
      },
      { type: "verse", number: 4, content: ["Nicodemus said to him."] },
    ],
  },
};

describe("resolveHelloaoRef", () => {
  it("whole chapter", () => {
    expect(resolveHelloaoRef("john 3")).toEqual({ book: 43, chapter: 3, fromVerse: null, toVerse: null });
  });
  it("single verse", () => {
    expect(resolveHelloaoRef("eph 2:6")).toEqual({ book: 49, chapter: 2, fromVerse: 6, toVerse: 6 });
  });
  it("verse range", () => {
    const r = resolveHelloaoRef("ps 119:9-16");
    expect(r).toMatchObject({ book: 19, chapter: 119, fromVerse: 9, toVerse: 16 });
  });
  it("numbered book without a space — the placeholder's own example", () => {
    expect(resolveHelloaoRef("1co 13")).toMatchObject({ book: 46, chapter: 13 });
  });
  it("gibberish → null", () => {
    expect(resolveHelloaoRef("xyzzy 99")).toBeNull();
  });
});

describe("transformHelloaoChapter", () => {
  const ref = { book: 43, chapter: 3, fromVerse: null, toVerse: null };

  it("mints canonical refInts", () => {
    const m = transformHelloaoChapter("kjv:john 3", CH, ref);
    expect(m.verses.map((v) => v.refInt)).toEqual([refInt(43, 3, 1), refInt(43, 3, 2), refInt(43, 3, 3), refInt(43, 3, 4)]);
    expect(m.canonical).toBe("John 3");
  });

  it("a heading attaches to the FOLLOWING verse only", () => {
    const m = transformHelloaoChapter("k", CH, ref);
    expect(m.verses[0].heading).toBe("You Must Be Born Again");
    expect(m.verses[1].heading).toBeUndefined();
  });

  it("mixed string/object content joins cleanly", () => {
    const m = transformHelloaoChapter("k", CH, ref);
    expect(m.verses[1].text).toBe("This man came to Jesus by night and said to him.");
  });

  it("poetry becomes lines for the reader's hanging-indent branch", () => {
    const m = transformHelloaoChapter("k", CH, ref);
    expect(m.verses[2].lines).toEqual([
      "Truly, truly, I say to you,",
      "unless one is born again",
      "he cannot see the kingdom of God.",
    ]);
  });

  it("a verse window keeps only the asked-for verses", () => {
    const m = transformHelloaoChapter("k", CH, { book: 43, chapter: 3, fromVerse: 2, toVerse: 3 });
    expect(m.verses.map((v) => v.verseNum)).toEqual([2, 3]);
    expect(m.canonical).toBe("John 3:2–3");
    // and the heading from before the window does not leak in
    expect(m.verses[0].heading).toBeUndefined();
  });
});

describe("transformApiBibleText", () => {
  it("bracketed verse numbers → verses with refInts", () => {
    const m = transformApiBibleText(
      "rvr60:john 3",
      { content: "[1] Había un hombre de los fariseos. [2] Este vino a Jesús de noche.", fumsToken: "tok", canonical: "Juan 3" },
      { book: 43, chapter: 3 },
    );
    expect(m.verses).toHaveLength(2);
    expect(m.verses[0]).toMatchObject({ refInt: refInt(43, 3, 1), verseNum: 1 });
    expect(m.verses[1].text).toBe("Este vino a Jesús de noche.");
    expect(m.canonical).toBe("Juan 3");
  });
});
