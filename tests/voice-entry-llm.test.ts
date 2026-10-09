import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The model is never called from tests: the client is a stub whose one method
// records what it was asked and returns whatever the test queued.
const mocks = vi.hoisted(() => ({ create: vi.fn(), recordAIUsage: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { create: mocks.create } } },
  CHAT_MODEL: "test-model",
}));
vi.mock("@/lib/ai-usage", () => ({ recordAIUsage: mocks.recordAIUsage }));

import { setCustomExercises } from "@/lib/exercises";
import { buildVoiceEntryPrompt, entryFromLLM, parseVoiceEntriesWithLLM } from "@/lib/voice-entry-llm";
import { finalizeVoiceEntries, voiceDisplayLine } from "@/lib/voice-entry-parser";

type ModelEntry = Parameters<typeof entryFromLLM>[0];

/** One model entry; override whatever the case is about. */
const said = (fields: Partial<ModelEntry>): ModelEntry => ({
  spokenName: "kettlebell swing",
  catalogId: "kb-swing",
  reps: 10,
  sets: null,
  seconds: null,
  weightEach: null,
  weightCount: null,
  weightUnit: null,
  vest: false,
  vestWeight: null,
  vestUnit: null,
  perSide: false,
  sure: true,
  ...fields,
});

const HIS_CUSTOMS = [
  {
    id: "kettlebell-clean-and-jerk",
    name: "Kettlebell Clean and Jerk",
    category: "kettlebell" as const,
    aliases: ["clean and jerk", "long cycle"],
  },
  { id: "jerk", name: "Jerk", category: "kettlebell" as const, aliases: [] },
];

/** Queue the model's answer for the next call. */
function answer(payload: unknown) {
  const content = typeof payload === "string" ? payload : JSON.stringify(payload);
  mocks.create.mockResolvedValueOnce({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 900, completion_tokens: 60 },
  });
  return content;
}

interface Asked {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format: { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } };
}
const asked = (call = 0) => mocks.create.mock.calls[call][0] as Asked;

beforeEach(() => {
  mocks.create.mockReset();
  mocks.recordAIUsage.mockReset();
});
afterEach(() => setCustomExercises([]));

