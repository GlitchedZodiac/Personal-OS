import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCustomExercises } from "@/lib/exercises";
import {
  matchSpokenExercise,
  parseVoiceEntries,
  voiceDisplayLine,
  type ParsedVoiceEntry,
  type VoiceParseOptions,
} from "@/lib/voice-entry-parser";

/** The single entry a phrase must produce. */
function only(said: string, opts?: VoiceParseOptions): ParsedVoiceEntry {
  const { entries } = parseVoiceEntries(said, opts);
  expect(entries).toHaveLength(1);
  return entries[0];
}

const ids = (said: string) => parseVoiceEntries(said).entries.map((e) => e.exercise);

afterEach(() => setCustomExercises([]));

describe("reps", () => {
  it.each<[string, string, number]>([
    ["10 kettlebell swings", "kb-swing", 10],
    ["10 Kettlebell Swings!", "kb-swing", 10],
    ["10 push-ups", "push-up", 10],
    ["ten pushups", "push-up", 10],
    ["12 pull-ups", "pull-up", 12],
    ["20 burpees", "burpee", 20],
    ["swings 10", "kb-swing", 10],
    ["swings times 10", "kb-swing", 10],
    ["swings x 10", "kb-swing", 10],
    ["swings for 10", "kb-swing", 10],
    ["swings 10 reps", "kb-swing", 10],
    ["10 reps of swings", "kb-swing", 10],
    ["did 10 swings", "kb-swing", 10],
    ["just did ten push-ups", "push-up", 10],
    ["I did 10 swings", "kb-swing", 10],
    ["okay, 10 swings", "kb-swing", 10],
    ["um 10 swings", "kb-swing", 10],
    ["log 10 swings", "kb-swing", 10],
    ["that was 10 swings", "kb-swing", 10],
    ["another set of 10 swings", "kb-swing", 10],
    ["10 more swings", "kb-swing", 10],
    ["10 goblet squats", "kb-goblet-squat", 10],
    ["5 turkish get-ups", "kb-turkish-get-up", 5],
    ["1 turkish get up", "kb-turkish-get-up", 1],
  ])("%s → %s ×%i, confident", (said, exercise, reps) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, reps, needsReview: false });
    expect(result.entries[0]).not.toHaveProperty("sets");
    expect(result.entries[0]).not.toHaveProperty("weightKg");
    expect(result.confident).toBe(true);
  });

  it.each<[string, number]>([
    ["eleven swings", 11],
    ["nineteen swings", 19],
    ["twenty swings", 20],
    ["twenty four swings", 24],
    ["twenty-four swings", 24],
    ["thirty swings", 30],
    ["ninety nine swings", 99],
    ["a hundred swings", 100],
    ["one hundred swings", 100],
    ["a hundred and twenty swings", 120],
    ["a dozen swings", 12],
    ["two dozen swings", 24],
    ["a couple of swings", 2],
    ["a couple swings", 2],
  ])("number words: %s → %i", (said, reps) => {
    expect(only(said)).toMatchObject({ exercise: "kb-swing", reps, needsReview: false });
  });

  it("leaves number words that belong to a movement name alone", () => {
    expect(only("one arm swing 10")).toMatchObject({ exercise: "kb-one-arm-swing", reps: 10 });
    expect(only("two hand swing 15")).toMatchObject({ exercise: "kb-swing", reps: 15 });
  });

  it("a number with no exercise is kept as unparsed, never guessed", () => {
    const entry = only("another 10");
    expect(entry).toMatchObject({ name: "", reps: 10, needsReview: true, reason: "unparsed", matchedBy: "none" });
    expect(entry).not.toHaveProperty("exercise");
    expect(entry.confidence).toBeLessThanOrEqual(0.4);
  });

  it("drops a rep count that cannot be real instead of passing it on", () => {
    const entry = only("zero swings");
    expect(entry).not.toHaveProperty("reps");
    expect(entry.needsReview).toBe(true);
  });
});

describe("sets and rounds", () => {
  it.each<[string, Partial<ParsedVoiceEntry>]>([
    ["3 sets of 10 push-ups", { exercise: "push-up", sets: 3, reps: 10 }],
    ["3 by 10 push-ups", { exercise: "push-up", sets: 3, reps: 10 }],
    ["3x10 push ups", { exercise: "push-up", sets: 3, reps: 10 }],
    ["3 x 10 push ups", { exercise: "push-up", sets: 3, reps: 10 }],
    ["3 times 10 push-ups", { exercise: "push-up", sets: 3, reps: 10 }],
    ["10 push ups for 3 sets", { exercise: "push-up", sets: 3, reps: 10 }],
    ["10 swings 3 sets", { exercise: "kb-swing", sets: 3, reps: 10 }],
    ["10 swings, 3 sets", { exercise: "kb-swing", sets: 3, reps: 10 }],
    ["5 rounds of 10 swings", { exercise: "kb-swing", sets: 5, reps: 10 }],
    ["2 sets of 30 second plank", { exercise: "plank", sets: 2, seconds: 30 }],
    ["plank 30 seconds 3 times", { exercise: "plank", sets: 3, seconds: 30 }],
    ["5 by 5 deadlifts at 100 kilos", { exercise: "deadlift", sets: 5, reps: 5, weightKg: 100 }],
  ])("%s", (said, expected) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject(expected);
    expect(result.confident).toBe(true);
  });

  it("sets are absent unless stated", () => {
    expect(only("10 swings")).not.toHaveProperty("sets");
  });

  it.each([
    "5 rounds of 10 swings and 5 push-ups",
    "5 rounds, 10 swings, 5 push ups",
    "10 swings and 5 push ups, 5 rounds",
    "5 rounds 10 swings 5 push ups",
  ])("rounds cover every movement: %s", (said) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ exercise: "kb-swing", sets: 5, reps: 10 });
    expect(result.entries[1]).toMatchObject({ exercise: "push-up", sets: 5, reps: 5 });
    expect(result.confident).toBe(true);
  });

  it("'sets of' stays with its own movement", () => {
    const { entries } = parseVoiceEntries("3 sets of 10 swings and 10 push-ups");
    expect(entries[0]).toMatchObject({ exercise: "kb-swing", sets: 3, reps: 10 });
    expect(entries[1]).toMatchObject({ exercise: "push-up", reps: 10 });
    expect(entries[1]).not.toHaveProperty("sets");
  });

  it("a set count with no movement or reps asks for review", () => {
    expect(only("3 sets of swings")).toMatchObject({ exercise: "kb-swing", sets: 3, reason: "no_quantity" });
    expect(only("5 rounds")).toMatchObject({ name: "", sets: 5, reason: "unparsed" });
  });
});

describe("several movements in one clip", () => {
  it.each<[string, string[]]>([
    ["10 swings and 10 push-ups", ["kb-swing", "push-up"]],
    ["10 swings then 10 push-ups", ["kb-swing", "push-up"]],
    ["10 swings, 10 push-ups", ["kb-swing", "push-up"]],
    ["10 swings plus 10 push-ups", ["kb-swing", "push-up"]],
    ["10 swings and then 10 push-ups", ["kb-swing", "push-up"]],
    ["10 swings followed by 10 push ups", ["kb-swing", "push-up"]],
    ["10 swings. 10 push ups.", ["kb-swing", "push-up"]],
    ["10 swings 10 push ups", ["kb-swing", "push-up"]],
    ["10 swings 10 goblet squats 10 push ups", ["kb-swing", "kb-goblet-squat", "push-up"]],
    ["10 swings then 10 push-ups, 5 burpees plus 20 squats", ["kb-swing", "push-up", "burpee", "back-squat"]],
    ["5 pull ups, 10 push ups, 15 squats", ["pull-up", "push-up", "back-squat"]],
    ["2 minute plank and 20 push ups", ["plank", "push-up"]],
    ["10 dips and 10 chin ups", ["dip", "pull-up"]],
    ["10 cleans and 10 presses", ["kb-clean", "kb-press"]],
  ])("%s", (said, expected) => {
    expect(ids(said)).toEqual(expected);
  });

  it.each<[string, string[]]>([
    ["5 clean and press", ["kb-clean-and-press"]],
    ["5 clean & press", ["kb-clean-and-press"]],
    ["5 cleans and presses", ["kb-clean-and-press"]],
    ["5 clean and press and 5 snatches", ["kb-clean-and-press", "kb-snatch"]],
    ["10 kettlebell clean and press", ["kb-clean-and-press"]],
    ["cinco cargada y press", ["kb-clean-and-press"]],
  ])("does not split inside a known name: %s", (said, expected) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map((e) => e.exercise)).toEqual(expected);
    expect(result.confident).toBe(true);
  });

  it("'clean and jerk' stays one movement even though the catalog has no row for it", () => {
    expect(parseVoiceEntries("5 clean and jerk").entries).toHaveLength(1);
  });

  it("a custom name containing 'and' is protected too", () => {
    setCustomExercises([{ id: "squat-and-reach", name: "Squat and Reach", category: "bodyweight", aliases: [] }]);
    expect(only("10 squat and reach")).toMatchObject({ exercise: "squat-and-reach", reps: 10 });
    expect(ids("10 squats and 10 push ups")).toEqual(["back-squat", "push-up"]);
  });

  it("a trailing load belongs to the movement it follows", () => {
    const { entries } = parseVoiceEntries("10 squats and 10 push-ups with a vest");
    expect(entries[0]).not.toHaveProperty("load");
    expect(entries[1].load).toEqual({ type: "vest", kg: 5, assumed: true });
  });

  it.each([
    "10 squats and 10 push-ups all with a vest",
    "10 squats, 10 push ups, all in a vest",
    "with the vest on, 10 squats and 10 push-ups",
  ])("a clearly global vest covers every movement: %s", (said) => {
    const { entries } = parseVoiceEntries(said);
    expect(entries.map((e) => e.exercise)).toEqual(["back-squat", "push-up"]);
    for (const entry of entries) expect(entry.load).toEqual({ type: "vest", kg: 5, assumed: true });
  });

  it("a clearly global weight covers every movement", () => {
    const { entries } = parseVoiceEntries("10 swings and 10 goblet squats both with the 24");
    expect(entries.map((e) => e.weightKg)).toEqual([24, 24]);
  });

  it("a load phrase after 'and' joins the movement before it", () => {
    for (const said of [
      "10 squats with a vest and a 24 kilo kettlebell",
      "10 squats with a 24 kilo kettlebell and a vest",
    ]) {
      expect(only(said)).toMatchObject({
        exercise: "back-squat",
        reps: 10,
        weightKg: 24,
        load: { type: "vest", kg: 5, assumed: true },
      });
    }
  });

  it("a leftover fragment is surfaced, so the clip is not called confident", () => {
    const result = parseVoiceEntries("10 swings and bear crawls");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ exercise: "kb-swing", reps: 10, needsReview: false });
    expect(result.entries[1]).toMatchObject({ name: "Bear Crawl", needsReview: true, reason: "unparsed" });
    expect(result.confident).toBe(false);
  });
});

