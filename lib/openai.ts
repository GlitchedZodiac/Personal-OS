import OpenAI from "openai";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

const apiKey = cleanEnv(process.env.OPENAI_API_KEY);

export const hasOpenAIKey = Boolean(apiKey);

export const openai = new OpenAI({
  // Keep local builds from crashing when env vars are not loaded.
  apiKey: apiKey || "missing-openai-api-key",
});

// Central model registry — every AI call in the app resolves its model here
// so upgrades happen in one place. Env vars override each tier.
//
// GPT-5.6 tier system (verified against this account 2026-08-08):
//   sol   $5/$30 per MTok — flagship; deep synthesis (plans, trend insights)
//   terra $2/$12          — balanced everyday; chat parsing, meal photos
//   luna  $0.20/$1.20     — cheap/fast; available via env override if wanted
// Budget target ≤ $0.50/day: everyday logging on terra (~$0.01/turn) plus a
// few sol calls (~$0.05-0.08 each) lands comfortably under it.
export const CHAT_MODEL = cleanEnv(process.env.OPENAI_MODEL) || "gpt-5.6-terra";
export const COACH_MODEL =
  cleanEnv(process.env.OPENAI_COACH_MODEL) || "gpt-5.6-sol";
export const TRANSCRIBE_MODEL = "gpt-transcribe";
export const TRANSCRIBE_FALLBACK_MODEL = "whisper-1";