describe("entryFromLLM — weight is one implement, a pair is `implements`", () => {
  it("weightEach 16 × weightCount 2 → weightKg 16, implements 2", () => {
    setCustomExercises(HIS_CUSTOMS);
    const entry = entryFromLLM(
      said({
        spokenName: "clean and jerk",
        catalogId: "kettlebell-clean-and-jerk",
        reps: 4,
        weightEach: 16,
        weightCount: 2,
        weightUnit: "kg",
      }),
      5
    );
    expect(entry).toMatchObject({
      name: "Kettlebell Clean and Jerk",
      exercise: "kettlebell-clean-and-jerk",
      reps: 4,
      weightKg: 16,
      implements: 2,
      spoken: { unit: "kg", each: 16, count: 2 },
      needsReview: false,
    });
    expect(entry).not.toHaveProperty("perSide");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.85);
    expect(voiceDisplayLine(entry!)).toBe("KB Clean and Jerk ×4 · 2×16 kg");
  });

  it.each<[number | null]>([[1], [null], [3], [0]])("weightCount %j is one implement", (weightCount) => {
    const entry = entryFromLLM(said({ weightEach: 24, weightCount, weightUnit: "kg" }), 5);
    expect(entry).toMatchObject({ weightKg: 24, spoken: { unit: "kg", each: 24, count: 1 } });
    expect(entry).not.toHaveProperty("implements");
    expect(voiceDisplayLine(entry!)).toBe("KB Swing ×10 · 24 kg");
  });

  it("converts pounds per implement — never doubles", () => {
    const pair = entryFromLLM(said({ weightEach: 35, weightCount: 2, weightUnit: "lb" }), 5);
    expect(pair).toMatchObject({ weightKg: 15.9, implements: 2, spoken: { unit: "lb", each: 35, count: 2 } });
    const single = entryFromLLM(said({ weightEach: 53, weightCount: 1, weightUnit: "lb" }), 5);
    expect(single).toMatchObject({ weightKg: 24 });
    expect(single).not.toHaveProperty("implements");
  });

  it("a weight out of range is dropped and flagged, pair or not", () => {
    const entry = entryFromLLM(said({ weightEach: 800, weightCount: 2, weightUnit: "kg" }), 5);
    expect(entry).toMatchObject({ needsReview: true, reason: "ambiguous_weight" });
    expect(entry).not.toHaveProperty("weightKg");
    expect(entry).not.toHaveProperty("implements");
    // 250 kg a hand used to be rejected as a 500 kg total; one implement of 250 is in range.
    expect(entryFromLLM(said({ weightEach: 250, weightCount: 2, weightUnit: "kg" }), 5)).toMatchObject({
      weightKg: 250,
      implements: 2,
    });
  });

  it("'double-handed' left in the name is a pair cue, not part of the movement", () => {
    setCustomExercises(HIS_CUSTOMS);
    const entry = entryFromLLM(
      said({ spokenName: "double-handed clean and jerk", catalogId: null, reps: 4, weightEach: 16, weightUnit: "kg" }),
      5
    );
    expect(entry).toMatchObject({ exercise: "kettlebell-clean-and-jerk", reps: 4, weightKg: 16, implements: 2 });
    expect(entry!.needsReview).toBe(false);
    // An explicit single from the model still wins.
    const single = entryFromLLM(
      said({ spokenName: "Double Handed Snatch", catalogId: "kb-snatch", weightEach: 24, weightCount: 1, weightUnit: "kg" }),
      5
    );
    expect(single).toMatchObject({ exercise: "kb-snatch", weightKg: 24, needsReview: false });
    expect(single).not.toHaveProperty("implements");
    // Unknown movement: the cue comes off the shown name as well.
    expect(entryFromLLM(said({ spokenName: "double-handed bear crawl", catalogId: null }), 5)).toMatchObject({
      name: "Bear Crawl",
      reason: "new_exercise",
    });
  });

  it("plural names from the model resolve like singular ones", () => {
    setCustomExercises(HIS_CUSTOMS);
    for (const [spokenName, id] of [
      ["jerks", "jerk"],
      ["clean and jerks", "kettlebell-clean-and-jerk"],
      ["long cycles", "kettlebell-clean-and-jerk"],
      ["half snatches", "kb-half-snatch"],
    ]) {
      const entry = entryFromLLM(said({ spokenName, catalogId: id }), 5);
      expect(entry).toMatchObject({ exercise: id, needsReview: false });
      expect(entry!.confidence).toBe(0.9);
    }
  });

  it("perSide, sets, seconds and a vest pass through unchanged", () => {
    expect(
      entryFromLLM(said({ spokenName: "snatch", catalogId: "kb-snatch", reps: 8, perSide: true, weightEach: 20, weightCount: 1, weightUnit: "kg" }), 5)
    ).toMatchObject({ exercise: "kb-snatch", reps: 8, perSide: true, weightKg: 20 });
    const rope = entryFromLLM(said({ spokenName: "jump rope", catalogId: "jump-rope", reps: null, seconds: 30, sets: 10 }), 5);
    expect(rope).toMatchObject({ exercise: "jump-rope", seconds: 30, sets: 10, needsReview: false });
    expect(rope).not.toHaveProperty("reps");
    expect(voiceDisplayLine(rope!)).toBe("Jump Rope 10×30s");
    expect(entryFromLLM(said({ spokenName: "squat", catalogId: "back-squat", vest: true }), 9)!.load).toEqual({
      type: "vest",
      kg: 9,
      assumed: true,
    });
    expect(entryFromLLM(said({ spokenName: "squat", catalogId: "back-squat", vest: true, vestWeight: 10, vestUnit: "kg" }), 9)!.load).toEqual({
      type: "vest",
      kg: 10,
    });
  });

  it("the old flags still hold: unknown movement, no quantity, a guess, an empty name", () => {
    expect(entryFromLLM(said({ spokenName: "bear crawl", catalogId: null }), 5)).toMatchObject({
      name: "Bear Crawl",
      needsReview: true,
      reason: "new_exercise",
    });
    expect(entryFromLLM(said({ reps: null }), 5)).toMatchObject({ needsReview: true, reason: "no_quantity" });
    expect(entryFromLLM(said({ sure: false }), 5)).toMatchObject({ needsReview: true, reason: "low_match" });
    expect(entryFromLLM(said({ spokenName: "   " }), 5)).toBeNull();
  });

  it("clip 3 through the model: 60 as heard, flagged by the last look; 16 passes", () => {
    const heard = entryFromLLM(
      said({ spokenName: "clean and press", catalogId: "kb-clean-and-press", reps: 8, weightEach: 60, weightCount: 2, weightUnit: "kg", sure: false }),
      5
    )!;
    expect(heard).toMatchObject({ weightKg: 60, implements: 2 });
    const [flagged] = finalizeVoiceEntries([heard], { bells: [12, 16, 20, 24] });
    expect(flagged).toMatchObject({ weightKg: 60, implements: 2, needsReview: true, reason: "ambiguous_weight" });
    expect(voiceDisplayLine(flagged).startsWith("? ")).toBe(true);

    const sure = entryFromLLM(
      said({ spokenName: "clean and press", catalogId: "kb-clean-and-press", reps: 8, weightEach: 60, weightCount: 2, weightUnit: "kg" }),
      5
    )!;
    expect(sure.needsReview).toBe(false); // the model did not doubt it…
    expect(finalizeVoiceEntries([sure])[0]).toMatchObject({ weightKg: 60, needsReview: true, reason: "ambiguous_weight" }); // …the last look does

    const fine = entryFromLLM(
      said({ spokenName: "clean and press", catalogId: "kb-clean-and-press", reps: 8, weightEach: 16, weightCount: 2, weightUnit: "kg" }),
      5
    )!;
    expect(finalizeVoiceEntries([fine], { bells: [12, 16, 20, 24] })[0]).toMatchObject({
      weightKg: 16,
      implements: 2,
      needsReview: false,
    });
  });
});