describe("weight", () => {
  it.each<[string, number, ParsedVoiceEntry["spoken"]]>([
    ["10 swings at 24 kilos", 24, { each: 24, unit: "kg" }],
    ["10 swings 24 kg", 24, { each: 24, unit: "kg" }],
    ["10 swings with 24kg", 24, { each: 24, unit: "kg" }],
    ["10 swings 24 kilograms", 24, { each: 24, unit: "kg" }],
    ["10 swings with a 24k", 24, { each: 24, unit: "kg", count: 1 }],
    ["10 swings with 22.5 kilos", 22.5, { each: 22.5, unit: "kg" }],
    ["10 swings 22 point 5 kilos", 22.5, { each: 22.5, unit: "kg" }],
    ["twelve and a half kilos swings 10", 12.5, { each: 12.5, unit: "kg" }],
    ["10 kettlebell swings twenty four kilos", 24, { each: 24, unit: "kg" }],
    ["10 swings, 24 kilos", 24, { each: 24, unit: "kg" }],
    ["10 swings. With a 24 kilo kettlebell.", 24, { each: 24, unit: "kg", count: 1 }],
    ["10 swings with a 53 pound kettlebell", 24, { each: 53, unit: "lb", count: 1 }],
    ["10 swings with a 44 pound kettlebell", 20, { each: 44, unit: "lb", count: 1 }],
    ["10 swings with a 35 lb bell", 15.9, { each: 35, unit: "lb", count: 1 }],
    ["10 swings with a 70 lb kettlebell", 31.8, { each: 70, unit: "lb", count: 1 }],
    ["10 swings at 53 lbs", 24, { each: 53, unit: "lb" }],
    ["10 swings at 24", 24, { each: 24 }],
    ["10 swings @ 24", 24, { each: 24 }],
    ["10 swings with the 24", 24, { each: 24 }],
    ["10 swings using the 24", 24, { each: 24 }],
    ["ten kettlebell swings with the twenty four", 24, { each: 24 }],
  ])("%s → %f kg", (said, weightKg, spoken) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise: "kb-swing", reps: 10, weightKg });
    expect(result.entries[0].spoken).toEqual(spoken);
    expect(result.confident).toBe(true);
  });

  it.each<[string, Partial<ParsedVoiceEntry>]>([
    ["5 deadlifts at 225 pounds", { exercise: "deadlift", reps: 5, weightKg: 102.1 }],
    ["5 deadlifts at 225 lbs", { exercise: "deadlift", reps: 5, weightKg: 102.1 }],
    ["5 squats barbell at 60 kilos", { exercise: "back-squat", reps: 5, weightKg: 60 }],
    ["5 deadlifts with the barbell at 60 kilos", { exercise: "deadlift", reps: 5, weightKg: 60 }],
    ["bench press 80 kg for 8", { exercise: "bench-press", reps: 8, weightKg: 80 }],
    ["10 goblet squats with a 20 kilogram kettlebell", { exercise: "kb-goblet-squat", reps: 10, weightKg: 20 }],
    ["3 sets of 10 kettlebell swings with the 24", { exercise: "kb-swing", sets: 3, reps: 10, weightKg: 24 }],
    ["10 24 kilo swings", { exercise: "kb-swing", reps: 10, weightKg: 24 }],
    ["10 military press with the 20", { exercise: "kb-press", reps: 10, weightKg: 20 }],
  ])("%s", (said, expected) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject(expected);
    expect(result.confident).toBe(true);
  });

  it.each(["10 swings with a 500 kilo kettlebell", "10 swings with a 0.5 kilo kettlebell"])(
    "out of range keeps the entry and drops the weight: %s",
    (said) => {
      const entry = only(said);
      expect(entry).toMatchObject({ exercise: "kb-swing", reps: 10, needsReview: true, reason: "ambiguous_weight" });
      expect(entry).not.toHaveProperty("weightKg");
    }
  );

  it.each(["swings 10 24", "10 swings 24", "10 goblet squats 24"])(
    "two bare numbers: reps first, weight second, flagged — %s",
    (said) => {
      const result = parseVoiceEntries(said);
      expect(result.entries[0]).toMatchObject({
        reps: 10,
        weightKg: 24,
        needsReview: true,
        reason: "ambiguous_weight",
      });
      expect(result.confident).toBe(false);
    }
  );

  it("a weight with no reps asks for the quantity", () => {
    expect(only("swings with the 24")).toMatchObject({
      exercise: "kb-swing",
      weightKg: 24,
      needsReview: true,
      reason: "no_quantity",
    });
  });
});

describe("implement counts", () => {
  // weightKg is ONE implement, as spoken; a pair is `implements: 2` — never a sum (changed 2026-10-09).
  it.each<[string, string, number, 1 | 2, ParsedVoiceEntry["spoken"]]>([
    ["10 kettlebell presses with one 24 kilo", "kb-press", 24, 1, { each: 24, unit: "kg", count: 1 }],
    ["10 swings with a 24", "kb-swing", 24, 1, { each: 24, count: 1 }],
    ["10 swings with a single 24", "kb-swing", 24, 1, { each: 24, count: 1 }],
    ["single 24 swings 10", "kb-swing", 24, 1, { each: 24, count: 1 }],
    ["10 clean and press with two 16s", "kb-clean-and-press", 16, 2, { each: 16, count: 2 }],
    ["10 clean and press with two 16's", "kb-clean-and-press", 16, 2, { each: 16, count: 2 }],
    ["10 clean and press with double 16", "kb-clean-and-press", 16, 2, { each: 16, count: 2 }],
    ["10 clean and press double 16s", "kb-clean-and-press", 16, 2, { each: 16, count: 2 }],
    ["10 clean and press with 2 x 16", "kb-clean-and-press", 16, 2, { each: 16, count: 2 }],
    ["10 goblet squats with a pair of 20s", "kb-goblet-squat", 20, 2, { each: 20, count: 2 }],
    ["10 curls with a pair of 20 kilo dumbbells", "bicep-curl", 20, 2, { each: 20, unit: "kg", count: 2 }],
    ["10 curls pair of 20 kilo dumbbells", "bicep-curl", 20, 2, { each: 20, unit: "kg", count: 2 }],
    ["10 swings with two 35 pound kettlebells", "kb-swing", 15.9, 2, { each: 35, unit: "lb", count: 2 }],
    ["10 swings two kettlebells at 16 kilos each", "kb-swing", 16, 2, { each: 16, unit: "kg", count: 2 }],
    ["10 swings with two 16 kilo kettlebells", "kb-swing", 16, 2, { each: 16, unit: "kg", count: 2 }],
  ])("%s → %s, %f kg each × %i", (said, exercise, weightKg, count, spoken) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry).toMatchObject({ exercise, reps: 10, weightKg, needsReview: false });
    if (count === 2) expect(entry.implements).toBe(2);
    else expect(entry).not.toHaveProperty("implements");
    expect(entry.spoken).toEqual(spoken);
    expect(result.confident).toBe(true);
  });

  it("double 16s clean and press 6 reps", () => {
    const result = parseVoiceEntries("double 16s clean and press 6 reps");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      name: "Clean and Press",
      exercise: "kb-clean-and-press",
      reps: 6,
      weightKg: 16,
      implements: 2,
      spoken: { each: 16, count: 2 },
    });
    expect(result.confident).toBe(true);
  });

  it.each<[string, number]>([
    ["10 swings with 24 kilos each hand", 24],
    ["10 swings with 24 kilos in each hand", 24],
    ["10 swings with a 16 kilo kettlebell in each hand", 16],
  ])("a weight 'in each hand' is two implements, not reps per side: %s", (said, weightKg) => {
    const entry = only(said);
    expect(entry).toMatchObject({ exercise: "kb-swing", reps: 10, weightKg, implements: 2, spoken: { count: 2 } });
    expect(entry).not.toHaveProperty("perSide");
    expect(only("10 swings each hand")).toMatchObject({ reps: 10, perSide: true });
  });

  it("'the 24' does not claim a count", () => {
    expect(only("10 swings with the 24").spoken).toEqual({ each: 24 });
  });

  it("a plural with no count is read as a pair, and flagged", () => {
    const entry = only("10 swings with 16s");
    expect(entry).toMatchObject({ weightKg: 16, implements: 2, needsReview: true, reason: "ambiguous_weight" });
    expect(entry.spoken).toEqual({ each: 16 });
  });
});

describe("vest", () => {
  it.each([
    "10 squats with a vest",
    "10 squats wearing a vest",
    "10 squats wearing my vest",
    "10 squats vested",
    "10 squats in a vest",
    "10 squats with the vest on",
    "10 squats weighted vest",
    "10 squats with a weighted vest",
    "10 squats plus a vest",
    "diez sentadillas con chaleco",
  ])("%s → assumed default, no weightKg", (said) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry).toMatchObject({ exercise: "back-squat", reps: 10 });
    expect(entry.load).toEqual({ type: "vest", kg: 5, assumed: true });
    expect(entry).not.toHaveProperty("weightKg");
    expect(entry).not.toHaveProperty("spoken");
    expect(result.confident).toBe(true);
  });

  it.each<[string, number]>([
    ["10 squats with a 10 kilo vest", 10],
    ["10 squats vest 15", 15],
    ["10 squats with a 22 kg vest", 22],
    ["10 squats with a 20 pound vest", 9.1],
    ["10 squats with a vest of 10 kilos", 10],
    ["10 squats with my 20 lb weight vest", 9.1],
    ["10 squats in a 12 kilo weighted vest", 12],
    ["diez sentadillas con chaleco de diez kilos", 10],
  ])("%s → %f kg stated", (said, kg) => {
    const entry = only(said);
    expect(entry).toMatchObject({ exercise: "back-squat", reps: 10, needsReview: false });
    expect(entry.load).toEqual({ type: "vest", kg });
    expect(entry).not.toHaveProperty("weightKg");
  });

  it.each(["10 squats with a 50 kilo vest", "10 squats with a 0.5 kilo vest", "10 squats with a 100 pound vest"])(
    "out of range falls back to the default and asks for review: %s",
    (said) => {
      const entry = only(said);
      expect(entry.load).toEqual({ type: "vest", kg: 5, assumed: true });
      expect(entry.needsReview).toBe(true);
    }
  );

  it("uses the caller's default vest weight", () => {
    expect(only("10 squats with a vest", { defaultVestKg: 9 }).load).toEqual({ type: "vest", kg: 9, assumed: true });
    expect(only("10 squats with a 12 kilo vest", { defaultVestKg: 9 }).load).toEqual({ type: "vest", kg: 12 });
  });

  it("the number after a bare 'vest' is only its weight when nothing follows it", () => {
    expect(only("with a vest 15 swings")).toMatchObject({
      exercise: "kb-swing",
      reps: 15,
      load: { type: "vest", kg: 5, assumed: true },
    });
  });

  it("a vest phrase alone has nothing to attach to", () => {
    expect(only("with a vest")).toMatchObject({ name: "", reason: "unparsed", load: { type: "vest", kg: 5 } });
  });
});

describe("duration", () => {
  it.each<[string, string, number]>([
    ["30 second plank", "plank", 30],
    ["plank 30 seconds", "plank", 30],
    ["plank for 45 seconds", "plank", 45],
    ["45 sec plank", "plank", 45],
    ["one minute plank", "plank", 60],
    ["plank for one minute", "plank", 60],
    ["a minute of planks", "plank", 60],
    ["2 minute plank", "plank", 120],
    ["1 minute 30 plank", "plank", 90],
    ["plank 1 minute 30 seconds", "plank", 90],
    ["plank 1 minute and 30 seconds", "plank", 90],
    ["minute and a half plank", "plank", 90],
    ["a minute and a half plank", "plank", 90],
    ["plank 2 and a half minutes", "plank", 150],
    ["half a minute plank", "plank", 30],
    ["1:30 plank", "plank", 90],
    ["90 seconds of farmer carry", "kb-farmer-carry", 90],
    ["farmer carry for 40 seconds", "kb-farmer-carry", 40],
  ])("%s → %s for %is", (said, exercise, seconds) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, seconds, needsReview: false });
    expect(result.entries[0]).not.toHaveProperty("reps");
    expect(result.confident).toBe(true);
  });

  it("a hold can carry a weight", () => {
    expect(only("farmer carry 40 seconds with two 24s")).toMatchObject({
      exercise: "kb-farmer-carry",
      seconds: 40,
      weightKg: 24,
      implements: 2,
    });
  });

  it("a bare number on a hold is kept as said but not vouched for", () => {
    const result = parseVoiceEntries("plank 45");
    expect(result.entries[0]).toMatchObject({ exercise: "plank", reps: 45, needsReview: true });
    expect(result.confident).toBe(false);
  });
});

