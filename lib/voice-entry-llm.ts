// The second opinion for wrist voice logging. lib/voice-entry-parser.ts
// handles "10 kettlebell swings" by rule in a millisecond; this is for the
// transcripts it is not sure about — odd phrasing, a movement described the
// long way round, two things said at once. The model answers under a strict
// schema and only ever reports what was SAID: names are still resolved
// against the vocabulary here, and every number it returns is bounds-checked
// rather than trusted.

import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { allExercises, getExerciseById } from "@/lib/exercises";
import {
  matchSpokenExercise,
  type ParsedVoiceEntry,
} from "@/lib/voice-entry-parser";

const LB_TO_KG = 0.45359237;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["heardNothing", "entries"],
  properties: {
    heardNothing: {
      type: "boolean",
      description: "True when the transcript names no exercise at all (noise, music, chatter).",
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "spokenName",
          "catalogId",
          "reps",
          "sets",
          "seconds",
          "weightEach",
          "weightCount",
          "weightUnit",
          "vest",
          "vestWeight",
          "vestUnit",
          "perSide",
          "sure",
        ],
        properties: {
          spokenName: { type: "string", description: "The movement as he said it, singular, no numbers." },
          catalogId: {
            type: ["string", "null"],
            description: "An id from the vocabulary list when it is clearly that movement, else null.",
          },
          reps: { type: ["number", "null"] },
          sets: { type: ["number", "null"], description: "Only if he said sets or rounds." },
          seconds: { type: ["number", "null"], description: "Duration per set, if he gave a time." },
          weightEach: { type: ["number", "null"], description: "Weight of ONE implement as spoken." },
          weightCount: { type: ["number", "null"], description: "How many implements (1 or 2). Null if unsaid." },
          weightUnit: { type: ["string", "null"], enum: ["kg", "lb", null] },
          vest: { type: "boolean", description: "He said he wore a weighted vest." },
          vestWeight: { type: ["number", "null"] },
          vestUnit: { type: ["string", "null"], enum: ["kg", "lb", null] },
          perSide: { type: "boolean" },
          sure: { type: "boolean", description: "False if you had to guess any field." },
        },
      },
    },
  },
} as const;

interface LLMEntry {
  spokenName: string;
  catalogId: string | null;
  reps: number | null;
  sets: number | null;
  seconds: number | null;
  weightEach: number | null;
  weightCount: number | null;
  weightUnit: "kg" | "lb" | null;
  vest: boolean;
  vestWeight: number | null;
  vestUnit: "kg" | "lb" | null;
  perSide: boolean;
  sure: boolean;
}

