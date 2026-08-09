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
// so upgrades happen in one place. OPENAI_MODEL env var overrides chat.
export const CHAT_MODEL = cleanEnv(process.env.OPENAI_MODEL) || "gpt-5.5";
export const TRANSCRIBE_MODEL = "gpt-transcribe";
export const TRANSCRIBE_FALLBACK_MODEL = "whisper-1";
