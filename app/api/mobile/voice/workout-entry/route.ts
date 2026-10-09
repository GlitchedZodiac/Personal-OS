import { NextRequest, NextResponse, after } from "next/server";
import { toFile } from "openai";
import { requireMobileSession } from "@/lib/mobile-session";
import {
  openai,
  hasOpenAIKey,
  TRANSCRIBE_MODEL,
  TRANSCRIBE_FALLBACK_MODEL,
} from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";
import { allExercises } from "@/lib/exercises";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import {
  finalizeVoiceEntries,
  parseVoiceEntries,
  voiceDisplayLine,
  type ParsedVoiceEntry,
  type VoicePrevious,
} from "@/lib/voice-entry-parser";
import { parseVoiceEntriesWithLLM } from "@/lib/voice-entry-llm";
import { readVoiceContext, recordVoiceClip } from "@/lib/voice-audit";

// Wrist voice logging (2026-10-05): he taps, says "10 kettlebell swings",
// and the watch posts the clip here. watchOS has no speech framework, so the
// words are recognised on the server; the reply is what the wrist shows.
//
// Stateless on purpose. The watch owns the entry list for the session it is
// recording and sends it with the workout at End, so a clip that arrives
// hours late (recorded out of range) is parsed exactly the same way. What the
// parser needs to know about the session — the bells on his rack, the entry
// before this one ("another 8") — the watch sends along as `context`.
//
// Every clip also leaves an audit row (lib/voice-audit.ts): the recording,
// the transcript, what each parser said and what the wrist was shown. It is
// written after the response, so it never costs him a second.
//
// Speed is the product here — he is between sets. Rules run first and settle
// the common phrasings in a millisecond; the model is asked only when the
// rules are unsure, under a time budget, and the rule result stands if it
// does not answer in time.

export const maxDuration = 30;

const MAX_AUDIO_BYTES = 2_000_000; // ~10 minutes of 24 kbps AAC; a clip is ~20 KB
const DEFAULT_VEST_KG = 5; // his usual vest; a spoken number always wins
const LLM_BUDGET_MS = 4000;

const STANDARD_BELLS = [8, 12, 16, 20, 24, 28, 32];

/**
 * Vocabulary hint for the recogniser — his actual movement names, and the
 * weights his kettlebells come in. The weights go LAST: the recogniser leans
 * on the tail of the prompt, and "sixteen" heard as "sixty" (2026-10-08, a
 * 60 kg clean and press that never happened) is the costliest mistake here.
 */
function transcribePrompt(bells?: number[]): string {
  const names = allExercises().map((e) => e.name);
  const hint =
    "Workout log said mid-set. Reps, sets, kilos, pounds, vest, kettlebell, dumbbell, barbell, each side, double-handed, long cycle, EMOM. Movements: ";
  const weights = [...new Set(bells && bells.length > 0 ? bells : STANDARD_BELLS)].sort((a, b) => a - b);
  const tail = ` His kettlebells weigh ${weights.join(", ")} kilograms.`;
  let out = hint;
  for (const name of names) {
    if (out.length + name.length + 2 > 800 - tail.length) break;
    out += `${name}, `;
  }
  return out.replace(/, $/, ".") + tail;
}

