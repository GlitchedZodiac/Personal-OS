import { afterEach, describe, expect, it } from "vitest";
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
  it.each<[string, string, number, ParsedVoiceEntry["spoken"]]>([
    ["10 kettlebell presses with one 24 kilo", "kb-press", 24, { each: 24, unit: "kg", count: 1 }],
    ["10 swings with a 24", "kb-swing", 24, { each: 24, count: 1 }],
    ["10 swings with a single 24", "kb-swing", 24, { each: 24, count: 1 }],
    ["single 24 swings 10", "kb-swing", 24, { each: 24, count: 1 }],
    ["10 clean and press with two 16s", "kb-clean-and-press", 32, { each: 16, count: 2 }],
    ["10 clean and press with two 16's", "kb-clean-and-press", 32, { each: 16, count: 2 }],
    ["10 clean and press with double 16", "kb-clean-and-press", 32, { each: 16, count: 2 }],
    ["10 clean and press double 16s", "kb-clean-and-press", 32, { each: 16, count: 2 }],
    ["10 clean and press with 2 x 16", "kb-clean-and-press", 32, { each: 16, count: 2 }],
    ["10 goblet squats with a pair of 20s", "kb-goblet-squat", 40, { each: 20, count: 2 }],
    ["10 curls with a pair of 20 kilo dumbbells", "bicep-curl", 40, { each: 20, unit: "kg", count: 2 }],
    ["10 curls pair of 20 kilo dumbbells", "bicep-curl", 40, { each: 20, unit: "kg", count: 2 }],
    ["10 swings with two 35 pound kettlebells", "kb-swing", 31.8, { each: 35, unit: "lb", count: 2 }],
    ["10 swings two kettlebells at 16 kilos each", "kb-swing", 32, { each: 16, unit: "kg", count: 2 }],
    ["10 swings with two 16 kilo kettlebells", "kb-swing", 32, { each: 16, unit: "kg", count: 2 }],
  ])("%s → %s, %f kg total", (said, exercise, weightKg, spoken) => {
    const entry = only(said);
    expect(entry).toMatchObject({ exercise, reps: 10, weightKg });
    expect(entry.spoken).toEqual(spoken);
  });

  it("double 16s clean and press 6 reps", () => {
    const result = parseVoiceEntries("double 16s clean and press 6 reps");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      name: "Clean and Press",
      exercise: "kb-clean-and-press",
      reps: 6,
      weightKg: 32,
      spoken: { each: 16, count: 2 },
    });
    expect(result.confident).toBe(true);
  });

  it.each<[string, number]>([
    ["10 swings with 24 kilos each hand", 48],
    ["10 swings with 24 kilos in each hand", 48],
    ["10 swings with a 16 kilo kettlebell in each hand", 32],
  ])("a weight 'in each hand' is two implements, not reps per side: %s", (said, weightKg) => {
    const entry = only(said);
    expect(entry).toMatchObject({ exercise: "kb-swing", reps: 10, weightKg, spoken: { count: 2 } });
    expect(entry).not.toHaveProperty("perSide");
    expect(only("10 swings each hand")).toMatchObject({ reps: 10, perSide: true });
  });

  it("'the 24' does not claim a count", () => {
    expect(only("10 swings with the 24").spoken).toEqual({ each: 24 });
  });

  it("a plural with no count is read as a pair, and flagged", () => {
    const entry = only("10 swings with 16s");
    expect(entry).toMatchObject({ weightKg: 32, needsReview: true, reason: "ambiguous_weight" });
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
      weightKg: 48,
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
    ["10 kettlebell deadlifts", "kb-deadlift"],
    ["10 kettlebell clean and presses", "kb-clean-and-press"],
    ["10 front squats", "front-squat"],
    ["10 double kettlebell front squats", "kb-front-squat"],
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
    ["diez sentadillas con dos pesas rusas de dieciséis kilos", { exercise: "back-squat", reps: 10, weightKg: 32, spoken: { each: 16, unit: "kg", count: 2 } }],
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
      weightKg: 32,
      reason: "new_exercise",
    });
  });

  it("resolves a registered custom, plural and with a weight phrase", () => {
    setCustomExercises([renegadeRow]);
    const entry = only("8 renegade rows with two 16s");
    expect(entry).toMatchObject({ name: "Renegade Row", exercise: "renegade-row", reps: 8, weightKg: 32 });
    expect(entry.spoken).toEqual({ each: 16, count: 2 });
  });

  it("is confident on the custom's exact name", () => {
    setCustomExercises([renegadeRow]);
    const result = parseVoiceEntries("8 renegade row with two 16s");
    expect(result.entries[0]).toMatchObject({ exercise: "renegade-row", matchedBy: "exact", weightKg: 32 });
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
    ["double 16s clean and press 6 reps", "Clean and Press ×6 · 32 kg"],
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
    ["10 front squats", "low_match"],
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
