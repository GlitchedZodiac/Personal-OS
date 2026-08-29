# Token ROI — what the AI actually costs, and where the savings really are

*2026-08-29, from read-only prod queries against `ai_usage_events`,
`food_logs`, `chat_messages`, and `ai_conversations`. Michael's question:
"how much of what I enter could genuinely be solved without AI?"*

## The numbers

**Total AI spend since tracking began (2026-08-09): $3.92 across 209
calls** — about 13–19 ¢/day.

| Surface | Calls | Input tok | Output tok | Cost |
|---|---|---|---|---|
| chat (terra) | 110 | 782k | 36k | **$1.99** |
| spirit-generate (sol) | 12 | 22k | 46k | $1.48 |
| transcribe | 67 | — | — | $0.26 |
| everything else | 20 | ~10k | ~5k | ~$0.19 |

The headline: **the chat lane averages 7,100 input tokens per call** — the
system prompt plus replayed history rides along on every "log two eggs".
Output is tiny (330/call). The spend is context, not answers.

**What the AI is actually used for** (proposal kinds, all time): food 50,
routine 11, edit_food 3, everything else ≤2 each. The legacy surface tells
the same story (log_food 142, measurements 26, workouts 12). **Voice food
logging IS the product's AI workload.**

## The "library instead of AI" hypothesis — mostly rejected

559 food rows contain **540 unique descriptions — 3% exact repeats**. He
describes fresh variations; a lookup table can't carry the load. The
`favorite_foods` library existed with 2 rows — built, unused.

So the honest answer to "could this be solved without AI": **rarely
outright — but the per-call cost can drop dramatically**, and the paths
that ARE deterministic were already built and just needed surfacing:

- Routines: a full no-AI editor already exists (`/health/workouts/
  routines`) sharing the AI's own endpoint. Nothing to build.
- Measurements, water, workouts: form components exist.
- Usuals: one-tap zero-token re-log existed (`food` page) but matched by
  exact string only.

## What shipped this round (2026-08-29)

1. **Metering honesty** — 8 OpenAI call sites recorded nothing
   (meal-suggest, finance advisor/parsers ×5, workout-plan chat); the
   Trends weekly recap logged under the generic `text` surface. All now
   metered with named surfaces. The table above UNDERCOUNTS history;
   future numbers are complete.
2. **Dead surface deleted** — `/api/ai/chat` (legacy dock loop),
   `food/analyze-photo`, `workout-plan/generate` + `feedback`: four
   routes with zero callers, each carrying prompt+model code.
3. **Chat history window 20 → 12 rows** — the cheapest real cut to the
   7.1k input average. Proposals were already compressed to one line.
4. **Usuals got fuzzy** — `lib/food-match.ts` fold+overlap matching: a
   `log_food` proposal whose item matches a saved usual shows "≈ your
   usual" and (single-item cards) a **Log usual** button that saves the
   usual's exact macros and discards the estimate. Estimate drift on
   repeat foods goes to zero; `usageCount` finally accrues.
5. **Confirm-first everywhere** — `set_reminder` was the one tool that
   wrote without a card; it proposes now.

## Deliberately NOT done (and why)

- **Per-turn model routing (luna for food-only turns).** The registry has
  a `luna` tier at $0.20/$1.20 — 10× under terra — but choosing it per
  turn needs a classifier in front of the loop, and a wrong guess
  degrades the flagship surface. The right experiment: a dedicated
  slim-prompt food lane (no history, no 15-tool schema, luna) behind the
  dock's voice path. Filed in deferred-items; needs Michael's go since it
  changes how his main input path behaves.
- **Barcode / OpenFoodFacts** — already a deferred item; unchanged.
- **Auto "save as usual" prompts** after repeated estimates — the manual
  save-as-usual on the food page covers it; an automatic nudge is UX
  noise until the fuzzy pill proves itself.

## The scale answer

At one user, $4/month is noise. At N users it's the product's margin —
and the real lever isn't cheaper calls, it's **users bringing their own
AI**: see `docs/mcp-proposal.md`.
