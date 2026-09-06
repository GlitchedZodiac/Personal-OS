import { describe, expect, it } from "vitest";
import { worksheetObjects, transcriptText } from "@/lib/spirit-recording-actions";

describe("worksheetObjects — questions become a page, deterministically", () => {
  it("lays a header then one prompt per question, stacked with room", () => {
    const objs = worksheetObjects(
      { kicker: "SERMON · SEP 6", title: "Sin still persists", aim: "retain the argument" },
      [
        { label: "WHAT WAS THE BIG IDEA?", kind: "lines", lines: 3 },
        { label: "THE PASSAGE PREACHED", kind: "field", lines: 0 },
        { label: "MAP THE ARGUMENT", kind: "sketch", lines: 0 },
      ],
    );
    expect(objs).toHaveLength(4);
    expect(objs[0].type).toBe("header");
    expect(objs.slice(1).every((o) => o.type === "prompt")).toBe(true);
    for (let i = 2; i < objs.length; i++) {
      expect(objs[i].y).toBeGreaterThan(objs[i - 1].y + (objs[i - 1].h ?? 0));
    }
    expect((objs[3].data as { sketch?: boolean }).sketch).toBe(true);
  });

  it("caps at 7 questions and clamps ruled lines to 2..6", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `Q${i}`, kind: "lines" as const, lines: 40 }));
    const objs = worksheetObjects({ kicker: "K", title: "T", aim: "" }, many);
    expect(objs).toHaveLength(8);
    expect((objs[1].data as { lines?: number }).lines).toBe(6);
  });
});

describe("transcriptText", () => {
  it("stamps minutes and folds glosses in", () => {
    const t = transcriptText({ transcript: [{ start: 65, end: 70, text: "El pecado persiste", gloss: "Sin persists" }] });
    expect(t).toContain("[1:05] El pecado persiste");
    expect(t).toContain("(EN: Sin persists)");
  });
  it("empty transcript is empty text", () => {
    expect(transcriptText({ transcript: [] })).toBe("");
  });
});