const pos = (v: number | null, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : null;

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Turn one model entry into the parser's shape. Exported for tests. */
export function entryFromLLM(raw: LLMEntry, defaultVestKg: number): ParsedVoiceEntry | null {
  const spoken = (raw.spokenName ?? "").trim();
  if (!spoken) return null;

  // The model's id is a hint, never an authority: it must exist, and the
  // spoken name must not contradict it outright.
  const byId = raw.catalogId ? getExerciseById(raw.catalogId) : null;
  const match = matchSpokenExercise(spoken);
  const def = byId ?? match.def;
  const agreed = byId != null && match.def?.id === byId.id;

  const reps = pos(raw.reps, 1000);
  const sets = pos(raw.sets, 100);
  const seconds = pos(raw.seconds, 3600);

  const entry: ParsedVoiceEntry = {
    name: def?.name ?? titleCase(spoken),
    confidence: 0,
    needsReview: false,
    matchedBy: def ? (agreed ? match.by : "fuzzy") : "none",
  };
  if (def) entry.exercise = def.id;
  if (reps != null) entry.reps = Math.round(reps);
  if (sets != null) entry.sets = Math.round(sets);
  if (seconds != null) entry.seconds = Math.round(seconds);
  if (raw.perSide) entry.perSide = true;

  const each = pos(raw.weightEach, 900);
  if (each != null) {
    const count = raw.weightCount === 2 ? 2 : 1;
    const unit = raw.weightUnit === "lb" ? "lb" : "kg";
    const kg = Math.round(each * count * (unit === "lb" ? LB_TO_KG : 1) * 10) / 10;
    if (kg >= 1 && kg <= 400) {
      entry.weightKg = kg;
      entry.spoken = { unit, each, count };
    } else {
      entry.needsReview = true;
      entry.reason = "ambiguous_weight";
    }
  }

  if (raw.vest) {
    const stated = pos(raw.vestWeight, 200);
    const kg =
      stated != null
        ? Math.round(stated * (raw.vestUnit === "lb" ? LB_TO_KG : 1) * 10) / 10
        : null;
    if (kg != null && kg >= 1 && kg <= 40) entry.load = { type: "vest", kg };
    else {
      entry.load = { type: "vest", kg: defaultVestKg, assumed: true };
      if (kg != null) {
        entry.needsReview = true;
        entry.reason = "ambiguous_weight";
      }
    }
  }

  if (!def) {
    entry.needsReview = true;
    entry.reason = "new_exercise";
    entry.confidence = 0.35;
  } else if (reps == null && seconds == null) {
    entry.needsReview = true;
    entry.reason = entry.reason ?? "no_quantity";
    entry.confidence = 0.5;
  } else if (!raw.sure || (byId != null && !agreed && match.def != null)) {
    // The model guessed, or picked a different movement than the name reads.
    entry.needsReview = true;
    entry.reason = entry.reason ?? "low_match";
    entry.confidence = 0.6;
  } else {
    entry.confidence = entry.needsReview ? 0.6 : agreed || match.score >= 0.85 ? 0.9 : 0.8;
    if (entry.confidence < 0.85 && !entry.needsReview) {
      entry.needsReview = true;
      entry.reason = "low_match";
    }
  }
  return entry;
}

function vocabulary(): string {
  return allExercises()
    .map((e) => `${e.id}: ${e.name}`)
    .join("\n");
}

const SYSTEM = `You turn one short spoken workout note into structured entries. The speaker is mid-workout on an Apple Watch, in English or Spanish; the text is a speech transcript and may contain mis-hearings.

Rules:
- Report only what was said. Never invent a number. A missing value is null.
- One entry per movement. "10 swings and 5 push-ups" is two entries. "5 rounds of X and Y" gives each entry sets 5.
- weightEach is the weight of ONE implement exactly as spoken; weightCount is 1 or 2 ("one 24", "a 24" = 1; "two 16s", "double 16", "a pair of 20s" = 2). Do not multiply.
- A weighted vest is not a weight: set vest true, and vestWeight only if he gave a number.
- reps "each side" / "per side" → perSide true; do not double the reps.
- catalogId: choose from the vocabulary only when it is clearly that movement. If unsure, null.
- If the text contains no exercise (noise, lyrics, chatter), heardNothing is true and entries is empty.
- sure is false whenever you guessed.`;

export interface LLMParseResult {
  entries: ParsedVoiceEntry[];
  heardNothing: boolean;
}

/**
 * Ask the model. Rejects on timeout or a malformed answer — the caller keeps
 * the rule-based result in that case.
 */
export async function parseVoiceEntriesWithLLM(
  transcript: string,
  opts: { defaultVestKg?: number; timeoutMs?: number } = {}
): Promise<LLMParseResult> {
  const defaultVestKg = opts.defaultVestKg ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
  try {
    const completion = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        reasoning_effort: "none",
        max_completion_tokens: 500,
        messages: [
          { role: "system", content: `${SYSTEM}\n\nVocabulary (id: name):\n${vocabulary()}` },
          { role: "user", content: transcript },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "voice_workout_entries",
            strict: true,
            schema: SCHEMA as unknown as Record<string, unknown>,
          },
        },
      },
      { signal: controller.signal }
    );
    recordAIUsage({
      surface: "voice-entry",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty model answer");
    const parsed = JSON.parse(raw) as { heardNothing?: boolean; entries?: LLMEntry[] };
    const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
      .map((e) => entryFromLLM(e, defaultVestKg))
      .filter((e): e is ParsedVoiceEntry => e !== null);
    return { entries, heardNothing: parsed.heardNothing === true && entries.length === 0 };
  } finally {
    clearTimeout(timer);
  }
}
