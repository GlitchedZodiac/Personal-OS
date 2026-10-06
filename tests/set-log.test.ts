import { describe, expect, it } from "vitest";
import {
  composeExercises,
  countedEntries,
  isSetLog,
  withGaps,
  type SetLogEntry,
} from "@/lib/set-log";

let seq = 0;
/** A voice entry at elapsed second `t`; override whatever the case is about. */
function entry(t: number, fields: Partial<SetLogEntry> = {}): SetLogEntry {
  seq += 1;
  return { id: `e${seq}`, t, source: "voice", status: "ok", name: "Kettlebell Swing", exercise: "kb-swing", reps: 10, ...fields };
}

const pushUp = { name: "Push-Up", exercise: "push-up" };

describe("countedEntries", () => {
  it("counts ok and review, nothing else", () => {
    const log = [
      entry(10, { status: "ok" }),
      entry(20, { status: "review" }),
      entry(30, { status: "queued" }),
      entry(40, { status: "failed" }),
      entry(50, { status: "undone" }),
    ];
    expect(countedEntries(log).map((e) => e.status)).toEqual(["ok", "review"]);
  });

  it("keeps the caller's order and objects", () => {
    const log = [entry(50), entry(10)];
    const counted = countedEntries(log);
    expect(counted).toEqual(log);
    expect(counted[0]).toBe(log[0]);
  });
});