describe("per side", () => {
  it.each<[string, string, number]>([
    ["10 lunges each side", "lunge", 10],
    ["10 lunges per side", "lunge", 10],
    ["10 lunges on each side", "lunge", 10],
    ["10 lunges each leg", "lunge", 10],
    ["10 lunges a side", "lunge", 10],
    ["10 a side lunges", "lunge", 10],
    ["10 lunges, each side", "lunge", 10],
    ["8 kettlebell press per side", "kb-press", 8],
    ["8 kettlebell press each arm", "kb-press", 8],
    ["5 turkish get ups each arm", "kb-turkish-get-up", 5],
    ["10 halos each way", "kb-halo", 10],
    ["10 zancadas por lado", "lunge", 10],
  ])("%s → %s ×%i per side (reps not doubled)", (said, exercise, reps) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, reps, perSide: true });
    expect(result.confident).toBe(true);
  });

  it("perSide is absent when not said", () => {
    expect(only("10 lunges")).not.toHaveProperty("perSide");
  });

  it("'side' inside a name is not a per-side marker", () => {
    expect(only("15 side raises")).not.toHaveProperty("perSide");
    expect(only("15 side raises each side")).toMatchObject({ exercise: "lateral-raise", perSide: true });
  });

  it("combines with a weight", () => {
    expect(only("one turkish get up each side with the 16")).toMatchObject({
      exercise: "kb-turkish-get-up",
      reps: 1,
      perSide: true,
      weightKg: 16,
    });
  });
});

describe("matchSpokenExercise", () => {
  it.each<[string, string, number, ParsedVoiceEntry["matchedBy"]]>([
    ["Kettlebell Swing", "kb-swing", 1, "exact"],
    ["push up", "push-up", 1, "exact"],
    ["overhead press", "overhead-press", 1, "exact"],
    ["kettlebell press", "kb-press", 1, "exact"],
    ["swings", "kb-swing", 1, "alias"],
    ["KB swing", "kb-swing", 1, "alias"],
    ["pushups", "push-up", 1, "alias"],
    ["pullups", "pull-up", 1, "alias"],
    ["dominadas", "pull-up", 1, "alias"],
    ["tgu", "kb-turkish-get-up", 1, "alias"],
    ["heavy kettlebell swings", "kb-swing", 0.85, "contains"],
    ["weighted pull ups", "pull-up", 0.85, "contains"],
    ["kettlebell clean and press", "kb-clean-and-press", 0.85, "contains"],
    // plural aliases added to the catalog 2026-10-05 — exact now
    ["kettlebell presses", "kb-press", 1, "alias"],
    ["farmer carries", "kb-farmer-carry", 1, "alias"],
    ["sit ups", "crunch", 1, "alias"],
    ["dead lifts", "deadlift", 0.8, "fuzzy"],
    ["turkish getups", "kb-turkish-get-up", 0.8, "fuzzy"],
    ["kettle bell swings", "kb-swing", 0.8, "fuzzy"],
    ["kettlebell overhead press", "kb-press", 0.8, "fuzzy"],
    ["cattle bell swings", "kb-swing", 0.75, "fuzzy"],
    ["swims", "kb-swing", 0.75, "fuzzy"],
    ["swing's", "kb-swing", 0.75, "fuzzy"],
    ["berpees", "burpee", 0.75, "fuzzy"],
    ["squads", "back-squat", 0.75, "fuzzy"],
    ["burpes", "burpee", 0.7, "fuzzy"],
    ["thrustors", "kb-thruster", 0.7, "fuzzy"],
    ["gobblet squats", "kb-goblet-squat", 0.7, "fuzzy"],
    ["plans", "plank", 0.7, "fuzzy"],
    ["jump squats", "back-squat", 0.7, "contains"],
    ["clean and jerk", "kb-clean", 0.7, "contains"],
  ])("%s → %s (%f, %s)", (spoken, id, score, by) => {
    const match = matchSpokenExercise(spoken);
    expect(match.def?.id).toBe(id);
    expect(match.score).toBe(score);
    expect(match.by).toBe(by);
  });

  // "plan" and "dipz" are one edit from a movement, but too short to trust.
  it.each(["", "underwater basket weaving", "bear crawls", "lunches", "rows", "plan", "dipz"])(
    "no match for %j",
    (spoken) => {
      expect(matchSpokenExercise(spoken)).toEqual({ def: null, score: 0, by: "none" });
    }
  );

  it("fuzzy scores stay inside 0.6–0.8", () => {
    for (const spoken of ["dead lifts", "swims", "burpes", "thrustors", "kettle bell swings"]) {
      const match = matchSpokenExercise(spoken);
      expect(match.by).toBe("fuzzy");
      expect(match.score).toBeGreaterThanOrEqual(0.6);
      expect(match.score).toBeLessThanOrEqual(0.8);
    }
  });
});

describe("fuzzy matches and mishearings", () => {
  it.each<[string, string]>([
    ["10 dead lifts", "deadlift"],
    ["10 turkish getups", "kb-turkish-get-up"],
    ["10 kettlebell overhead press", "kb-press"],
    ["10 kettle bell swings", "kb-swing"],
    ["10 cattle bell swings", "kb-swing"],
    ["10 kettle ball swings", "kb-swing"],
    ["10 swims", "kb-swing"],
    ["10 swing's", "kb-swing"],
    ["10 berpees", "burpee"],
    ["10 burpies", "burpee"],
    ["10 squads", "back-squat"],
    ["10 lunches", "lunge"],
    ["10 burpes", "burpee"],
    ["10 thrustors", "kb-thruster"],
    ["10 gobblet squats", "kb-goblet-squat"],
    ["10 clean to press", "kb-clean-and-press"],
    ["10 presses", "kb-press"],
  ])("%s → %s, flagged low_match", (said, exercise) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry).toMatchObject({ exercise, reps: 10, matchedBy: "fuzzy", needsReview: true, reason: "low_match" });
    expect(entry.confidence).toBeLessThanOrEqual(0.75);
    expect(result.confident).toBe(false);
  });

  it("'lunch' is only lunges next to a rep count", () => {
    expect(parseVoiceEntries("lunches").entries).toEqual([]);
    expect(parseVoiceEntries("I had lunch").entries).toEqual([]);
    expect(only("after lunch 10 swings")).toMatchObject({ exercise: "kb-swing", reps: 10 });
  });

  it("the corrected text is what the parser reports working on", () => {
    expect(parseVoiceEntries("10 cattle bell swims").normalized).toBe("10 kettlebell swings");
    expect(parseVoiceEntries("Ten Kettlebell Swings, twenty-four kilos.").normalized).toBe(
      "10 kettlebell swings, 24 kilos"
    );
  });

  it.each<[string, string]>([
    ["10 jump squats", "back-squat"],
    ["10 pistol squats", "back-squat"],
    ["10 side planks", "plank"],
    ["5 clean and jerk", "kb-clean"],
  ])("containment with unexplained words is a review match: %s", (said, exercise) => {
    const result = parseVoiceEntries(said);
    expect(result.entries[0]).toMatchObject({ exercise, matchedBy: "contains", needsReview: true, reason: "low_match" });
    expect(result.confident).toBe(false);
  });

  it.each<[string, string]>([
    ["10 swings", "kb-swing"],
    ["10 kettlebell press", "kb-press"],
    ["10 overhead press", "overhead-press"],
    ["10 military press", "kb-press"],
    ["10 shoulder press", "overhead-press"],
    ["10 push press", "kb-push-press"],
    ["10 heavy kettlebell swings", "kb-swing"],
    ["10 weighted pull ups", "pull-up"],
    ["10 bodyweight squats", "back-squat"],
    ["10 press with a 24 kilo kettlebell", "kb-press"],
    ["10 deadlift with a 32 kilo kettlebell", "kb-deadlift"],
    ["10 squats with a 24 kilo kettlebell", "back-squat"],
    ["10 deadlifts at 100 kilos", "deadlift"],
  ])("equipment qualifiers are respected: %s → %s", (said, exercise) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, reps: 10, needsReview: false });
    expect(result.confident).toBe(true);
  });

  it("a press with a barbell is not offered as the kettlebell press", () => {
    const entry = only("10 press with the barbell at 40 kilos");
    expect(entry).toMatchObject({ name: "Press", weightKg: 40, reason: "new_exercise" });
    expect(entry).not.toHaveProperty("exercise");
  });
});

describe("homophone guard", () => {
  it("'for' in a duration stays a word", () => {
    const result = parseVoiceEntries("plank for 45 seconds");
    expect(result.entries[0]).toMatchObject({ exercise: "plank", seconds: 45 });
    expect(result.entries[0]).not.toHaveProperty("reps");
    expect(result.confident).toBe(true);
  });

  it("'to' inside a movement stays a word", () => {
    expect(only("5 clean to press")).toMatchObject({ exercise: "kb-clean-and-press", reps: 5 });
  });

  it("a real number always wins over a homophone", () => {
    expect(only("for 10 pull ups")).toMatchObject({ exercise: "pull-up", reps: 10, needsReview: false });
    expect(only("swings for 10")).toMatchObject({ exercise: "kb-swing", reps: 10, needsReview: false });
  });

  it.each<[string, string, number]>([
    ["for pull ups", "pull-up", 4],
    ["to push ups", "push-up", 2],
    ["too push ups", "push-up", 2],
    ["ate burpees", "burpee", 8],
    ["won pull up", "pull-up", 1],
    ["I did for pull ups", "pull-up", 4],
  ])("%s → %s ×%i only as a flagged guess", (said, exercise, reps) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, reps, needsReview: true });
    expect(result.entries[0].confidence).toBeLessThanOrEqual(0.6);
    expect(result.confident).toBe(false);
  });

  it.each(["too many swings", "i want to squat", "going to do swings"])("%s is not a rep count", (said) => {
    for (const entry of parseVoiceEntries(said).entries) expect(entry).not.toHaveProperty("reps");
  });

  it("a trailing 'too' is dropped, not counted", () => {
    const entry = only("swings too");
    expect(entry).toMatchObject({ exercise: "kb-swing", needsReview: true, reason: "no_quantity" });
    expect(entry).not.toHaveProperty("reps");
  });
});

describe("unknown movements", () => {
  it.each<[string, string, number]>([
    ["10 bear crawls", "Bear Crawl", 10],
    ["15 mountain climbers", "Mountain Climber", 15],
    ["20 jumping jacks", "Jumping Jack", 20],
    ["10 box jumps", "Box Jump", 10],
    ["10 dumbbell presses", "Dumbbell Press", 10],
    ["okay um I just did 10 bear crawls", "Bear Crawl", 10],
    ["log 12 hollow rocks", "Hollow Rock", 12],
    ["that was 8 skull crushers", "Skull Crusher", 8],
    ["another set of 10 bear crawls", "Bear Crawl", 10],
  ])("%s → kept as %s, flagged new_exercise", (said, name, reps) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry).toMatchObject({ name, reps, needsReview: true, reason: "new_exercise", matchedBy: "none" });
    expect(entry).not.toHaveProperty("exercise");
    expect(entry.confidence).toBeLessThanOrEqual(0.4);
    expect(result.confident).toBe(false);
  });

  it("keeps what was said about an unknown movement", () => {
    expect(only("10 box jumps with a vest").load).toEqual({ type: "vest", kg: 5, assumed: true });
    expect(only("5 wall balls 9 kilos")).toMatchObject({ name: "Wall Ball", reps: 5, weightKg: 9 });
    expect(only("60 second wall sit")).toMatchObject({ name: "Wall Sit", seconds: 60, reason: "new_exercise" });
  });

  it("a numbered sentence that reads like conversation is unparsed, not a new exercise", () => {
    expect(only("I'll be there in 10 minutes")).toMatchObject({ needsReview: true, reason: "unparsed" });
  });
});