describe("buildVoiceEntryPrompt", () => {
  it("is just the transcript line when there is no context", () => {
    expect(buildVoiceEntryPrompt("another 8")).toBe("Transcript: another 8");
    expect(buildVoiceEntryPrompt("another 8", { bells: [], previous: undefined })).toBe("Transcript: another 8");
  });

  it("puts the previous entry on one JSON line, in the model's own field names", () => {
    const prompt = buildVoiceEntryPrompt("another 8", {
      previous: { name: "Kettlebell Clean and Jerk", exercise: "kettlebell-clean-and-jerk", reps: 4, weightKg: 16, implements: 2 },
    });
    const [context, transcript] = prompt.split("\n");
    expect(transcript).toBe("Transcript: another 8");
    expect(context.startsWith("Previous entry: ")).toBe(true);
    expect(JSON.parse(context.slice("Previous entry: ".length))).toEqual({
      spokenName: "Kettlebell Clean and Jerk",
      catalogId: "kettlebell-clean-and-jerk",
      reps: 4,
      weightEach: 16,
      weightCount: 2,
      weightUnit: "kg",
    });
  });

  it("carries per-side, a hold and a vest; a single is count 1; an assumed vest has no number", () => {
    const line = (previous: Parameters<typeof buildVoiceEntryPrompt>[1]) =>
      JSON.parse(buildVoiceEntryPrompt("same again", previous).split("\n")[0].slice("Previous entry: ".length));
    expect(line({ previous: { name: "Kettlebell Snatch", exercise: "kb-snatch", reps: 8, weightKg: 20, perSide: true } })).toEqual({
      spokenName: "Kettlebell Snatch",
      catalogId: "kb-snatch",
      reps: 8,
      weightEach: 20,
      weightCount: 1,
      weightUnit: "kg",
      perSide: true,
    });
    expect(line({ previous: { name: "Plank", exercise: "plank", seconds: 45 } })).toEqual({
      spokenName: "Plank",
      catalogId: "plank",
      seconds: 45,
    });
    expect(line({ previous: { name: "Bear Crawl", reps: 10, load: { type: "vest", kg: 5, assumed: true } } })).toEqual({
      spokenName: "Bear Crawl",
      catalogId: null,
      reps: 10,
      vest: true,
    });
    expect(line({ previous: { name: "Squat", reps: 10, load: { type: "vest", kg: 12 } } })).toMatchObject({
      vest: true,
      vestWeight: 12,
    });
  });

  it("lists his bells, sorted, and skips junk", () => {
    expect(buildVoiceEntryPrompt("8 snatches with the 16", { bells: [24, 12, 20, 16] })).toBe(
      "His kettlebells (kg): 12, 16, 20, 24\nTranscript: 8 snatches with the 16"
    );
    expect(
      buildVoiceEntryPrompt("x", { bells: [16, Number.NaN, -4, 0, "20" as unknown as number] })
    ).toBe("His kettlebells (kg): 16\nTranscript: x");
  });

  it("orders the lines: previous, bells, transcript", () => {
    const lines = buildVoiceEntryPrompt("another 8", { bells: [16], previous: { name: "Jerk", exercise: "jerk", reps: 8 } }).split("\n");
    expect(lines.map((l) => l.split(":")[0])).toEqual(["Previous entry", "His kettlebells (kg)", "Transcript"]);
  });

  it("ignores a previous entry with no name", () => {
    expect(buildVoiceEntryPrompt("another 8", { previous: { name: "  " } })).toBe("Transcript: another 8");
  });
});

