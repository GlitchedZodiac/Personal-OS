import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY?.trim();

export const hasOpenAIKey = Boolean(apiKey);

export const openai = new OpenAI({
  // Keep local builds from crashing when env vars are not loaded.
  apiKey: apiKey || "missing-openai-api-key",
});
