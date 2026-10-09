// The second opinion for wrist voice logging. lib/voice-entry-parser.ts
// handles "10 kettlebell swings" by rule in a millisecond; this is for the
// transcripts it is not sure about — odd phrasing, a movement described the
// long way round, two things said at once. The model answers under a strict
// schema and only ever reports what was SAID: names are still resolved
// against the vocabulary here, and every number it returns is bounds-checked
// rather than trusted.
//
// Same contract as the rules: a weight is ONE implement (weightEach) with a
// count, never a total; "16 kilos on each side" is a pair, not reps per side.
// The model is also told what he logged just before and which bells he owns,
// so "another 8" resolves and a bell he does not have comes back unsure.

import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { allExercises, getExerciseById } from "@/lib/exercises";
import {
  matchSpokenExercise,
  type ParsedVoiceEntry,
  type VoicePrevious,
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
          spokenName: {
            type: "string",
            description: "The movement as he said it, singular, no numbers, without \"double-handed\".",
          },
          catalogId: {
            type: ["string", "null"],
            description: "An id from the vocabulary list when it is clearly that movement, else null.",
          },
          reps: { type: ["number", "null"] },
          sets: {
            type: ["number", "null"],
            description: "Only if he said sets or rounds, or an interval block gives them (total time / (on + off)).",
          },
          seconds: {
            type: ["number", "null"],
            description: "Duration per set, if he gave a time. For \"N on, M off\" this is N in seconds.",
          },
          weightEach: {
            type: ["number", "null"],
            description: "Weight of ONE implement exactly as spoken. Never a total, never doubled.",
          },
          weightCount: {
            type: ["number", "null"],
            description: "How many implements: 1 or 2. 2 for a pair, double-handed, or a weight \"on each side\" / \"in each hand\". Null if unsaid.",
          },
          weightUnit: { type: ["string", "null"], enum: ["kg", "lb", null] },
          vest: { type: "boolean", description: "He said he wore a weighted vest." },
          vestWeight: { type: ["number", "null"] },
          vestUnit: { type: ["string", "null"], enum: ["kg", "lb", null] },
          perSide: {
            type: "boolean",
            description: "REPS were per side. False when \"each side\" was said of the weight.",
          },
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

/** "double-handed clean and jerk" — his words for two bells; a pair cue, not part of the name. */
const DOUBLE_HANDED = /\bdouble[-\s]+hand(?:ed)?\b/i;

/**
 * Turn one model entry into the parser's shape. Exported for tests.
 * `weightKg` is ONE implement (unit-converted); a pair is `implements: 2`.
 */
export function entryFromLLM(raw: LLMEntry, defaultVestKg: number): ParsedVoiceEntry | null {
  const asSaid = (raw.spokenName ?? "").trim();
  if (!asSaid) return null;
  const doubleHanded = DOUBLE_HANDED.test(asSaid);
  const spoken = (doubleHanded && asSaid.replace(DOUBLE_HANDED, " ").replace(/\s+/g, " ").trim()) || asSaid;

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
    // A count he gave stands; with none, "double-handed" left in the name still means two.
    const count = raw.weightCount === 2 || (raw.weightCount == null && doubleHanded) ? 2 : 1;
    const unit = raw.weightUnit === "lb" ? "lb" : "kg";
    const kg = Math.round(each * (unit === "lb" ? LB_TO_KG : 1) * 10) / 10;
    if (kg >= 1 && kg <= 400) {
      entry.weightKg = kg;
      if (count === 2) entry.implements = 2;
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

const SYSTEM = `You turn one short spoken workout note into structured entries. The speaker is mid-workout on an Apple Watch, in English or Spanish; the text is a speech transcript and may contain mis-hearings. He trains mostly with kettlebells.

The user message has a "Transcript:" line, and sometimes two lines of context before it:
- "Previous entry:" — the entry he logged just before this one, as JSON in the same fields you answer with.
- "His kettlebells (kg):" — the bell sizes he owns.

Rules:
- Report only what was said. Never invent a number, and never "correct" one: if he seems to have said 60, report 60. A missing value is null.
- One entry per movement. "10 swings and 5 push-ups" is two entries. "5 rounds of X and Y" gives each entry sets 5. The same movement at different weights or reps is one entry per weight ("2 jerks at 24, 4 at 20, 8 at 16" is three entries).
- A restatement is ONE entry, not two: "four long cycles, which are four clean and jerks" (also "that is", "aka", "meaning", "or rather") names the same thing twice. Use the name that is in the vocabulary.
- "Long cycle" is the kettlebell clean and jerk.
- A number alone in front ("Eight. Clean and press…") is the reps of the movement that follows.
- Weight: weightEach is the weight of ONE implement exactly as spoken; weightCount is how many, 1 or 2. Never multiply, never give a total.
  - "one 24", "a 24" → count 1. "two 16s", "double 16s", "a pair of 20s", "two 16 kilogram kettlebells" → count 2.
  - "Double-handed" / "double" in front of a movement means two bells, one in each hand: count 2 unless he also says a single ("a 24", "one 24"). Leave "double-handed" out of spokenName.
  - "N kilos on each side", "N kilos each side", "N kilos in each hand" — the side phrase right after a WEIGHT — is one N-kilo bell per hand: weightEach N, weightCount 2, perSide false.
- perSide is for REPS: "8 snatches each side with a 20", "10 a side", "8 per side" → perSide true, and do not double the reps. The side phrase after the reps or the movement is reps per side; after the weight it is a pair (above). One bell named on its own followed by a bare "each side" — "8 snatches with the 20 each side", "with a 20 each side" — is still one bell, reps per side.
- A weighted vest is not a weight: set vest true, and vestWeight only if he gave a number.
- Intervals: "30 seconds on, 30 seconds off" (also "30 on 30 off", "30/30") → seconds is the ON time. With a total ("for 10 minutes", "the last 10 minutes were…") sets = total ÷ (on + off); with "10 rounds" sets = 10. "EMOM" / "every minute on the minute" for N minutes → sets N, with the reps he gave. Words like "EMOM", "intervals", "the last" are never a movement name.
- Referring back: when the transcript names no movement but gives a count or says "another 8", "8 more", "same again", "another set", "one more set", "again", and a previous entry is given, answer with ONE entry for that same movement — its spokenName and catalogId, and its reps, seconds, weight, count, vest and perSide wherever he did not restate them. sets only if he said them now. With no previous entry given, heardNothing is true.
- His kettlebells: when the list is given and a kettlebell weight he said is not one of them (or is over 48 kg for one bell), still report the number as heard and set sure false.
- catalogId: choose from the vocabulary only when it is clearly that movement. If unsure, null.
- If the text contains no exercise (noise, lyrics, chatter), heardNothing is true and entries is empty.
- sure is false whenever you guessed.`;

export interface LLMParseResult {
  entries: ParsedVoiceEntry[];
  heardNothing: boolean;
  /** The model's answer exactly as it came back (a JSON string) — kept by the caller for audit. */
  raw: string;
}

export interface LLMParseOptions {
  defaultVestKg?: number;
  timeoutMs?: number;
  /** Kettlebells he owns, in kg. Absent/empty = unknown. */
  bells?: number[];
  /** The entry logged just before this clip, for "another 8" / "same again". */
  previous?: VoicePrevious;
}

/** The previous entry in the model's own field names, so "same again" is a copy. */
function previousForModel(previous: VoicePrevious): Record<string, unknown> {
  const out: Record<string, unknown> = { spokenName: previous.name, catalogId: previous.exercise ?? null };
  if (previous.reps != null) out.reps = previous.reps;
  if (previous.seconds != null) out.seconds = previous.seconds;
  if (previous.weightKg != null) {
    out.weightEach = previous.weightKg;
    out.weightCount = previous.implements === 2 ? 2 : 1;
    out.weightUnit = "kg";
  }
  if (previous.load) {
    out.vest = true;
    if (!previous.load.assumed) out.vestWeight = previous.load.kg;
  }
  if (previous.perSide) out.perSide = true;
  return out;
}

/** The user message: context lines when there is any, then the transcript. Exported for tests. */
export function buildVoiceEntryPrompt(
  transcript: string,
  opts: { bells?: number[]; previous?: VoicePrevious } = {}
): string {
  const lines: string[] = [];
  const previous = opts.previous;
  if (previous != null && typeof previous.name === "string" && previous.name.trim()) {
    lines.push(`Previous entry: ${JSON.stringify(previousForModel(previous))}`);
  }
  const bells = (Array.isArray(opts.bells) ? opts.bells : []).filter(
    (kg) => typeof kg === "number" && Number.isFinite(kg) && kg > 0
  );
  if (bells.length > 0) lines.push(`His kettlebells (kg): ${[...bells].sort((a, b) => a - b).join(", ")}`);
  lines.push(`Transcript: ${transcript}`);
  return lines.join("\n");
}

/**
 * Ask the model. Rejects on timeout or a malformed answer — the caller keeps
 * the rule-based result in that case.
 */
export async function parseVoiceEntriesWithLLM(
  transcript: string,
  opts: LLMParseOptions = {}
): Promise<LLMParseResult> {
  const defaultVestKg = opts.defaultVestKg ?? 5;
  const previous = opts.previous;
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
          { role: "user", content: buildVoiceEntryPrompt(transcript, { bells: opts.bells, previous }) },
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
      // A refer-back entry the model left unnamed is still the previous movement.
      .map((e) =>
        previous != null && !(e.spokenName ?? "").trim() && !e.catalogId
          ? { ...e, spokenName: previous.name, catalogId: previous.exercise ?? null }
          : e
      )
      .map((e) => entryFromLLM(e, defaultVestKg))
      .filter((e): e is ParsedVoiceEntry => e !== null);
    return { entries, heardNothing: parsed.heardNothing === true && entries.length === 0, raw };
  } finally {
    clearTimeout(timer);
  }
}