describe("noise", () => {
  it.each([
    "",
    "   ",
    "...",
    "uh",
    "um okay",
    "never gonna give you up never gonna let you down",
    "what a beautiful day",
    "the plank is wet",
    "thanks for watching",
    "thank you",
    "bear crawls",
    "I had lunch",
    "let's go",
  ])("%j → no entries", (said) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toEqual([]);
    expect(result.confident).toBe(false);
  });

  it.each(["10 swings. Thank you.", "10 swings. Thanks for watching!"])(
    "a transcription sign-off does not spoil a clean log: %s",
    (said) => {
      const result = parseVoiceEntries(said);
      expect(result.entries).toHaveLength(1);
      expect(result.confident).toBe(true);
    }
  );
});

describe("Spanish", () => {
  it.each<[string, Partial<ParsedVoiceEntry>]>([
    ["diez flexiones", { exercise: "push-up", reps: 10 }],
    ["veinte lagartijas", { exercise: "push-up", reps: 20 }],
    ["doce dominadas", { exercise: "pull-up", reps: 12 }],
    ["veinticinco abdominales", { exercise: "crunch", reps: 25 }],
    ["treinta y cinco sentadillas", { exercise: "back-squat", reps: 35 }],
    ["cien flexiones", { exercise: "push-up", reps: 100 }],
    ["once flexiones", { exercise: "push-up", reps: 11 }],
    ["veinte sentadillas con chaleco", { exercise: "back-squat", reps: 20, load: { type: "vest", kg: 5, assumed: true } }],
    ["quince sentadillas con chaleco de diez kilos", { exercise: "back-squat", reps: 15, load: { type: "vest", kg: 10 } }],
    ["tres series de diez flexiones", { exercise: "push-up", sets: 3, reps: 10 }],
    ["diez repeticiones de peso muerto con cien kilos", { exercise: "deadlift", reps: 10, weightKg: 100 }],
    ["diez sentadillas con veinte libras", { exercise: "back-squat", reps: 10, weightKg: 9.1, spoken: { each: 20, unit: "lb" } }],
    ["diez sentadillas con 22,5 kilos", { exercise: "back-squat", reps: 10, weightKg: 22.5 }],
    ["ocho remo con pesa rusa de 24 kilos", { exercise: "kb-row", reps: 8, weightKg: 24 }],
    ["diez sentadillas con dos pesas rusas de dieciséis kilos", { exercise: "back-squat", reps: 10, weightKg: 16, implements: 2, spoken: { each: 16, unit: "kg", count: 2 } }],
    ["plancha por treinta segundos", { exercise: "plank", seconds: 30 }],
    ["un minuto de plancha", { exercise: "plank", seconds: 60 }],
    ["dos minutos de plancha", { exercise: "plank", seconds: 120 }],
    ["minuto y medio de plancha", { exercise: "plank", seconds: 90 }],
    ["diez zancadas por lado", { exercise: "lunge", reps: 10, perSide: true }],
  ])("%s", (said, expected) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject(expected);
    expect(result.confident).toBe(true);
  });

  it("splits on 'y'", () => {
    const { entries } = parseVoiceEntries("diez flexiones y cinco dominadas");
    expect(entries.map((e) => [e.exercise, e.reps])).toEqual([
      ["push-up", 10],
      ["pull-up", 5],
    ]);
  });

  it("rondas cover every movement", () => {
    const { entries } = parseVoiceEntries("cuatro rondas de diez flexiones y diez sentadillas");
    expect(entries.map((e) => [e.exercise, e.sets, e.reps])).toEqual([
      ["push-up", 4, 10],
      ["back-squat", 4, 10],
    ]);
  });

  it("English 'once' is not eleven", () => {
    const entry = only("I did swings once");
    expect(entry).toMatchObject({ exercise: "kb-swing", reason: "no_quantity" });
    expect(entry).not.toHaveProperty("reps");
  });
});

describe("custom exercises", () => {
  const renegadeRow = { id: "renegade-row", name: "Renegade Row", category: "kettlebell" as const, aliases: [] };
  const airSquat = { id: "air-squat", name: "Air Squat", category: "bodyweight" as const, aliases: [] };

  it("is an unknown movement until it is registered", () => {
    expect(only("8 renegade rows with two 16s")).toMatchObject({
      name: "Renegade Row",
      reps: 8,
      weightKg: 16,
      implements: 2,
      reason: "new_exercise",
    });
  });

  it("resolves a registered custom, plural and with a weight phrase", () => {
    setCustomExercises([renegadeRow]);
    const entry = only("8 renegade rows with two 16s");
    expect(entry).toMatchObject({ name: "Renegade Row", exercise: "renegade-row", reps: 8, weightKg: 16, implements: 2 });
    expect(entry.spoken).toEqual({ each: 16, count: 2 });
  });

  it("is confident on the custom's exact name", () => {
    setCustomExercises([renegadeRow]);
    const result = parseVoiceEntries("8 renegade row with two 16s");
    expect(result.entries[0]).toMatchObject({ exercise: "renegade-row", matchedBy: "exact", weightKg: 16, implements: 2 });
    expect(result.confident).toBe(true);
  });

  it("plain squats prefer a minted bodyweight squat when there is no implement", () => {
    expect(only("10 squats").exercise).toBe("back-squat");
    setCustomExercises([airSquat]);
    expect(only("10 squats")).toMatchObject({ name: "Air Squat", exercise: "air-squat", needsReview: false });
    expect(only("10 squats with a vest")).toMatchObject({ exercise: "air-squat", load: { type: "vest", kg: 5 } });
    expect(only("veinte sentadillas con chaleco").exercise).toBe("air-squat");
  });

  it("squats with an implement stay the plain squat — no guessing a different movement", () => {
    setCustomExercises([airSquat]);
    expect(only("10 squats with a 24 kilo kettlebell")).toMatchObject({ exercise: "back-squat", weightKg: 24 });
  });

  it("number words inside a custom name are not quantities", () => {
    setCustomExercises([{ id: "two-hand-clean", name: "Two-Hand Clean", category: "kettlebell", aliases: [] }]);
    expect(only("5 two-hand clean")).toMatchObject({ exercise: "two-hand-clean", reps: 5 });
  });
});

describe("voiceDisplayLine", () => {
  const line = (fields: Partial<ParsedVoiceEntry>) =>
    voiceDisplayLine({ name: "", confidence: 0.95, needsReview: false, matchedBy: "exact", ...fields });

  it.each<[Partial<ParsedVoiceEntry>, string]>([
    [{ name: "Kettlebell Swing", reps: 10, weightKg: 24 }, "KB Swing ×10 · 24 kg"],
    [{ name: "Push-Up", reps: 10, sets: 3 }, "Push-Up 3×10"],
    [{ name: "Plank", seconds: 45 }, "Plank 45s"],
    [{ name: "Squat", reps: 10, load: { type: "vest", kg: 5, assumed: true } }, "Squat ×10 · vest 5 kg"],
    [{ name: "Bear Crawl", reps: 10, needsReview: true }, "? Bear Crawl ×10"],
    [{ name: "One-Arm Kettlebell Swing", reps: 8, perSide: true }, "One-Arm KB Swing ×8/side"],
    [{ name: "Kettlebell Front Squat", reps: 5 }, "KB Front Squat ×5"],
    [{ name: "Push-Up", reps: 10, sets: 1 }, "Push-Up ×10"],
    [{ name: "Lunge", reps: 10, sets: 3, perSide: true }, "Lunge 3×10/side"],
    [{ name: "Plank", seconds: 60 }, "Plank 60s"],
    [{ name: "Plank", seconds: 61 }, "Plank 1:01"],
    [{ name: "Plank", seconds: 90 }, "Plank 1:30"],
    [{ name: "Plank", seconds: 600 }, "Plank 10:00"],
    [{ name: "Plank", seconds: 30, sets: 2 }, "Plank 2×30s"],
    [{ name: "Plank", seconds: 90, sets: 2 }, "Plank 2×1:30"],
    [{ name: "Kettlebell Swing", reps: 10, weightKg: 31.8 }, "KB Swing ×10 · 31.8 kg"],
    [{ name: "Kettlebell Swing", reps: 10, weightKg: 24.0 }, "KB Swing ×10 · 24 kg"],
    [{ name: "Squat", reps: 10, weightKg: 24, load: { type: "vest", kg: 10 } }, "Squat ×10 · 24 kg · vest 10 kg"],
    [{ name: "Farmer Carry", seconds: 40, weightKg: 48 }, "Farmer Carry 40s · 48 kg"],
    [{ name: "Farmer Carry", seconds: 40, weightKg: 24, implements: 2 }, "Farmer Carry 40s · 2×24 kg"],
    [{ name: "Clean and Press", reps: 6, weightKg: 16, implements: 2 }, "Clean and Press ×6 · 2×16 kg"],
    [{ name: "Kettlebell Swing", reps: 10, sets: 3, weightKg: 15.9, implements: 2 }, "KB Swing 3×10 · 2×15.9 kg"],
    [{ name: "Squat", reps: 5, weightKg: 24, implements: 2, load: { type: "vest", kg: 10 } }, "Squat ×5 · 2×24 kg · vest 10 kg"],
    [{ name: "Jump Rope", seconds: 30, sets: 10 }, "Jump Rope 10×30s"],
    [{ name: "Kettlebell Snatch", reps: 8, weightKg: 60, needsReview: true }, "? KB Snatch ×8 · 60 kg"],
    [{ name: "Kettlebell Swing", needsReview: true }, "? KB Swing"],
    [{ name: "", reps: 10, needsReview: true }, "? ×10"],
  ])("%j → %s", (fields, expected) => {
    expect(line(fields)).toBe(expected);
  });

  it.each<[string, string]>([
    ["10 kettlebell swings with the 24", "KB Swing ×10 · 24 kg"],
    ["3 sets of 10 push-ups", "Push-Up 3×10"],
    ["plank for 45 seconds", "Plank 45s"],
    ["10 squats with a vest", "Squat ×10 · vest 5 kg"],
    ["10 bear crawls", "? Bear Crawl ×10"],
    ["double 16s clean and press 6 reps", "Clean and Press ×6 · 2×16 kg"],
    ["10 swings with two 35 pound kettlebells", "KB Swing ×10 · 2×15.9 kg"],
    ["10 swings with a 24 kilo kettlebell in each hand", "KB Swing ×10 · 2×24 kg"],
    ["10 rounds of 30 seconds on 30 seconds off jump rope", "Jump Rope 10×30s"],
    ["2 sets of 30 second plank", "Plank 2×30s"],
    ["10 lunges each side", "Lunge ×10/side"],
  ])("end to end: %s → %s", (said, expected) => {
    expect(voiceDisplayLine(only(said))).toBe(expected);
  });
});