// GET — a cheap authenticated ping the watch sends when a workout starts, so
// the first real clip does not pay for a cold start.
export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureUserExercisesLoaded();
  return NextResponse.json({ ok: true, ready: hasOpenAIKey });
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      entryId?: unknown;
      audioBase64?: unknown;
      mime?: unknown;
      /** Smoke/testing only: skip recognition and parse this text. */
      transcript?: unknown;
      /** Session context: { workoutId, t, kind, build, bells, previous }. */
      context?: unknown;
    };
    const entryId = typeof body.entryId === "string" ? body.entryId : null;
    const context = readVoiceContext(body.context);
    const parseOptions = {
      defaultVestKg: DEFAULT_VEST_KG,
      ...(context.bells ? { bells: context.bells } : {}),
      ...(context.previous ? { previous: context.previous as unknown as VoicePrevious } : {}),
    };

    let transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    let transcribeMs = 0;
    let audioSeconds: number | null = null;
    let clipAudio: { bytes: Buffer; mime: string } | null = null;
    let transcribeModel: string | null = null;

    if (!transcript) {
      if (typeof body.audioBase64 !== "string" || body.audioBase64.length < 200) {
        return NextResponse.json({ error: "No audio" }, { status: 400 });
      }
      const audio = Buffer.from(body.audioBase64, "base64");
      if (audio.length > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Clip too long" }, { status: 413 });
      }
      if (!hasOpenAIKey) {
        return NextResponse.json({ error: "Transcription unavailable" }, { status: 503 });
      }
      await ensureUserExercisesLoaded();
      const mime = typeof body.mime === "string" ? body.mime : "audio/m4a";
      clipAudio = { bytes: audio, mime };
      const file = await toFile(audio, "entry.m4a", { type: mime });
      const t0 = Date.now();
      let result;
      try {
        result = await openai.audio.transcriptions.create({
          file,
          model: TRANSCRIBE_MODEL,
          prompt: transcribePrompt(context.bells),
        });
        transcribeModel = TRANSCRIBE_MODEL;
      } catch (primaryError) {
        console.warn(
          `[VoiceEntry] ${TRANSCRIBE_MODEL} failed, falling back:`,
          primaryError instanceof Error ? primaryError.message : primaryError
        );
        result = await openai.audio.transcriptions.create({
          file: await toFile(audio, "entry.m4a", { type: mime }),
          model: TRANSCRIBE_FALLBACK_MODEL,
        });
        transcribeModel = TRANSCRIBE_FALLBACK_MODEL;
      }
      transcribeMs = Date.now() - t0;
      transcript = (result.text ?? "").trim();
      const duration = (result as { duration?: number }).duration;
      audioSeconds = typeof duration === "number" ? duration : null;
      recordAIUsage({ surface: "transcribe", model: TRANSCRIBE_MODEL, audioSeconds });
    } else {
      await ensureUserExercisesLoaded();
    }

    const t1 = Date.now();
    const rules = parseVoiceEntries(transcript, parseOptions);
    let entries: ParsedVoiceEntry[] = rules.entries;
    let parser: "rules" | "llm" | "rules-fallback" = "rules";
    let llmRaw: string | null = null;

    // A weight the recogniser misheard ("sixteen" → "60") is flagged by the
    // rules and cannot be settled by the model — it reads the same words.
    // Asking would cost him up to four seconds between sets for nothing.
    const onlyWeightInDoubt =
      rules.entries.length > 0 &&
      rules.entries.every(
        (e) =>
          e.exercise != null &&
          (e.matchedBy === "exact" || e.matchedBy === "alias") &&
          (e.reps != null || e.seconds != null) &&
          (!e.needsReview || e.reason === "ambiguous_weight")
      );

    // Only words that could be a workout note are worth a model call.
    if (!rules.confident && !onlyWeightInDoubt && transcript.length >= 3 && hasOpenAIKey) {
      try {
        const llm = await parseVoiceEntriesWithLLM(transcript, {
          ...parseOptions,
          timeoutMs: LLM_BUDGET_MS,
        });
        llmRaw = llm.raw ?? null;
        if (llm.heardNothing) {
          entries = [];
          parser = "llm";
        } else if (llm.entries.length > 0) {
          entries = llm.entries;
          parser = "llm";
        } else {
          parser = "rules-fallback";
        }
      } catch (error) {
        // Slow or failed: what the rules found stands, marked for review.
        console.warn("[VoiceEntry] model parse failed:", (error as Error)?.message);
        parser = "rules-fallback";
      }
    }
    if (parser === "rules-fallback") {
      entries = entries.map((e) =>
        e.needsReview ? e : { ...e, needsReview: true, reason: e.reason ?? "low_match" }
      );
    }
    // Nameless fragments are not entries; a weight that landed on a
    // bodyweight movement in a multi-movement clip, or a kettlebell weight he
    // does not own, is flagged, not trusted.
    entries = finalizeVoiceEntries(entries, context.bells ? { bells: context.bells } : undefined);
    const parseMs = Date.now() - t1;

    const shown = entries.map((e) => ({ ...e, display: voiceDisplayLine(e) }));
    const ms = { transcribe: transcribeMs, parse: parseMs, total: Date.now() - started };
    after(() =>
      recordVoiceClip({
        entryId,
        context,
        transcript,
        transcribeModel,
        audioSeconds,
        audio: clipAudio,
        parser,
        rulesResult: rules,
        llmRaw,
        entries: shown,
        ms,
      })
    );

    return NextResponse.json({ entryId, transcript, entries: shown, parser, ms });
  } catch (error) {
    console.error("Voice entry error:", error);
    return NextResponse.json({ error: "Failed to read the entry" }, { status: 500 });
  }
}
