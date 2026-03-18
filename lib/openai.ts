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