describe("confident flag", () => {
  it.each([
    "10 kettlebell swings",
    "30 second plank",
    "10 squats with a vest",
    "10 kettlebell clean and press with two 16s",
    "5 rounds of 10 swings and 5 push-ups",
    "diez flexiones",
  ])("true for %s", (said) => {
    expect(parseVoiceEntries(said).confident).toBe(true);
  });

  it.each<[string, ParsedVoiceEntry["reason"]]>([
    ["swings", "no_quantity"],
    ["10 bear crawls", "new_exercise"],
    ["10 dead lifts", "low_match"],
    ["10 jump squats", "low_match"],
    ["swings 10 24", "ambiguous_weight"],
    ["another 10", "unparsed"],
  ])("false for %s (%s)", (said, reason) => {
    const result = parseVoiceEntries(said);
    expect(result.confident).toBe(false);
    expect(result.entries[0]).toMatchObject({ needsReview: true, reason });
  });

  it("one shaky entry makes the whole clip unconfident", () => {
    const result = parseVoiceEntries("10 swings and 10 bear crawls");
    expect(result.entries.map((e) => e.needsReview)).toEqual([false, true]);
    expect(result.confident).toBe(false);
  });

  it("confidence is only claimed for a solid match with a quantity and no flags", () => {
    const corpus = [
      "10 kettlebell swings",
      "10 kettlebell presses with one 24 kilo",
      "10 squats with a vest",
      "5 rounds of 10 swings and 5 push-ups",
      "double 16s clean and press 6 reps",
      "30 second plank",
      "10 bear crawls",
      "swings 10 24",
      "for pull ups",
      "10 jump squats",
      "10 swings with a 500 kilo kettlebell",
      "plank 45",
      "swings",
      "10 swims",
      "diez flexiones y cinco dominadas",
    ];
    for (const said of corpus) {
      const result = parseVoiceEntries(said);
      for (const entry of result.entries) {
        expect(entry.confidence).toBeGreaterThanOrEqual(0);
        expect(entry.confidence).toBeLessThanOrEqual(1);
        expect(entry.needsReview).toBe(entry.reason != null);
        if (entry.confidence >= 0.85) {
          expect(entry.exercise).toBeDefined();
          expect(["exact", "alias", "contains"]).toContain(entry.matchedBy);
          expect(entry.reps ?? entry.seconds).toBeDefined();
          expect(entry.needsReview).toBe(false);
        }
      }
      const everyEntrySolid =
        result.entries.length > 0 && result.entries.every((e) => e.confidence >= 0.85 && !e.needsReview);
      expect(result.confident).toBe(everyEntrySolid);
    }
  });
});

// Added after the first live run of the route (2026-10-05).
import { finalizeVoiceEntries } from "@/lib/voice-entry-parser";

describe("finalizeVoiceEntries", () => {
  it("drops fragments with no movement name", () => {
    const { entries } = parseVoiceEntries("another 10");
    expect(finalizeVoiceEntries(entries)).toEqual([]);
  });

  it("keeps a single weighted bodyweight entry as said", () => {
    const { entries } = parseVoiceEntries("10 pull ups with a 10 kilo kettlebell");
    const out = finalizeVoiceEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0].weightKg).toBe(10);
  });

  it("flags a weight that landed on a bodyweight movement in a list", () => {
    const { entries } = parseVoiceEntries("8 swings and 8 push ups with the 20");
    const out = finalizeVoiceEntries(entries);
    const pushUp = out.find((e) => e.exercise === "push-up");
    expect(pushUp?.weightKg).toBe(20);
    expect(pushUp?.needsReview).toBe(true);
    expect(pushUp?.reason).toBe("ambiguous_weight");
  });
});

describe("minute + bare number", () => {
  it("'a minute thirty' is ninety seconds", () => {
    expect(parseVoiceEntries("1 minute 30 plank").entries[0].seconds).toBe(90);
    expect(parseVoiceEntries("one minute 45 plank").entries[0].seconds).toBe(105);
  });

  it("'1 minute 10 push ups' is ten push-ups, not a 70-second push-up", () => {
    const e = parseVoiceEntries("1 minute 10 push ups").entries[0];
    expect(e.exercise).toBe("push-up");
    expect(e.reps).toBe(10);
    expect(e.seconds).toBe(60);
  });
});

describe("plural aliases added to the catalog", () => {
  it.each([
    ["10 kettlebell presses with one 24 kilo", "kb-press"],
    ["12 kettlebell rows", "kb-row"],
    ["20 sit ups", "crunch"],
  ])("%s is confident", (said, id) => {
    const r = parseVoiceEntries(said);
    expect(r.entries[0].exercise).toBe(id);
    expect(r.confident).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2026-10-09 — after his first real session (2026-10-08). Rules were sure of
// one clip in nine and wrong about it. What changed: a weight is ONE
// implement with `implements: 2` for a pair; "16 kilos on each side" is a
// pair, not reps per side; "double-handed" is a pair cue; plurals match
// exactly; restatements are one entry; a leading number is the reps;
// intervals; an unbelievable bell is flagged; "another 8" carries over.
// ─────────────────────────────────────────────────────────────────────────

/** His own movements that the session used. */
const HIS_CUSTOMS = [
  {
    id: "kettlebell-clean-and-jerk",
    name: "Kettlebell Clean and Jerk",
    category: "kettlebell" as const,
    aliases: ["clean and jerk", "long cycle"],
  },
  { id: "jerk", name: "Jerk", category: "kettlebell" as const, aliases: [] },
];
const RACK = [12, 16, 20, 24];

/** The fields a log row is made of — compared with toEqual, so an absent key and an unexpected one both fail. */
const row = (e: ParsedVoiceEntry) => ({
  exercise: e.exercise,
  reps: e.reps,
  sets: e.sets,
  seconds: e.seconds,
  weightKg: e.weightKg,
  implements: e.implements,
  perSide: e.perSide,
  load: e.load,
  needsReview: e.needsReview,
  reason: e.reason,
});

describe("the nine clips from his first session, verbatim", () => {
  const T1 = "I did four long cycles, which are four clean and jerks with two 16 kilogram kettlebells.";
  const T2 = "I did another four double-handed clean and jerks with 16 kilogram kettlebells on each side.";
  const T3 = "Eight. Clean and press, 60 kilograms on each side.";
  const T4 = "Two double-handed squats, 24 kilograms on each hand.";
  const T5 =
    "I did four goblet squats, 20 kilograms on each side. Then eight goblet squats, 16 kilograms on each side.";
  const T6 =
    "I did two jerks with 24 kilograms on each side, four jerks with 20 kilograms on each side, and eight jerks with 16 kilograms on each side.";
  const T7 = "I did eight double-handed snatches with 16 kilograms on each side.";
  const T8 = "I did three sets of eight double-handed half snatches, 16 kilograms each side.";
  const T9 = "The last 10 minutes were 30 second on, 30 second off, EMOMs, jumping rope.";

  beforeEach(() => setCustomExercises(HIS_CUSTOMS));

  it("1 — a long cycle restated as clean and jerks is one entry", () => {
    const result = parseVoiceEntries(T1);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kettlebell-clean-and-jerk", reps: 4, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
    expect(voiceDisplayLine(result.entries[0])).toBe("KB Clean and Jerk ×4 · 2×16 kg");
  });

  it("2 — double-handed, 16 kilogram kettlebells on each side", () => {
    const result = parseVoiceEntries(T2);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kettlebell-clean-and-jerk", reps: 4, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
  });

  it("3 — as heard, 60 kilograms a hand is reported and flagged, never corrected", () => {
    const result = parseVoiceEntries(T3);
    expect(result.entries.map(row)).toEqual([
      {
        exercise: "kb-clean-and-press",
        reps: 8,
        weightKg: 60,
        implements: 2,
        needsReview: true,
        reason: "ambiguous_weight",
      },
    ]);
    expect(result.entries[0].confidence).toBeLessThanOrEqual(0.6);
    expect(result.confident).toBe(false);
    expect(voiceDisplayLine(result.entries[0]).startsWith("? ")).toBe(true);
    expect(voiceDisplayLine(result.entries[0])).toBe("? Clean and Press ×8 · 2×60 kg");
    // The last look agrees, and leaves the number alone too.
    expect(finalizeVoiceEntries(result.entries).map(row)).toEqual(result.entries.map(row));
  });

  it("3 — the same sentence with 16 kilograms is clean", () => {
    const result = parseVoiceEntries(T3.replace("60", "16"));
    expect(result.entries.map(row)).toEqual([
      { exercise: "kb-clean-and-press", reps: 8, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
    expect(parseVoiceEntries("Eight. Clean and press, sixteen kilograms on each side.").entries.map(row)).toEqual(
      result.entries.map(row)
    );
  });

  it("4 — double-handed squats, 24 kilograms on each hand", () => {
    const result = parseVoiceEntries(T4);
    expect(result.entries.map(row)).toEqual([
      { exercise: "back-squat", reps: 2, weightKg: 24, implements: 2, needsReview: false },
    ]);
    expect(result.entries[0].name).toBe("Squat");
    expect(result.confident).toBe(true);
  });

  it("5 — two goblet squat sets, each a pair, neither per side", () => {
    const result = parseVoiceEntries(T5);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kb-goblet-squat", reps: 4, weightKg: 20, implements: 2, needsReview: false },
      { exercise: "kb-goblet-squat", reps: 8, weightKg: 16, implements: 2, needsReview: false },
    ]);
    for (const entry of result.entries) expect(entry).not.toHaveProperty("perSide");
    expect(result.confident).toBe(true);
  });

  it("6 — three jerk sets down the rack", () => {
    const result = parseVoiceEntries(T6);
    expect(result.entries.map(row)).toEqual([
      { exercise: "jerk", reps: 2, weightKg: 24, implements: 2, needsReview: false },
      { exercise: "jerk", reps: 4, weightKg: 20, implements: 2, needsReview: false },
      { exercise: "jerk", reps: 8, weightKg: 16, implements: 2, needsReview: false },
    ]);
    for (const entry of result.entries) expect(entry).not.toHaveProperty("perSide");
    expect(result.confident).toBe(true);
  });

  it("7 — double-handed snatches", () => {
    const result = parseVoiceEntries(T7);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kb-snatch", reps: 8, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
  });

  it("8 — three sets of double-handed half snatches", () => {
    const result = parseVoiceEntries(T8);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kb-half-snatch", sets: 3, reps: 8, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
    expect(voiceDisplayLine(result.entries[0])).toBe("KB Half Snatch 3×8 · 2×16 kg");
  });

  it("9 — ten minutes of 30 on / 30 off jump rope is one entry, ten sets of thirty seconds", () => {
    const result = parseVoiceEntries(T9);
    expect(result.entries.map(row)).toEqual([{ exercise: "jump-rope", seconds: 30, sets: 10, needsReview: false }]);
    expect(result.entries[0]).not.toHaveProperty("reps");
    expect(result.confident).toBe(true);
    expect(voiceDisplayLine(result.entries[0])).toBe("Jump Rope 10×30s");
  });

  it("with his rack known, only the misheard clip is flagged — and nothing is lost in the last look", () => {
    const clips = [T1, T2, T3, T4, T5, T6, T7, T8, T9];
    const flagged = clips.map((said) => {
      const result = parseVoiceEntries(said, { bells: RACK });
      const final = finalizeVoiceEntries(result.entries, { bells: RACK });
      expect(final).toHaveLength(result.entries.length);
      return final.some((e) => e.needsReview);
    });
    expect(flagged).toEqual([false, false, true, false, false, false, false, false, false]);
  });

  it("the catalog alone (no customs) still reads every clip without inventing a pair of entries", () => {
    setCustomExercises([]);
    expect(parseVoiceEntries(T1).entries).toHaveLength(1);
    expect(parseVoiceEntries(T1).entries[0]).toMatchObject({ reps: 4, weightKg: 16, implements: 2 });
    expect(parseVoiceEntries(T6).entries.map((e) => [e.name, e.reps, e.weightKg, e.implements])).toEqual([
      ["Jerk", 2, 24, 2],
      ["Jerk", 4, 20, 2],
      ["Jerk", 8, 16, 2],
    ]);
  });
});

describe("pair or per side — where the side phrase sits", () => {
  // After a WEIGHT it is one implement per hand.
  it.each<[string, string, number, number]>([
    ["8 clean and press with 16 in each hand", "kb-clean-and-press", 8, 16],
    ["8 clean and press, 16 kilos each side", "kb-clean-and-press", 8, 16],
    ["8 clean and press with 16 kilograms on each side", "kb-clean-and-press", 8, 16],
    ["8 snatches with 16 kilos per side", "kb-snatch", 8, 16],
    ["8 snatches with 16 kilos a side", "kb-snatch", 8, 16],
    ["8 snatches with 16 kilos in both hands", "kb-snatch", 8, 16],
    ["8 snatches with 16s each side", "kb-snatch", 8, 16],
    ["8 snatches with 35 pounds on each side", "kb-snatch", 8, 15.9],
    ["8 snatches with a 20 kilo kettlebell on each side", "kb-snatch", 8, 20],
    ["10 swings with two 24 kilo kettlebells", "kb-swing", 10, 24],
    ["8 kettlebell presses, 16 kilos each side", "kb-press", 8, 16],
    ["8 kettlebell presses, 16 kilos, on each side", "kb-press", 8, 16],
    ["10 goblet squats with 20 kilo kettlebells each side", "kb-goblet-squat", 10, 20],
    ["diez sentadillas goblet con 16 kilos en cada mano", "kb-goblet-squat", 10, 16],
  ])("pair: %s", (said, exercise, reps, weightKg) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise, reps, weightKg, implements: 2, needsReview: false }]);
    expect(result.entries[0].spoken?.count).toBe(2);
    expect(result.confident).toBe(true);
  });

  // After the reps or the movement it is reps per side — one implement.
  it.each<[string, string, number, number]>([
    ["8 snatches each side with a 20", "kb-snatch", 8, 20],
    ["10 one-arm swings each side with a 20", "kb-one-arm-swing", 10, 20],
    ["10 snatches a side at 16 kilos", "kb-snatch", 10, 16],
    ["8 kettlebell presses each side, 16 kilos", "kb-press", 8, 16],
    ["8 kettlebell presses per side with the 16", "kb-press", 8, 16],
    ["8 snatches on each side with a 20 kilo kettlebell", "kb-snatch", 8, 20],
    ["5 turkish get ups each side at 16 kilos", "kb-turkish-get-up", 5, 16],
    ["6 half snatches each side with the 20", "kb-half-snatch", 6, 20],
  ])("per side: %s", (said, exercise, reps, weightKg) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise, reps, weightKg, perSide: true, needsReview: false }]);
    expect(result.entries[0]).not.toHaveProperty("implements");
    expect(result.confident).toBe(true);
  });

  it("the brief's pair of sentences differ only in where 'each side' falls", () => {
    // ("presses" on its own is still only offered as the Kettlebell Press — that flag is about the name.)
    const reps = only("8 presses each side, 16 kilos");
    expect(reps).toMatchObject({ exercise: "kb-press", reps: 8, weightKg: 16, perSide: true });
    expect(reps).not.toHaveProperty("implements");
    const pair = only("8 presses, 16 kilos each side");
    expect(pair).toMatchObject({ exercise: "kb-press", reps: 8, weightKg: 16, implements: 2 });
    expect(pair).not.toHaveProperty("perSide");
  });

  it("both can be said at once", () => {
    expect(row(only("8 lunges each side with 16 kilos in each hand"))).toEqual({
      exercise: "lunge",
      reps: 8,
      weightKg: 16,
      implements: 2,
      perSide: true,
      needsReview: false,
    });
  });

  // A bare number ("the 20", "a 20", "16") is only tied to the side phrase by a hand word or on/in.
  it.each<[string, string, number, number]>([
    ["8 snatches with a 20 each side", "kb-snatch", 8, 20],
    ["8 snatches with the 20 each side", "kb-snatch", 8, 20],
    ["3 by 8 snatches with the 20 per side", "kb-snatch", 8, 20],
    ["8 kettlebell presses at 16 a side", "kb-press", 8, 16],
  ])("a bare number then a bare 'each side' is one bell, reps per side: %s", (said, exercise, reps, weightKg) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, reps, weightKg, perSide: true, needsReview: false });
    expect(result.entries[0]).not.toHaveProperty("implements");
    expect(result.confident).toBe(true);
  });

  it.each<[string, string, number, number]>([
    ["8 snatches with 16 on each side", "kb-snatch", 8, 16],
    ["8 snatches with a 20 in each hand", "kb-snatch", 8, 20],
    ["8 snatches with the 20 in both hands", "kb-snatch", 8, 20],
  ])("a bare number then where it is held is a pair: %s", (said, exercise, reps, weightKg) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise, reps, weightKg, implements: 2, needsReview: false }]);
    expect(result.confident).toBe(true);
  });

  it("an explicit single with a bare 'each side' stays single, per side — and is not vouched for", () => {
    const result = parseVoiceEntries("8 snatches with a 20 kilo kettlebell each side");
    expect(result.entries.map(row)).toEqual([
      { exercise: "kb-snatch", reps: 8, weightKg: 20, perSide: true, needsReview: true, reason: "ambiguous_weight" },
    ]);
    expect(result.confident).toBe(false);
    // Said as WHERE the bell is, or of a hand, there is nothing to doubt.
    expect(row(only("8 snatches with a 20 kilo kettlebell on each side"))).toEqual({
      exercise: "kb-snatch",
      reps: 8,
      weightKg: 20,
      implements: 2,
      needsReview: false,
    });
  });

  it("a side phrase with no weight anywhere is still reps per side", () => {
    expect(only("10 swings with a kettlebell on each side")).toMatchObject({ reps: 10, perSide: true });
    expect(only("10 lunges, each side")).toMatchObject({ exercise: "lunge", reps: 10, perSide: true });
    expect(only("10 lunges each leg with 16 kilos")).toMatchObject({ reps: 10, perSide: true, weightKg: 16 });
  });

  it("'each arm' / 'each leg' after a weight stay reps per side — only side and hand words make a pair", () => {
    const entry = only("8 kettlebell presses with 16 kilos each arm");
    expect(entry).toMatchObject({ exercise: "kb-press", reps: 8, weightKg: 16, perSide: true });
    expect(entry).not.toHaveProperty("implements");
  });
});