describe("parseVoiceEntriesWithLLM (model stubbed)", () => {
  it("returns the mapped entries, heardNothing, and the model's raw JSON string", async () => {
    setCustomExercises(HIS_CUSTOMS);
    const raw = answer({
      heardNothing: false,
      entries: [
        said({ spokenName: "jerk", catalogId: "jerk", reps: 2, weightEach: 24, weightCount: 2, weightUnit: "kg" }),
        said({ spokenName: "jerk", catalogId: "jerk", reps: 4, weightEach: 20, weightCount: 2, weightUnit: "kg" }),
      ],
    });
    const result = await parseVoiceEntriesWithLLM("two jerks with 24 on each side, four with 20", { defaultVestKg: 5 });
    expect(result.raw).toBe(raw);
    expect(result.heardNothing).toBe(false);
    expect(result.entries.map((e) => [e.exercise, e.reps, e.weightKg, e.implements, e.needsReview])).toEqual([
      ["jerk", 2, 24, 2, false],
      ["jerk", 4, 20, 2, false],
    ]);
    expect(mocks.recordAIUsage).toHaveBeenCalledWith({
      surface: "voice-entry",
      model: "test-model",
      inputTokens: 900,
      outputTokens: 60,
    });
  });

  it("sends the context lines and the transcript as the user message", async () => {
    answer({ heardNothing: true, entries: [] });
    const previous = { name: "Jerk", exercise: "jerk", reps: 8, weightKg: 16, implements: 2 as const };
    await parseVoiceEntriesWithLLM("another 8", { bells: [12, 16, 20, 24], previous, timeoutMs: 4000 });
    const request = asked();
    expect(request.model).toBe("test-model");
    expect(request.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(request.messages[1].content).toBe(buildVoiceEntryPrompt("another 8", { bells: [12, 16, 20, 24], previous }));
    expect(request.messages[1].content).toContain("Previous entry: {");
    expect(request.messages[1].content).toContain("His kettlebells (kg): 12, 16, 20, 24");
    expect(request.messages[1].content.endsWith("Transcript: another 8")).toBe(true);
  });

  it("the system prompt states the rules this change is about, and lists the vocabulary", async () => {
    setCustomExercises(HIS_CUSTOMS);
    answer({ heardNothing: true, entries: [] });
    await parseVoiceEntriesWithLLM("x");
    const system = asked().messages[0].content;
    for (const needle of [
      "ONE implement",
      "on each side",
      "in each hand",
      "Double-handed",
      "Long cycle",
      "30 on 30 off",
      "EMOM",
      "another 8",
      "same again",
      "Previous entry:",
      "His kettlebells (kg):",
      "sure false",
      "Never multiply",
      "kb-half-snatch: Kettlebell Half Snatch",
      "kettlebell-clean-and-jerk: Kettlebell Clean and Jerk",
    ]) {
      expect(system).toContain(needle);
    }
  });

  it("keeps the schema strict: every property required, every optional value nullable", async () => {
    answer({ heardNothing: true, entries: [] });
    await parseVoiceEntriesWithLLM("x");
    const format = asked().response_format;
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    const walk = (node: Record<string, unknown>) => {
      if (node.type === "object") {
        const properties = node.properties as Record<string, Record<string, unknown>>;
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(properties).sort());
        for (const child of Object.values(properties)) walk(child);
      }
      if (node.type === "array") walk(node.items as Record<string, unknown>);
    };
    walk(format.json_schema.schema);
    const item = (format.json_schema.schema as { properties: { entries: { items: { properties: Record<string, { type: unknown }> } } } })
      .properties.entries.items.properties;
    for (const key of ["catalogId", "reps", "sets", "seconds", "weightEach", "weightCount", "weightUnit", "vestWeight", "vestUnit"]) {
      expect(item[key].type).toContain("null");
    }
  });

  it("an unnamed refer-back entry is the previous movement", async () => {
    setCustomExercises(HIS_CUSTOMS);
    answer({
      heardNothing: false,
      entries: [said({ spokenName: "", catalogId: null, reps: 8, weightEach: 16, weightCount: 2, weightUnit: "kg" })],
    });
    const previous = { name: "Jerk", exercise: "jerk", reps: 8, weightKg: 16, implements: 2 as const };
    const result = await parseVoiceEntriesWithLLM("another 8", { previous });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ name: "Jerk", exercise: "jerk", reps: 8, weightKg: 16, implements: 2 });
    expect(result.heardNothing).toBe(false);

    // With no previous entry the same answer has nothing to stand on.
    answer({ heardNothing: false, entries: [said({ spokenName: "", catalogId: null, reps: 8 })] });
    expect((await parseVoiceEntriesWithLLM("another 8")).entries).toEqual([]);
  });

  it("heardNothing only counts when there really are no entries", async () => {
    const raw = answer({ heardNothing: true, entries: [] });
    expect(await parseVoiceEntriesWithLLM("la la la")).toEqual({ entries: [], heardNothing: true, raw });
    answer({ heardNothing: true, entries: [said({})] });
    const contradictory = await parseVoiceEntriesWithLLM("10 swings");
    expect(contradictory.heardNothing).toBe(false);
    expect(contradictory.entries).toHaveLength(1);
  });

  it("rejects on an empty or malformed answer, so the caller keeps the rules' result", async () => {
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    await expect(parseVoiceEntriesWithLLM("10 swings")).rejects.toThrow("empty model answer");
    answer("{not json");
    await expect(parseVoiceEntriesWithLLM("10 swings")).rejects.toThrow();
    mocks.create.mockRejectedValueOnce(new Error("upstream 500"));
    await expect(parseVoiceEntriesWithLLM("10 swings")).rejects.toThrow("upstream 500");
  });

  it("gives up at the time budget", async () => {
    mocks.create.mockImplementationOnce(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const started = Date.now();
    await expect(parseVoiceEntriesWithLLM("10 swings", { timeoutMs: 20 })).rejects.toThrow("aborted");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("defaults to a four-second budget", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      mocks.create.mockImplementationOnce(
        (_body: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal = options.signal;
            options.signal.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const pending = parseVoiceEntriesWithLLM("10 swings");
      const settled = expect(pending).rejects.toThrow("aborted");
      await vi.advanceTimersByTimeAsync(3999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(signal?.aborted).toBe(true);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});
