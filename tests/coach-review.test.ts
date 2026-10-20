import { beforeAll, describe, expect, it, vi } from "vitest";

// Review generation (docs/coach-plan.md §2.2): structured output, one retry
// with the violations spelled out, every call's tokens summed. The generator
// is injected — no model is called here. Synthetic fixture week only.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildWeekFacts } from "@/lib/coach/facts";
import { COACH_SYSTEM_PROMPT, CoachGenerationError, generateReview, parseReviewJson, renderReviewMarkdown, type GenerateFn } from "@/lib/coach/review";
import { loadWeekInput } from "@/lib/coach/source";
import type { WeekFacts } from "@/lib/coach/types";
import { MODEL_TIERS } from "@/lib/openai";
import { badReview, goodReview } from "@/tests/fixtures/coach-review";
import { FIXTURE_TIME_ZONE, FIXTURE_WEEK_START, fixtureSource } from "@/tests/fixtures/coach-week";

let facts: WeekFacts;
beforeAll(async () => {
  const input = await loadWeekInput(fixtureSource("full"), {
    weekStart: FIXTURE_WEEK_START,
    timeZone: FIXTURE_TIME_ZONE,
    now: new Date("2026-10-12T00:00:00Z"),
  });
  facts = buildWeekFacts(input);
});

const answer = (text: string | null, inputTokens = 5000, outputTokens = 1200, calls = 1) => ({
  text,
  finishReason: "stop",
  usage: { inputTokens, outputTokens, calls },
});