describe("double-handed", () => {
  it.each<[string, string, number, number]>([
    ["8 double-handed snatches with 16 kilos", "kb-snatch", 8, 16],
    ["8 double handed snatches with the 16", "kb-snatch", 8, 16],
    ["8 double hand snatches at 16 kilograms", "kb-snatch", 8, 16],
    ["8 double snatches with the 24", "kb-snatch", 8, 24],
    ["five double snatches, 20s", "kb-snatch", 5, 20],
    ["8 double kettlebell front squats with 24s", "kb-front-squat", 8, 24],
    ["10 double front squats with 24s", "kb-front-squat", 10, 24],
    ["6 double-handed clean and press at 20", "kb-clean-and-press", 6, 20],
    ["double-handed swings 10 with 24 kilos", "kb-swing", 10, 24],
  ])("a pair: %s", (said, exercise, reps, weightKg) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise, reps, weightKg, implements: 2, needsReview: false }]);
    expect(result.confident).toBe(true);
  });

  it.each(["8 double-handed snatches with a 24", "8 double snatches with one 24", "8 double-handed snatches with a single 24"])(
    "an explicit single wins: %s",
    (said) => {
      const entry = only(said);
      expect(entry).toMatchObject({ exercise: "kb-snatch", reps: 8, weightKg: 24, needsReview: false });
      expect(entry).not.toHaveProperty("implements");
    }
  );

  it("with no weight said there is nothing to call a pair", () => {
    const entry = only("8 double-handed snatches");
    expect(entry).toMatchObject({ exercise: "kb-snatch", reps: 8, needsReview: false });
    expect(entry).not.toHaveProperty("implements");
    expect(entry).not.toHaveProperty("weightKg");
  });

  it("is stripped from an unknown movement's name too", () => {
    expect(only("8 double-handed bear crawls")).toMatchObject({ name: "Bear Crawl", reps: 8, reason: "new_exercise" });
  });

  it("a bare 'double' in front of something unknown is part of its name", () => {
    expect(only("50 double unders")).toMatchObject({ name: "Double Under", reps: 50, reason: "new_exercise" });
  });

  it("two-handed, single-hand, one-arm and hand-to-hand are other movements, not pair cues", () => {
    setCustomExercises([
      { id: "two-hand-clean", name: "Two-Hand Clean", category: "kettlebell", aliases: [] },
      { id: "single-hand-swing", name: "Single-Hand Swing", category: "kettlebell", aliases: [] },
      { id: "hand-to-hand-kettlebell-swing", name: "Hand-to-Hand Kettlebell Swing", category: "kettlebell", aliases: ["hand to hand swing"] },
    ]);
    for (const [said, exercise] of [
      ["5 two-hand cleans with the 24", "two-hand-clean"],
      ["10 single-hand swings with the 20", "single-hand-swing"],
      ["10 hand-to-hand swings with the 20", "hand-to-hand-kettlebell-swing"],
      ["10 hand to hand kettlebell swings with the 20", "hand-to-hand-kettlebell-swing"],
      ["10 one-arm swings with the 20", "kb-one-arm-swing"],
    ] as const) {
      const result = parseVoiceEntries(said);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({ exercise, needsReview: false });
      expect(result.entries[0]).not.toHaveProperty("implements");
      expect(result.confident).toBe(true);
    }
    // …and a two-handed movement that is not minted is not quietly turned into a pair either.
    setCustomExercises([]);
    expect(only("5 two-handed swings with the 24")).not.toHaveProperty("implements");
  });
});

describe("plural folding", () => {
  it.each<[string, string, ParsedVoiceEntry["matchedBy"]]>([
    ["jerks", "jerk", "exact"],
    ["clean and jerks", "kettlebell-clean-and-jerk", "alias"],
    ["cleans and jerks", "kettlebell-clean-and-jerk", "alias"],
    ["long cycles", "kettlebell-clean-and-jerk", "alias"],
    ["kettlebell clean and jerks", "kettlebell-clean-and-jerk", "exact"],
    ["half snatches", "kb-half-snatch", "alias"],
    ["half snatch", "kb-half-snatch", "alias"],
    ["kettlebell half snatches", "kb-half-snatch", "exact"],
    ["front squats", "front-squat", "exact"],
    ["kettlebell deadlifts", "kb-deadlift", "exact"],
    ["kettlebell front squats", "kb-front-squat", "exact"],
    ["side raises", "lateral-raise", "alias"],
    ["hip thrusts", "hip-thrust", "alias"],
  ])("%s is %s at full score (%s)", (spoken, id, by) => {
    setCustomExercises(HIS_CUSTOMS);
    const match = matchSpokenExercise(spoken);
    expect(match.def?.id).toBe(id);
    expect(match.score).toBe(1);
    expect(match.by).toBe(by);
  });

  it.each<[string, string]>([
    ["kettlebell jerks", "jerk"],
    ["heavy jerks", "jerk"],
    ["heavy half snatches", "kb-half-snatch"],
    ["kettlebell clean and presses", "kb-clean-and-press"],
  ])("a plural under a harmless qualifier is a clean containment: %s", (spoken, id) => {
    setCustomExercises(HIS_CUSTOMS);
    expect(matchSpokenExercise(spoken)).toMatchObject({ def: { id }, score: 0.85, by: "contains" });
  });

  it("'half snatch' beats 'snatch'", () => {
    expect(matchSpokenExercise("half snatch").def?.id).toBe("kb-half-snatch");
    expect(matchSpokenExercise("half snatches").def?.id).toBe("kb-half-snatch");
    expect(matchSpokenExercise("heavy half snatches").def?.id).toBe("kb-half-snatch");
    expect(matchSpokenExercise("snatches").def?.id).toBe("kb-snatch");
    expect(ids("8 half snatches and 8 snatches")).toEqual(["kb-half-snatch", "kb-snatch"]);
  });

  it("spacing and mishearings are still only fuzzy", () => {
    expect(matchSpokenExercise("dead lifts")).toMatchObject({ score: 0.8, by: "fuzzy" });
    expect(matchSpokenExercise("squads")).toMatchObject({ score: 0.75, by: "fuzzy" });
    expect(matchSpokenExercise("rows").def).toBeNull();
  });

  it.each<[string, string]>([
    ["10 kettlebell deadlifts", "kb-deadlift"],
    ["10 kettlebell clean and presses", "kb-clean-and-press"],
    ["10 front squats", "front-squat"],
    ["10 double kettlebell front squats", "kb-front-squat"],
    ["8 jerks", "jerk"],
    ["8 clean and jerks", "kettlebell-clean-and-jerk"],
    ["8 cleans and jerks with two 16s", "kettlebell-clean-and-jerk"],
    ["4 long cycles", "kettlebell-clean-and-jerk"],
    ["8 kettlebell jerks with two 20s", "jerk"],
  ])("%s is a confident %s", (said, exercise) => {
    setCustomExercises(HIS_CUSTOMS);
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise, needsReview: false });
    expect(result.confident).toBe(true);
  });
});

