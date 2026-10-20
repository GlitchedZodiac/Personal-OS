import { beforeEach, describe, expect, it, vi } from "vitest";

// generateChatText's additive `usage` (2026-10-17): every call it makes is
// summed — a `length` retry is a second call — while what callers already
// read (text, finishReason) is unchanged.
const h = vi.hoisted(() => ({ create: vi.fn(), recordAIUsage: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { create: (...a: unknown[]) => h.create(...a) } } },
  CHAT_MODEL: "gpt-5.6-terra",
}));
vi.mock("@/lib/ai-usage", () => ({ recordAIUsage: (...a: unknown[]) => h.recordAIUsage(...a) }));

import { generateChatText } from "@/lib/openai-text";

const completion = (content: string, finish: string, prompt: number, out: number) => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: prompt, completion_tokens: out },
});

beforeEach(() => {
  h.create.mockReset();
  h.recordAIUsage.mockReset();
});

describe("generateChatText usage", () => {
  it("sums both calls of a length retry and meters each", async () => {
    h.create
      .mockResolvedValueOnce(completion("", "length", 100, 200))
      .mockResolvedValueOnce(completion("done", "stop", 120, 80));
    const result = await generateChatText({
      messages: [{ role: "user", content: "hi" }],
      maxCompletionTokens: 10,
      retryMaxCompletionTokens: 20,
      surface: "coach",
    });
    expect(result).toEqual({ text: "done", finishReason: "stop", usage: { inputTokens: 220, outputTokens: 280, calls: 2 } });
    expect(h.recordAIUsage).toHaveBeenCalledTimes(2);
    expect(h.recordAIUsage).toHaveBeenNthCalledWith(1, { surface: "coach", model: "gpt-5.6-terra", inputTokens: 100, outputTokens: 200 });
  });

  it("still reports usage when no text came back", async () => {
    h.create.mockResolvedValueOnce(completion("", "content_filter", 50, 0));
    const result = await generateChatText({ messages: [{ role: "user", content: "hi" }], maxCompletionTokens: 10 });
    expect(result).toEqual({ text: null, finishReason: "content_filter", usage: { inputTokens: 50, outputTokens: 0, calls: 1 } });
  });

  it("existing callers that read only `text` are unaffected", async () => {
    h.create.mockResolvedValueOnce(completion("A title", "stop", 10, 3));
    const { text } = await generateChatText({ messages: [{ role: "user", content: "x" }], maxCompletionTokens: 40 });
    expect(text).toBe("A title");
  });
});
