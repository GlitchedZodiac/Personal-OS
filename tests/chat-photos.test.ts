import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_IMAGES,
  buildChatUserContent,
  photoPlaceholder,
  sanitizeImages,
} from "@/lib/chat-photos";
import { MAX_SHOTS, fitLongEdge, fitShortEdge, payloadChars, roomFor } from "@/lib/photo-capture";

const img = (n: number) => `data:image/jpeg;base64,FRAME${n}`;

describe("buildChatUserContent — several photos, one meal", () => {
  it("sends every photo in ONE user turn", () => {
    const frames = [img(1), img(2), img(3), img(4)];
    const content = buildChatUserContent("lunch", frames);
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string; image_url?: string; text?: string }>;
    // one text part, then all four frames, in the order they were taken
    expect(parts.filter((p) => p.type === "input_text")).toHaveLength(1);
    expect(parts.filter((p) => p.type === "input_image").map((p) => p.image_url)).toEqual(frames);
  });

  it("tells the model the frames belong together", () => {
    const [text] = buildChatUserContent("lunch", [img(1), img(2)]) as Array<{ text?: string }>;
    expect(text.text).toContain("lunch");
    expect(text.text).toContain("ONE meal");
    expect(text.text).toContain("2 photos");
  });

  it("leaves a single photo, and plain text, alone", () => {
    const [text] = buildChatUserContent("this label", [img(1)]) as Array<{ text?: string }>;
    expect(text.text).toBe("this label");
    expect(buildChatUserContent("just words", [])).toBe("just words");
  });

  it("keeps what is stored short — the stage direction is model-only", () => {
    expect(photoPlaceholder(1)).toBe("(photo — log what you see)");
    expect(photoPlaceholder(3)).toBe("(3 photos — log what you see)");
    expect(photoPlaceholder(3)).not.toContain("ONE meal");
  });
});

describe("sanitizeImages", () => {
  it("caps a message at one capture's worth and drops anything that is not an image", () => {
    expect(MAX_CHAT_IMAGES).toBe(MAX_SHOTS);
    const many = Array.from({ length: 9 }, (_, i) => img(i));
    expect(sanitizeImages(many)).toHaveLength(MAX_SHOTS);
    expect(sanitizeImages([img(1), "https://example.com/x.jpg", 42, null])).toEqual([img(1)]);
    expect(sanitizeImages("nope")).toEqual([]);
  });
});

describe("photo sizing", () => {
  it("fits the long edge without ever scaling up", () => {
    expect(fitLongEdge(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitLongEdge(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitLongEdge(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("fits the short edge for the square-cropped thumbnail", () => {
    expect(fitShortEdge(1280, 960, 220)).toEqual({ width: 293, height: 220 });
    expect(fitShortEdge(960, 1280, 220)).toEqual({ width: 220, height: 293 });
  });

  it("survives a zero-sized image", () => {
    expect(fitLongEdge(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });
});

describe("the tray", () => {
  it("accepts only what still fits and reports what it turned away", () => {
    expect(roomFor(0, 3)).toEqual({ accept: 3, dropped: 0 });
    expect(roomFor(4, 5)).toEqual({ accept: 2, dropped: 3 });
    expect(roomFor(6, 1)).toEqual({ accept: 0, dropped: 1 });
  });

  it("adds up what a message will weigh", () => {
    expect(payloadChars([{ full: "abcd" }, { full: "ef" }])).toBe(6);
  });
});