describe("withGaps", () => {
  it("stamps the seconds since the previous counted entry, none on the first", () => {
    const stamped = withGaps([entry(30), entry(95), entry(200)]);
    expect(stamped[0]).not.toHaveProperty("gapSeconds");
    expect(stamped.map((e) => e.gapSeconds)).toEqual([undefined, 65, 105]);
  });

  it("sorts by elapsed time before measuring", () => {
    const stamped = withGaps([entry(200, { id: "c" }), entry(30, { id: "a" }), entry(95, { id: "b" })]);
    expect(stamped.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(stamped.map((e) => e.gapSeconds)).toEqual([undefined, 65, 105]);
  });

  it("measures across dropped entries, not from them", () => {
    const stamped = withGaps([
      entry(30, { id: "a" }),
      entry(60, { id: "undone", status: "undone" }),
      entry(70, { id: "failed", status: "failed" }),
      entry(80, { id: "queued", status: "queued" }),
      entry(120, { id: "b", status: "review" }),
    ]);
    expect(stamped.map((e) => e.id)).toEqual(["a", "b"]);
    expect(stamped[1].gapSeconds).toBe(90);
  });

  it("replaces a stale gap the sender stamped", () => {
    const stamped = withGaps([entry(30, { gapSeconds: 999 }), entry(50, { gapSeconds: 999 })]);
    expect(stamped[0]).not.toHaveProperty("gapSeconds");
    expect(stamped[1].gapSeconds).toBe(20);
  });

  it("returns new objects and leaves the input alone", () => {
    const log = [entry(95), entry(30)];
    const before = JSON.parse(JSON.stringify(log));
    const stamped = withGaps(log);
    expect(log).toEqual(before);
    expect(stamped[0]).not.toBe(log[1]);
    expect(stamped[1]).not.toBe(log[0]);
  });

  it("keeps sent order for entries in the same second and rounds fractions", () => {
    const stamped = withGaps([entry(10, { id: "first" }), entry(10, { id: "second" }), entry(40.6, { id: "third" })]);
    expect(stamped.map((e) => e.id)).toEqual(["first", "second", "third"]);
    expect(stamped.map((e) => e.gapSeconds)).toEqual([undefined, 0, 31]);
  });

  it("handles an empty log", () => {
    expect(withGaps([])).toEqual([]);
  });
});

describe("composeExercises", () => {
  it("merges consecutive identical entries into sets", () => {
    expect(composeExercises([entry(30), entry(120)])).toEqual([
      { name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10 },
    ]);
  });

  it("keeps non-consecutive repeats as separate rows, in time order", () => {
    const rows = composeExercises([entry(30), entry(90, pushUp), entry(150)]);
    expect(rows.map((r) => [r.exercise, r.sets])).toEqual([
      ["kb-swing", 1],
      ["push-up", 1],
      ["kb-swing", 1],
    ]);
  });

  it("orders by elapsed time, not by the order sent", () => {
    const rows = composeExercises([entry(150, pushUp), entry(30), entry(90)]);
    expect(rows.map((r) => [r.exercise, r.sets])).toEqual([
      ["kb-swing", 2],
      ["push-up", 1],
    ]);
  });

  it("an entry's own sets counts as that many", () => {
    expect(composeExercises([entry(30, { sets: 3 })])[0].sets).toBe(3);
    expect(composeExercises([entry(30, { sets: 3 }), entry(90), entry(150, { sets: 2 })])[0].sets).toBe(6);
  });

  it("ignores a nonsense set count", () => {
    expect(composeExercises([entry(30, { sets: 0 }), entry(90, { sets: Number.NaN })])[0].sets).toBe(2);
  });

  it.each<[string, Partial<SetLogEntry>]>([
    ["reps", { reps: 12 }],
    ["weight", { weightKg: 24 }],
    ["seconds", { seconds: 30 }],
    ["per side", { perSide: true }],
    ["a vest", { load: { type: "vest", kg: 5 } }],
    ["movement", pushUp],
  ])("different %s splits the row", (_label, change) => {
    expect(composeExercises([entry(30), entry(90, change)])).toHaveLength(2);
  });

  it("splits on a different vest weight but not on whether it was assumed", () => {
    const vest = (kg: number, assumed?: boolean): Partial<SetLogEntry> => ({
      load: assumed ? { type: "vest", kg, assumed } : { type: "vest", kg },
    });
    expect(composeExercises([entry(30, vest(5)), entry(90, vest(10))])).toHaveLength(2);
    const merged = composeExercises([entry(30, vest(5, true)), entry(90, vest(5, true))]);
    expect(merged).toEqual([
      { name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10, load: { type: "vest", kg: 5, assumed: true } },
    ]);
    // Once he states the weight for one of the sets, the row is no longer a guess.
    const stated = composeExercises([entry(30, vest(5, true)), entry(90, vest(5))]);
    expect(stated).toHaveLength(1);
    expect(stated[0].load).toEqual({ type: "vest", kg: 5 });
  });

  it("carries weight, per-side and seconds onto the row", () => {
    const rows = composeExercises([
      entry(30, { weightKg: 24, perSide: true }),
      entry(90, { weightKg: 24, perSide: true }),
      entry(150, { name: "Plank", exercise: "plank", reps: undefined, seconds: 45 }),
    ]);
    expect(rows).toEqual([
      { name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10, weightKg: 24, perSide: true },
      { name: "Plank", exercise: "plank", sets: 1, seconds: 45 },
    ]);
  });

  it("omits absent values instead of writing undefined keys", () => {
    const [row] = composeExercises([
      entry(30, { exercise: undefined, name: "Bear Crawl", reps: undefined, perSide: false }),
    ]);
    expect(Object.keys(row).sort()).toEqual(["name", "sets"]);
    expect(row).toEqual({ name: "Bear Crawl", sets: 1 });
  });

  it("merges unknown movements by folded name", () => {
    const unknown = (name: string): Partial<SetLogEntry> => ({ name, exercise: undefined });
    const rows = composeExercises([entry(30, unknown("Bear Crawl")), entry(90, unknown("bear-crawl"))]);
    expect(rows).toEqual([{ name: "Bear Crawl", sets: 2, reps: 10 }]);
    expect(composeExercises([entry(30, unknown("Bear Crawl")), entry(90, unknown("Crab Walk"))])).toHaveLength(2);
  });

  it("merges on the exercise id even when the spoken names differ", () => {
    const rows = composeExercises([entry(30), entry(90, { name: "KB Swing" })]);
    expect(rows).toEqual([{ name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10 }]);
  });

  it("excludes undone, failed and queued entries — and merges across the gap they leave", () => {
    const rows = composeExercises([
      entry(30),
      entry(60, { ...pushUp, status: "undone" }),
      entry(70, { ...pushUp, status: "failed" }),
      entry(80, { ...pushUp, status: "queued" }),
      entry(120),
    ]);
    expect(rows).toEqual([{ name: "Kettlebell Swing", exercise: "kb-swing", sets: 2, reps: 10 }]);
  });

  it("counts entries still waiting for review", () => {
    const rows = composeExercises([entry(30, { status: "review" }), entry(90, { status: "ok" })]);
    expect(rows[0].sets).toBe(2);
  });

  it("returns nothing for an empty or fully-undone log", () => {
    expect(composeExercises([])).toEqual([]);
    expect(composeExercises([entry(30, { status: "undone" })])).toEqual([]);
  });

  it("does not mutate the log", () => {
    const log = [entry(90, { load: { type: "vest", kg: 5, assumed: true } }), entry(30)];
    const before = JSON.parse(JSON.stringify(log));
    composeExercises(log);
    expect(log).toEqual(before);
  });
});

describe("isSetLog", () => {
  it("accepts an array of entries, extra keys and all", () => {
    expect(isSetLog([entry(30), { ...entry(60), somethingNew: true }])).toBe(true);
    expect(isSetLog([{ id: "a", name: "Swing" }])).toBe(true);
    expect(isSetLog([])).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["an object", { id: "a", name: "Swing" }],
    ["a string", "log"],
    ["an array of strings", ["swing"]],
    ["an array holding null", [null]],
    ["an entry with no id", [{ name: "Swing" }]],
    ["an entry with no name", [{ id: "a" }]],
    ["a numeric id", [{ id: 1, name: "Swing" }]],
    ["one bad entry among good ones", [{ id: "a", name: "Swing" }, { id: "b" }]],
    ["a composed exercises list", [{ name: "Kettlebell Swing", sets: 3, reps: 10 }]],
  ])("rejects %s", (_label, value) => {
    expect(isSetLog(value)).toBe(false);
  });
});
