import { describe, expect, it } from "vitest";
import { applyOutbox } from "@/lib/ink-outbox";
import type { PageObject, Stroke } from "@/lib/ink";

/**
 * The fold that makes a recovered page show his work.
 *
 * On 2026-08-30 a paragraph was lost because unsaved strokes lived only in memory. The outbox
 * makes them durable; this is the half that makes them VISIBLE again — if the fold were wrong,
 * his ink would be safe on disk and still absent from the page, which is the same thing to him.
 */
const s = (id: string): Stroke => ({ id, tool: "gpen", color: "#000", width: 2, opacity: 1, pts: [{ x: 0, y: 0, p: 0.5, t: 0 }] } as Stroke);
const row = (seq: number, d: { append?: Stroke[]; remove?: string[]; objects?: PageObject[] }) => ({ seq, pageId: "p", t: seq, ...d });

describe("applyOutbox — unsent work reappears exactly as he left it", () => {
  it("adds strokes the server has never seen", () => {
    const out = applyOutbox([s("a")], [], [row(1, { append: [s("b"), s("c")] })]);
    expect(out.strokes.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("is idempotent — replaying an entry the server already took changes nothing", () => {
    // the server dedupes appends by id, so the log may legitimately hold a confirmed entry
    const out = applyOutbox([s("a"), s("b")], [], [row(1, { append: [s("b")] })]);
    expect(out.strokes.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("honours an erase that never reached the server", () => {
    const out = applyOutbox([s("a"), s("b")], [], [row(1, { remove: ["a"] })]);
    expect(out.strokes.map((x) => x.id)).toEqual(["b"]);
  });

  it("REGRESSION: applies entries in order, so a stroke drawn then erased stays erased", () => {
    // merging these into one request would apply the remove first and resurrect it — the reason
    // flushOutbox sends one PATCH per entry rather than folding them together
    const out = applyOutbox([], [], [row(1, { append: [s("x")] }), row(2, { remove: ["x"] })]);
    expect(out.strokes).toEqual([]);
  });

  it("...and erased-then-redrawn stays drawn", () => {
    const out = applyOutbox([s("x")], [], [row(1, { remove: ["x"] }), row(2, { append: [s("x")] })]);
    expect(out.strokes.map((x) => x.id)).toEqual(["x"]);
  });

  it("objects are a whole-array replace — the newest entry wins", () => {
    const o1 = [{ id: "o1", type: "text" }] as unknown as PageObject[];
    const o2 = [{ id: "o1", type: "text" }, { id: "o2", type: "refcard" }] as unknown as PageObject[];
    const out = applyOutbox([], [], [row(1, { objects: o1 }), row(2, { objects: o2 })]);
    expect(out.objects.map((x) => x.id)).toEqual(["o1", "o2"]);
  });

  it("an empty log leaves the server's copy untouched", () => {
    const strokes = [s("a"), s("b")];
    const out = applyOutbox(strokes, [], []);
    expect(out.strokes.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("never mutates the array the caller passed in", () => {
    const original = [s("a")];
    applyOutbox(original, [], [row(1, { append: [s("b")] })]);
    expect(original.map((x) => x.id)).toEqual(["a"]);
  });
});