describe("restatement — one thing said two ways is one entry", () => {
  beforeEach(() => setCustomExercises(HIS_CUSTOMS));

  it.each([
    "4 long cycles, which are 4 clean and jerks with two 16s",
    "4 long cycles which is 4 clean and jerks, two 16s",
    "4 long cycles, that is 4 clean and jerks with two 16s",
    "4 long cycles, that's clean and jerks, with two 16s",
    "4 long cycles aka clean and jerks with two 16s",
    "4 long cycles, i.e. clean and jerks, with two 16s",
    "long cycles, meaning clean and jerks, 4 reps with two 16s",
    "4 long cycles, also known as clean and jerks, with double 16s",
  ])("%s", (said) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([
      { exercise: "kettlebell-clean-and-jerk", reps: 4, weightKg: 16, implements: 2, needsReview: false },
    ]);
    expect(result.confident).toBe(true);
  });

  it("prefers the name it knows, whichever side it is on", () => {
    setCustomExercises([]);
    expect(only("10 skull crushers, which are 10 tricep extensions")).toMatchObject({
      exercise: "tricep-extension",
      reps: 10,
    });
    expect(only("10 tricep extensions, which are 10 skull crushers")).toMatchObject({
      exercise: "tricep-extension",
      reps: 10,
    });
    expect(only("10 skull crushers, aka nose breakers")).toMatchObject({ name: "Skull Crusher", reps: 10 });
  });

  it("takes each quantity from whichever side said it", () => {
    expect(row(only("long cycles with two 16s, which are 4 clean and jerks"))).toEqual({
      exercise: "kettlebell-clean-and-jerk",
      reps: 4,
      weightKg: 16,
      implements: 2,
      needsReview: false,
    });
    expect(only("10 swings, that is 3 sets")).toMatchObject({ exercise: "kb-swing", reps: 10, sets: 3 });
  });

  it("a restatement that disagrees with itself is kept as first said, and flagged", () => {
    const result = parseVoiceEntries("4 long cycles, which are 6 clean and jerks");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ exercise: "kettlebell-clean-and-jerk", reps: 4, needsReview: true });
    expect(result.confident).toBe(false);
  });

  it("'or rather' is a correction — the later one stands", () => {
    const result = parseVoiceEntries("10 swings, or rather 12 swings");
    expect(result.entries.map(row)).toEqual([{ exercise: "kb-swing", reps: 12, needsReview: false }]);
    expect(only("10 swings, or rather 10 snatches")).toMatchObject({ exercise: "kb-snatch", reps: 10 });
  });

  it("two movements known to be different are never folded into one", () => {
    const result = parseVoiceEntries("10 swings, that is 10 push ups");
    expect(result.entries.map((e) => e.exercise)).toEqual(["kb-swing", "push-up"]);
    expect(result.confident).toBe(false);
  });

  it("a leading 'that's' is just a lead-in", () => {
    expect(row(only("that's 10 swings"))).toEqual({ exercise: "kb-swing", reps: 10, needsReview: false });
    expect(row(only("10 swings and that's it"))).toEqual({ exercise: "kb-swing", reps: 10, needsReview: false });
  });
});

describe("a leading bare number is the reps of what follows", () => {
  it.each<[string, Partial<ParsedVoiceEntry>]>([
    ["Eight. Clean and press, 16 kilograms on each side.", { exercise: "kb-clean-and-press", reps: 8, weightKg: 16, implements: 2 }],
    ["Eight. Swings.", { exercise: "kb-swing", reps: 8 }],
    ["Ten, kettlebell swings with the 24.", { exercise: "kb-swing", reps: 10, weightKg: 24 }],
    ["Twelve. Push ups.", { exercise: "push-up", reps: 12 }],
    ["30 seconds. Plank.", { exercise: "plank", seconds: 30 }],
    ["Eight. 16 kilograms on each side. Clean and press.", { exercise: "kb-clean-and-press", reps: 8, weightKg: 16, implements: 2 }],
    ["Eight. Clean and press 16 kilograms, on each side.", { exercise: "kb-clean-and-press", reps: 8, weightKg: 16, implements: 2 }],
    ["Eight. Clean and press, 16 kilograms. On each side.", { exercise: "kb-clean-and-press", reps: 8, weightKg: 16, implements: 2 }],
  ])("%s", (said, expected) => {
    const result = parseVoiceEntries(said);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ ...expected, needsReview: false });
    expect(result.confident).toBe(true);
  });

  it("a movement that brings its own count leaves the stray number on its own, flagged", () => {
    const result = parseVoiceEntries("Eight. Ten swings.");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ name: "", reps: 8, reason: "unparsed" });
    expect(result.entries[1]).toMatchObject({ exercise: "kb-swing", reps: 10 });
    expect(result.confident).toBe(false);
  });

  it("a number with nothing after it is still unparsed", () => {
    expect(only("Eight.")).toMatchObject({ name: "", reps: 8, reason: "unparsed" });
  });
});

describe("intervals", () => {
  it.each<[string, string, number, number]>([
    ["10 rounds of 30 seconds on 30 seconds off jump rope", "jump-rope", 30, 10],
    ["jump rope 30 on 30 off for 10 minutes", "jump-rope", 30, 10],
    ["jump rope 30/30 for 10 minutes", "jump-rope", 30, 10],
    ["jump rope, 30 on 30 off, 10 minutes", "jump-rope", 30, 10],
    ["30 on 30 off. Jump rope for 10 minutes.", "jump-rope", 30, 10],
    ["30 seconds on and 30 seconds off jump rope 10 times", "jump-rope", 30, 10],
    ["10 minutes of 30 seconds on, 30 seconds off, jumping rope", "jump-rope", 30, 10],
    ["jump rope intervals for 10 minutes, 30 second on, 30 second off", "jump-rope", 30, 10],
    ["20 seconds on 10 seconds off for 4 minutes of burpees", "burpee", 20, 8],
    ["burpees 40 on 20 off for 5 minutes", "burpee", 40, 5],
    ["jump rope 1 minute on 30 seconds off for 6 minutes", "jump-rope", 60, 4],
    ["jump rope 2 minutes on 1 off, 5 rounds", "jump-rope", 120, 5],
    ["saltar la cuerda 30 on 30 off for 5 minutes", "jump-rope", 30, 5],
  ])("%s → %s, %is × %i", (said, exercise, seconds, sets) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise, seconds, sets, needsReview: false }]);
    expect(result.confident).toBe(true);
  });

  it("with no total and no rounds there are seconds and nothing made up", () => {
    const entry = only("jump rope 30 seconds on 30 seconds off");
    expect(row(entry)).toEqual({ exercise: "jump-rope", seconds: 30, needsReview: false });
    expect(entry).not.toHaveProperty("sets");
  });

  it("stated rounds win over the arithmetic", () => {
    expect(only("8 rounds of 30 on 30 off jump rope for 10 minutes")).toMatchObject({ seconds: 30, sets: 8 });
  });

  it.each<[string, number, number]>([
    ["10 minute EMOM of 5 burpees", 10, 5],
    ["EMOM 10 minutes 5 burpees", 10, 5],
    ["EMOM for 10 minutes, 5 burpees", 10, 5],
    ["EMOM, 10 minutes, 5 burpees", 10, 5],
    ["5 burpees EMOM for 8 minutes", 8, 5],
    ["5 burpees every minute on the minute for 10 minutes", 10, 5],
    ["every minute on the minute for 12 minutes, 5 burpees", 12, 5],
    ["5 burpees on the minute for 10 minutes", 10, 5],
    ["5 burpees, EMOM, 10 minutes", 10, 5],
    ["10 minutes, EMOM, 5 burpees", 10, 5],
  ])("%s → %i sets of %i", (said, sets, reps) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map(row)).toEqual([{ exercise: "burpee", sets, reps, needsReview: false }]);
    expect(result.confident).toBe(true);
  });

  it.each([
    "EMOM for 10 minutes, 5 burpees and 10 swings",
    "10 minute EMOM: 5 burpees, 10 swings",
    "5 burpees and 10 swings every minute on the minute for 10 minutes",
    "5 burpees and 10 swings, EMOM, 10 minutes",
  ])("an EMOM covers every movement in it, wherever it is said: %s", (said) => {
    const result = parseVoiceEntries(said);
    expect(result.entries.map((e) => [e.exercise, e.sets, e.reps])).toEqual([
      ["burpee", 10, 5],
      ["kb-swing", 10, 10],
    ]);
    expect(result.confident).toBe(true);
  });

  it("an EMOM of holds keeps the hold — only a length said on its own is the block", () => {
    expect(row(only("10 minute EMOM of 30 second plank"))).toEqual({
      exercise: "plank",
      seconds: 30,
      sets: 10,
      needsReview: false,
    });
    expect(row(only("30 second plank, EMOM, 10 minutes"))).toEqual({
      exercise: "plank",
      seconds: 30,
      sets: 10,
      needsReview: false,
    });
    expect(row(only("30 second plank, EMOM"))).toEqual({ exercise: "plank", seconds: 30, needsReview: false });
  });

  it("an interval block sits beside an ordinary entry without leaking into it", () => {
    const { entries } = parseVoiceEntries("10 swings then 30 on 30 off jump rope for 5 minutes");
    expect(entries.map(row)).toEqual([
      { exercise: "kb-swing", reps: 10, needsReview: false },
      { exercise: "jump-rope", seconds: 30, sets: 5, needsReview: false },
    ]);
  });

  it.each(["EMOMs", "intervals", "EMOM", "every minute on the minute"])("%s alone is not a movement", (said) => {
    expect(parseVoiceEntries(said).entries).toEqual([]);
  });

  it("descriptor words never reach a name", () => {
    expect(only("10 swings EMOM")).toMatchObject({ name: "Kettlebell Swing", reps: 10, needsReview: false });
    expect(only("jump rope intervals, 2 minutes")).toMatchObject({ name: "Jump Rope", seconds: 120 });
    expect(only("the last 10 minutes were jumping rope")).toMatchObject({ exercise: "jump-rope", seconds: 600 });
    expect(only("10 bear crawls EMOM").name).toBe("Bear Crawl");
  });

  it("plain durations are untouched", () => {
    expect(only("plank for 45 seconds")).toMatchObject({ seconds: 45 });
    expect(only("10 minutes of jump rope")).toMatchObject({ exercise: "jump-rope", seconds: 600 });
    expect(only("10 minutes of jump rope")).not.toHaveProperty("sets");
  });

  it("the folded pattern is what the parser reports working on", () => {
    expect(parseVoiceEntries("Jump rope, 30 second on, 30 second off.").normalized).toBe(
      "jump rope, 30s on 30s off"
    );
  });
});