function scripted(...texts: Array<string | null>) {
  const queue = [...texts];
  return vi.fn<GenerateFn>(async () => answer(queue.shift() ?? null));
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("generateReview", () => {
  it("returns the structured review on a clean first answer — one call, tokens and model recorded", async () => {
    const generate = scripted(JSON.stringify(goodReview(facts)));
    const out = await generateReview({ facts, tier: "sol", generate });
    expect(generate).toHaveBeenCalledTimes(1);
    const args = generate.mock.calls[0][0];
    expect(args).toMatchObject({ model: MODEL_TIERS.sol, surface: "coach", reasoningEffort: "low" });
    expect(args.messages[0]).toEqual({ role: "system", content: COACH_SYSTEM_PROMPT });
    // the model's copy: every fact, no provenance ids or dates
    const sent = JSON.parse(args.messages[1].content) as { facts: Array<Record<string, unknown>>; routines: string[] };
    expect(sent.facts).toHaveLength(facts.facts.length);
    expect(args.messages[1].content).not.toContain('"ids"');
    expect(sent.routines).toEqual(["Routine Alpha", "EMOM Bravo"]); // names only, never ids
    expect(out.model).toBe(MODEL_TIERS.sol);
    expect(out.usage).toEqual({ inputTokens: 5000, outputTokens: 1200, calls: 1 });
    expect(out.checks).toMatchObject({ attempts: 1, retried: false, unverified: 0 });
    expect(out.review.moves).toHaveLength(3);
    expect(out.review.headline).toBe("More training, protein still short");
  });

  it("retries once with the violations spelled out, and keeps the corrected answer", async () => {
    const generate = scripted(JSON.stringify(badReview(facts)), JSON.stringify(goodReview(facts)));
    const out = await generateReview({ facts, tier: "terra", generate });
    expect(generate).toHaveBeenCalledTimes(2);
    const retry = generate.mock.calls[1][0];
    expect(retry.model).toBe(MODEL_TIERS.terra);
    expect(retry.messages.at(-2)).toMatchObject({ role: "assistant" });
    const note = retry.messages.at(-1)!;
    expect(note.role).toBe("system");
    expect(note.content).toMatch(/not in the facts it cites \(with their units\): 77 sessions/);
    expect(note.content).toMatch(/medical framing/);
    expect(out.checks).toMatchObject({ attempts: 2, retried: true, unverified: 0 });
    expect(out.usage).toEqual({ inputTokens: 10000, outputTokens: 2400, calls: 2 });
  });

  it("keeps the flags when the retry is no better — nothing is silently fixed", async () => {
    const generate = scripted(JSON.stringify(badReview(facts)), JSON.stringify(badReview(facts)));
    const out = await generateReview({ facts, tier: "sol", generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(out.checks.retried).toBe(true);
    expect(out.checks.unverified).toBeGreaterThan(0);
    expect(out.review.headlineFlags).toEqual([{ kind: "unverified", tokens: ["77 sessions"] }]);
  });

  it("asks again when the first answer is not JSON, and fails plainly after two", async () => {
    const recovered = scripted("Sure! Here is the review.", "```json\n" + JSON.stringify(goodReview(facts)) + "\n```");
    const out = await generateReview({ facts, tier: "sol", generate: recovered });
    expect(recovered).toHaveBeenCalledTimes(2);
    expect(recovered.mock.calls[1][0].messages.at(-1)!.content).toMatch(/not a JSON object/);
    expect(out.checks.attempts).toBe(2);

    const hopeless = scripted("no", null);
    await expect(generateReview({ facts, tier: "sol", generate: hopeless })).rejects.toThrow(/did not return a review/);
  });

  it("counts every call the generator made, including its own length retries", async () => {
    const generate = vi.fn<GenerateFn>(async () => answer(JSON.stringify(goodReview(facts)), 9000, 3000, 2));
    const out = await generateReview({ facts, tier: "luna", generate });
    expect(out.usage).toEqual({ inputTokens: 9000, outputTokens: 3000, calls: 2 });
    expect(out.model).toBe(MODEL_TIERS.luna);
  });

  it("with too little time left it writes what it has instead of retrying", async () => {
    const generate = vi.fn<GenerateFn>(async () => answer(JSON.stringify(badReview(facts))));
    const out = await generateReview({ facts, tier: "sol", generate, retryMinRemainingMs: 10_000_000 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(out.checks.retried).toBe(false);
  });

  it("every call carries a hard timeout and the deadline inside the 50 s budget", async () => {
    const generate = scripted(JSON.stringify(goodReview(facts)));
    await generateReview({ facts, tier: "sol", generate });
    const args = generate.mock.calls[0][0];
    expect(args.timeoutMs).toBeGreaterThan(0);
    expect(args.timeoutMs).toBeLessThanOrEqual(35_000);
    expect(args.deadline).toBeGreaterThan(Date.now());
  });

  it("a failure keeps what it cost: the usage of every call made travels with the error", async () => {
    let n = 0;
    const generate = vi.fn<GenerateFn>(async () => {
      n++;
      if (n === 1) return answer("not json", 4000, 900);
      throw Object.assign(new Error("timeout"), { usage: { inputTokens: 4100, outputTokens: 0, calls: 1 } });
    });
    const failure = await generateReview({ facts, tier: "sol", generate }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(CoachGenerationError);
    expect((failure as CoachGenerationError).usage).toEqual({ inputTokens: 8100, outputTokens: 900, calls: 2 });
    expect((failure as CoachGenerationError).model).toBe(MODEL_TIERS.sol);
  });

  it("shows a removed line in the markdown, never the removed words", async () => {
    const raw = goodReview(facts);
    raw.whatHappened.push({ text: "Low HRV suggests insomnia.", cites: [] });
    const generate = scripted(JSON.stringify(raw), JSON.stringify(raw));
    const out = await generateReview({ facts, tier: "sol", generate });
    expect(out.markdown).toContain("_(removed: it read as medical advice)_");
    expect(out.markdown).not.toContain("insomnia");
  });
});

describe("parseReviewJson and the markdown", () => {
  it("finds the object inside fences or prose, and refuses anything without a headline", () => {
    expect(parseReviewJson('```json\n{"headline":"x"}\n```')).toEqual({ headline: "x" });
    expect(parseReviewJson('Here you go: {"headline":"x","moves":[]} — enjoy')).toEqual({ headline: "x", moves: [] });
    expect(parseReviewJson('{"title":"x"}')).toBeNull();
    expect(parseReviewJson("[1,2]")).toBeNull();
    expect(parseReviewJson(null)).toBeNull();
  });

  it("renders a short, cited, plain document — the chat's first message", async () => {
    const generate = scripted(JSON.stringify(goodReview(facts)));
    const out = await generateReview({ facts, tier: "sol", generate });
    const md = renderReviewMarkdown(out.review, facts);
    expect(md).toBe(out.markdown);
    expect(md.split("\n")[0]).toBe("# More training, protein still short");
    expect(md).toContain("_Week 41 · Oct 5 – Oct 11 · covers Monday to Saturday in full, Sunday through 7:00 pm_");
    expect(md).toContain("## What happened");
    expect(md).toContain("## Three moves for next week");
    expect(md).toMatch(/\[f\d+, f\d+\]/);
    expect(md).toContain("_Action: plan 2 days: 2026-10-13 Strength A (Routine Alpha) @ 24 kg; 2026-10-15 Ridge Loop (Ridge Loop)_");
    expect(md).toContain("_Action: set targets: P 35% · C 40% · F 25%_");
    expect(md).not.toMatch(UUID_RE);
  });
});