describe("plausibility — a kettlebell he cannot have used", () => {
  const last = (said: string, bells?: number[]) =>
    finalizeVoiceEntries(parseVoiceEntries(said, { bells }).entries, { bells });

  it.each<[string, number[] | undefined]>([
    ["8 snatches with a 60 kilo kettlebell", RACK],
    ["8 snatches with a 60 kilo kettlebell", undefined],
    ["8 snatches with a 50", undefined],
    ["8 snatches with an 18", RACK],
    ["8 snatches with two 28s", RACK],
    ["8 clean and press, 60 kilograms on each side", undefined],
    ["5 squats with a 60 kilo kettlebell", undefined],
    ["8 swings with a 100 pound kettlebell", RACK],
  ])("flagged, number untouched: %s (rack %j)", (said, bells) => {
    const result = parseVoiceEntries(said, { bells });
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry).toMatchObject({ needsReview: true, reason: "ambiguous_weight" });
    expect(entry.confidence).toBeLessThanOrEqual(0.6);
    expect(result.confident).toBe(false);
    // What was heard is what is reported.
    const heard = Number(/\d+/.exec(said.replace(/^\d+/, ""))?.[0]);
    expect(entry.spoken?.each).toBe(heard);
    if (entry.spoken?.unit !== "lb") expect(entry.weightKg).toBe(heard);
    expect(last(said, bells).map(row)).toEqual(result.entries.map(row));
  });

  it.each<[string, number[] | undefined]>([
    ["8 snatches with a 16", RACK],
    ["8 snatches with two 24s", RACK],
    ["8 snatches with a 16 kilo kettlebell", RACK],
    ["8 snatches with a 35 pound kettlebell", RACK], // his 16, said in pounds
    ["8 snatches with a 53 pound kettlebell", RACK],
    ["8 snatches with a 48 kilo kettlebell", undefined],
    ["8 snatches with an 18", undefined],
    ["8 snatches with an 18", []],
    ["8 snatches", RACK],
  ])("clean: %s (rack %j)", (said, bells) => {
    const result = parseVoiceEntries(said, { bells });
    expect(result.entries[0].needsReview).toBe(false);
    expect(result.confident).toBe(true);
    expect(last(said, bells)[0].needsReview).toBe(false);
  });

  it.each([
    "5 deadlifts at 60 kilos",
    "5 squats barbell at 60 kilos",
    "bench press 80 kg for 8",
    "5 by 5 deadlifts at 100 kilos",
    "10 curls with a pair of 30 kilo dumbbells",
  ])("a barbell or dumbbell movement is never flagged by this rule: %s", (said) => {
    const result = parseVoiceEntries(said, { bells: RACK });
    expect(result.entries[0].needsReview).toBe(false);
    expect(result.confident).toBe(true);
    expect(last(said, RACK)[0].needsReview).toBe(false);
  });

  it("applies to entries from either parser — the last look catches a model entry too", () => {
    const fromModel: ParsedVoiceEntry = {
      name: "Clean and Press",
      exercise: "kb-clean-and-press",
      reps: 8,
      weightKg: 60,
      implements: 2,
      spoken: { unit: "kg", each: 60, count: 2 },
      confidence: 0.9,
      needsReview: false,
      matchedBy: "exact",
    };
    const [flagged] = finalizeVoiceEntries([fromModel]);
    expect(flagged).toMatchObject({ weightKg: 60, implements: 2, needsReview: true, reason: "ambiguous_weight" });
    expect(flagged.confidence).toBeLessThanOrEqual(0.6);
    expect(fromModel.needsReview).toBe(false); // not mutated

    const [ok] = finalizeVoiceEntries([{ ...fromModel, weightKg: 16, spoken: { unit: "kg", each: 16, count: 2 } }], {
      bells: RACK,
    });
    expect(ok.needsReview).toBe(false);
    const [offRack] = finalizeVoiceEntries([{ ...fromModel, weightKg: 18 }], { bells: RACK });
    expect(offRack).toMatchObject({ weightKg: 18, needsReview: true, reason: "ambiguous_weight" });
    // A model entry it was already unsure of becomes, first of all, a weight to check.
    const [unsure] = finalizeVoiceEntries([{ ...fromModel, needsReview: true, reason: "low_match", confidence: 0.6 }]);
    expect(unsure.reason).toBe("ambiguous_weight");
    // A barbell entry at the same weight passes.
    const [barbell] = finalizeVoiceEntries([{ ...fromModel, name: "Deadlift", exercise: "deadlift" }], { bells: RACK });
    expect(barbell.needsReview).toBe(false);
  });

  it("still drops nameless fragments and still flags a weight on a bodyweight neighbour", () => {
    expect(finalizeVoiceEntries(parseVoiceEntries("another 10").entries, { bells: RACK })).toEqual([]);
    const out = finalizeVoiceEntries(parseVoiceEntries("8 swings and 8 push ups with the 20").entries, { bells: RACK });
    expect(out.find((e) => e.exercise === "push-up")).toMatchObject({ weightKg: 20, reason: "ambiguous_weight" });
  });
});

describe("carry-over from the previous entry", () => {
  const previous = {
    name: "Kettlebell Clean and Jerk",
    exercise: "kettlebell-clean-and-jerk",
    reps: 4,
    weightKg: 16,
    implements: 2 as const,
  };
  beforeEach(() => setCustomExercises(HIS_CUSTOMS));

  it.each<[string, Partial<ParsedVoiceEntry>]>([
    ["another 8", { reps: 8, weightKg: 16, implements: 2 }],
    ["8 more", { reps: 8, weightKg: 16, implements: 2 }],
    ["Another eight.", { reps: 8, weightKg: 16, implements: 2 }],
    ["8", { reps: 8, weightKg: 16, implements: 2 }],
    ["same again", { reps: 4, weightKg: 16, implements: 2 }],
    ["same thing", { reps: 4, weightKg: 16, implements: 2 }],
    ["again", { reps: 4, weightKg: 16, implements: 2 }],
    ["another set", { reps: 4, weightKg: 16, implements: 2 }],
    ["one more set", { reps: 4, weightKg: 16, implements: 2 }],
    ["one more", { reps: 4, weightKg: 16, implements: 2 }],
    ["did it again", { reps: 4, weightKg: 16, implements: 2 }],
    ["same as before", { reps: 4, weightKg: 16, implements: 2 }],
    ["two more sets", { reps: 4, sets: 2, weightKg: 16, implements: 2 }],
    ["8 more at 20 kilos", { reps: 8, weightKg: 20, implements: 2 }],
    ["same again but with the 20", { reps: 4, weightKg: 20, implements: 2 }],
    ["8 more with two 20s", { reps: 8, weightKg: 20, implements: 2 }],
    ["8 more with 20s", { reps: 8, weightKg: 20, implements: 2 }],
    ["8 more with one 20", { reps: 8, weightKg: 20 }],
    ["one more rep", { reps: 1, weightKg: 16, implements: 2 }],
    ["otra vez", { reps: 4, weightKg: 16, implements: 2 }],
  ])("%s → the previous movement again", (said, expected) => {
    const result = parseVoiceEntries(said, { previous });
    expect(result.entries.map(row)).toEqual([
      { exercise: "kettlebell-clean-and-jerk", needsReview: false, ...expected },
    ]);
    expect(result.entries[0].name).toBe("Kettlebell Clean and Jerk");
    expect(result.confident).toBe(true);
    expect(finalizeVoiceEntries(result.entries)).toHaveLength(1);
  });

  it.each(["another 8", "8 more", "same again", "another set", "one more set", "same thing", "again", "8 more at 20 kilos"])(
    "without a previous entry nothing changes: %s",
    (said) => {
      const result = parseVoiceEntries(said);
      for (const entry of result.entries) expect(entry).toMatchObject({ name: "", needsReview: true, reason: "unparsed" });
      expect(result.confident).toBe(false);
      expect(finalizeVoiceEntries(result.entries)).toEqual([]);
    }
  );

  it("without a previous entry the fragments are exactly what they were", () => {
    expect(parseVoiceEntries("same again").entries).toEqual([]);
    expect(parseVoiceEntries("again").entries).toEqual([]);
    expect(only("another 8")).toMatchObject({ name: "", reps: 8 });
    expect(only("one more set")).toMatchObject({ name: "", sets: 1 });
    expect(only("8 more at 20 kilos")).toMatchObject({ name: "", reps: 8, weightKg: 20 });
  });

  it("inherits per-side reps and the vest, and does not inherit sets", () => {
    const sided = {
      name: "Kettlebell Snatch",
      exercise: "kb-snatch",
      reps: 8,
      sets: 3,
      weightKg: 20,
      perSide: true,
      load: { type: "vest" as const, kg: 5, assumed: true },
    };
    expect(row(only("another 6", { previous: sided }))).toEqual({
      exercise: "kb-snatch",
      reps: 6,
      weightKg: 20,
      perSide: true,
      load: { type: "vest", kg: 5, assumed: true },
      needsReview: false,
    });
    expect(only("same again", { previous: sided })).not.toHaveProperty("sets");
    expect(only("6 more with the 24", { previous: sided })).toMatchObject({ reps: 6, weightKg: 24, perSide: true });
    expect(only("6 more with the 24", { previous: sided })).not.toHaveProperty("implements");
  });

  it("a hold carries as a hold", () => {
    const plank = { name: "Plank", exercise: "plank", seconds: 45 };
    expect(row(only("another 30", { previous: plank }))).toEqual({ exercise: "plank", seconds: 30, needsReview: false });
    expect(row(only("another 30 seconds", { previous: plank }))).toEqual({ exercise: "plank", seconds: 30, needsReview: false });
    expect(row(only("same again", { previous: plank }))).toEqual({ exercise: "plank", seconds: 45, needsReview: false });
  });

  it("a nameless clip said in pieces is still one carried entry", () => {
    expect(row(only("another 8, each side", { previous }))).toEqual({
      exercise: "kettlebell-clean-and-jerk",
      reps: 8,
      weightKg: 16,
      implements: 2,
      perSide: true,
      needsReview: false,
    });
    expect(only("Another 8. With the 20s.", { previous })).toMatchObject({ reps: 8, weightKg: 20, implements: 2 });
    expect(only("again, 6", { previous })).toMatchObject({ reps: 6, weightKg: 16, implements: 2, needsReview: false });
  });

  it("several counts in one nameless clip are several sets of it", () => {
    const { entries } = parseVoiceEntries("another 8, then 6", { previous });
    expect(entries.map((e) => [e.exercise, e.reps, e.weightKg, e.implements])).toEqual([
      ["kettlebell-clean-and-jerk", 8, 16, 2],
      ["kettlebell-clean-and-jerk", 6, 16, 2],
    ]);
  });

  it("is flagged when something else is wrong", () => {
    // an unbelievable restated weight
    expect(only("8 more at 60 kilos", { previous })).toMatchObject({
      exercise: "kettlebell-clean-and-jerk",
      reps: 8,
      weightKg: 60,
      needsReview: true,
      reason: "ambiguous_weight",
    });
    // a previous movement that was never minted
    expect(only("another 8", { previous: { name: "Bear Crawl", reps: 10 } })).toMatchObject({
      name: "Bear Crawl",
      reps: 8,
      needsReview: true,
      reason: "new_exercise",
    });
    // nothing to carry a quantity from
    expect(only("again", { previous: { name: "Kettlebell Swing", exercise: "kb-swing" } })).toMatchObject({
      exercise: "kb-swing",
      needsReview: true,
      reason: "no_quantity",
    });
  });

  it("a clip that names a movement is not a carry-over", () => {
    expect(row(only("10 swings", { previous }))).toEqual({ exercise: "kb-swing", reps: 10, needsReview: false });
    expect(row(only("another 10 swings", { previous }))).toEqual({ exercise: "kb-swing", reps: 10, needsReview: false });
    expect(row(only("one more set of 10 swings", { previous }))).toEqual({
      exercise: "kb-swing",
      reps: 10,
      sets: 1,
      needsReview: false,
    });
  });

  it("noise is still noise", () => {
    for (const said of ["", "thank you", "more", "another", "no more", "what a beautiful day", "20 kilos", "with a vest"]) {
      expect(finalizeVoiceEntries(parseVoiceEntries(said, { previous }).entries)).toEqual([]);
    }
  });

  it("an unusable previous entry is ignored", () => {
    for (const bad of [{ name: "" }, { name: "   " }, null, 7] as unknown as Array<VoiceParseOptions["previous"]>) {
      expect(finalizeVoiceEntries(parseVoiceEntries("another 8", { previous: bad }).entries)).toEqual([]);
    }
  });
});
