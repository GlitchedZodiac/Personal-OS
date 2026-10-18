# Food accuracy — how it is measured, and the numbers

Lane D (intake reliability), 2026-10-17. Michael's ask: *"pressure test
against the chat and speech to text and photo app to get more accurate on the
calories for food, storing the meals and data more consistently."* This
document is the measurement half of that: a repeatable eval of the real
food-logging path, its baseline before any change, and (Phase 3) the same
tables after. The plan and the gaps it rests on are in
[`intake-reliability-plan.md`](intake-reliability-plan.md) §W1.

## What is measured, and how

**The path under test is the real one.** `scripts/food-eval.mjs` logs in with
the PIN, posts each utterance to `POST /api/ai/chat/stream` on a dev server
exactly as the chat screen does (a fresh chat per utterance, `source: "text"`,
`timeZone: America/Bogota`), reads the SSE stream, and scores the `log_food`
proposal cards it gets back. Nothing is mocked and no prompt is bypassed — the
numbers are what the card would have shown him.

**Fixed conditions, stated in every table.** Model `gpt-5.6-terra`
(`CHAT_MODEL`, the registry default; `OPENAI_MODEL` unset), `reasoning: low`,
no temperature set by the route (the API default), the system prompt and tool
set as of the commit in the table header, and the run's local clock (meal type
without an explicit meal word follows the prompt's clock rule). The seeded
usual and history rows are identical in every run, so Phase 3 is a true
before/after on the same fixtures.

**Fixtures are synthetic** (`tests/food-eval/fixtures.mjs`, 67 utterances +
3 two-turn corrections + 6 labels + 2 photo probes). They mirror the SHAPE of
how he logs — Colombian staples, gym food, quantities, EN/ES mixing, dictated
transcripts with fillers — and none is a row from his history. The repo is
public; his data stays out of it.

**References are public nutrient values** (`tests/food-eval/foods.mjs`, printed
to `tests/food-eval/reference.md`): per-100 g figures of the kind in USDA
FoodData Central and Colombian food-composition tables, multiplied by the
stated portion. Two honest references for "a bowl of sancocho" differ by
15–20 %, so acceptance is a BAND, not a point: kcal −25 % / +30 %, each macro
−40 % / +50 % with a 4 g floor; composite dishes (bandeja paisa, sancocho,
ajiaco, arroz con pollo) −30 % / +35 % and −50 % / +60 %. The bands are what
"accurate" means below; the median absolute error is reported beside them so
the band's width never hides a drift.

**Metrics.**
- *Accuracy*: per utterance, the card's totals vs the band (kcal, P, C, F,
  and all four), the median absolute kcal error, and the median signed bias.
- *Consistency — primary*: PAIRED TWINS. Fifteen pairs say the same food at
  the same portion two ways — twelve as a dictated transcript (fillers,
  numbers as words, no punctuation, EN/ES) and three as a paraphrase (a terse
  list vs a named meal; the same plate inside "yesterday for dinner"). Per
  pair: the kcal spread as a share of the pair's mean, whether both landed in
  band, and whether the item count agreed. This is the variation he actually
  meets; he never sends the same text twice (3 % exact repeats).
- *Consistency — noise floor*: 20 utterances run 3 times each with identical
  text; the kcal coefficient of variation per utterance (population SD /
  mean), its median and p90, and the share whose 3 runs all landed in band.
  Labelled a noise floor because it measures only the model's own sampling
  (the route runs reasoning `low` with no temperature control) — it says how
  much of a twin's spread is dice rather than phrasing.
- *Macro sanity*: 4P + 4C + 9F within 15 % of the item's own kcal, per item;
  items that name a drink with alcohol are exempt (7 kcal/g the formula
  cannot see) and counted separately.
- *D2 evidence*: for items whose kcal and 4P + 4C + 9F disagree, which side is
  closer to the reference (item-level references exist for single-item
  utterances) — the question decision D2 was waiting on.
- *Item splitting*: the item count against the fixture's expected count or range.
- *Meal type and time*: `mealType` against the stated meal (or the clock rule),
  `loggedAt` against the stated day and hour for temporal phrases.
- *Usual matching*: a seeded favourite ("Mi batido verde de la mañana") named
  exactly, with a word changed, and paraphrased in English.
- *Corrections*: three two-turn flows ("make lunch 650", "actually make that
  three eggs", "that shake was 300 calories") — does the second turn produce
  the right card kind with the right number.
- *Labels*: six synthetic Nutrition Facts / Información Nutricional panels
  rendered by Playwright at two resolutions → `POST /api/health/food/scan-label`,
  exact match per field; two of them also through the chat with "two
  servings" / "una porción y media".
- *Photo path*: failure modes only — an image of coloured shapes and a 1 × 1
  blank, each sent with no words. The question is whether a meal is invented.
  No meal photos were downloaded (decision D6: file downloads need his word);
  **photo accuracy on real plates is on his checklist, not in this table.**
- *Cost and latency*: chat calls, mean input and output tokens per call and $
  per call from `ai_usage_events` (the first row of every table, because
  anything that adds prompt text is read against it), median/p90 wall-clock
  from send to the card, and how often the model read data (`get_app_data`)
  before proposing.

**Everything the run creates is deleted afterwards** — the seeded usual, the
seeded history rows, the chats, any rows a correction flow saved — and the
harness refuses to run against a database that is not on loopback. Table
counts before and after the smoke run were identical (food 674 / favourites 2
/ chats 34 / messages 264).

**Run it:** `npm run dev -- --port 3104` against a local copy, then
`node scripts/food-eval.mjs --tag <name>` (≈ 130 chat calls, ≈ $4; `--limit`,
`--only A,B`, `--skip-labels`, `--skip-photos`, `--skip-corrections`, `--dry`).
It is never part of `vitest` — it spends real money. The committed outputs
are `tests/food-eval/baseline.{json,md}` (frozen) and `last-run.{json,md}`.

The tables of a saved run can be regenerated with the current metric code
(`node scripts/food-eval.mjs --resummarize tests/food-eval/baseline.json --tag baseline`),
which is how the baseline below carries the twin-first metrics the review
asked for without re-spending the run.

---

## Baseline — 2026-10-17, before any change

`gpt-5.6-terra` · reasoning `low` · no temperature set · commit `63b0dc2` · run
clock Saturday 20:00 Bogotá · 67 utterances, 20 × 3 noise floor, 3 corrections,
6 labels × 2 resolutions, 2 label-through-chat, 2 photo probes · synthetic only.
Full tables: [`tests/food-eval/baseline.md`](../tests/food-eval/baseline.md);
raw summary: `baseline.json`.

### Cost per call

| chat calls | mean input tokens / call | mean output tokens / call | $ per chat call | run total $ | median s to card | p90 s | utterances that read data first |
|---|---|---|---|---|---|---|---|
| 117 | 15,220 | 316 | 0.034 | 4.10 | 4.4 | 5.1 | **95.5 %** |

**The cost finding.** Every chat here was a FRESH chat — no history at all —
and still averaged 15,220 input tokens. The reason is in the last column: on
63 of 66 utterances the model called `get_app_data today_summary` before
proposing, so a plain "two eggs and an arepa" is two model requests, the
second carrying the first's output, the read result and the echoed reasoning.
The system prompt and tool schemas (≈ 5.4k) are paid twice. Not reading before
a plain food log is the largest single lever on both cost and latency this
lane has found — it is a prompt rule, and it is measured in Phase 3 against
this row. (The parked cheaper-model food lane remains his call and is not
built.) A new chat also costs one title call, ≈ $0.0005.

### Accuracy by group

| group | n | items split ok | kcal in band | P | C | F | all four | median \|kcal err\| | median kcal bias | items: macros≈kcal | meal type | time | usual |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colombian | 14 | 92.9 % | **71.4 %** | 92.9 % | 85.7 % | 85.7 % | 57.1 % | 19.7 % | **+19.1 %** | 92.9 % | 100 % | — | — |
| gym | 12 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.8 % | 0 % | 100 % | 100 % | — | — |
| quantities | 10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.8 % | 0 % | 100 % | 100 % | — | — |
| mixed | 10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 5.5 % | +2.2 % | 80 % | 100 % | — | — |
| temporal | 6 | 100 % | 83.3 % | 100 % | 100 % | 100 % | 83.3 % | 2.6 % | +1.4 % | 100 % | 100 % | 80 % | — |
| transcript | 12 | 100 % | 100 % | 91.7 % | 100 % | 100 % | 91.7 % | 9.4 % | 0 % | 91.7 % | 100 % | — | — |
| usual | 2 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0 % | 0 % | 100 % | 0 % | — | 100 % |
| **ALL** | **66** | **98.5 %** | **92.4 %** | 97 % | 97 % | 97 % | **87.9 %** | **3.7 %** | +0.6 % | 93.8 % | 97 % | 80 % | 100 % |

(67 utterances were sent; G03 — the usual paraphrased in English — produced no
card and is listed under misses rather than scored.)

**What the misses are.** Every kcal miss is a Colombian composite or fried
dish, and every one is HIGH: sancocho +44 % (twice — A03 and E06), ajiaco
+43 %, two tajadas de maduro +40 %, and a bandeja paisa at +84 % because the
card listed every component **twice** (16 rows, 3,090 kcal — the only item-
split miss too). Gym food, measured quantities and mixed plates sit on the
reference almost exactly (median error under 1 % for gym and quantities). The
Colombian median bias of +19 % is the thing to fix; the rest is already good.
The two "meal type" misses in the usual group are the fixture's, not the
model's: "mi batido de la mañana" at 8 pm was filed as breakfast, which is
what the saved usual says.

### Consistency — primary: paired twins

15 pairs · median kcal spread **2.2 %**, p90 11.3 % · spread ≤ 10 % on 86.7 %,
≤ 20 % on 93.3 % · both in band on **93.3 %** · same item count on 80 %.

| pair | kind | kcal (twin / clean) | spread % | both in band | items agree |
|---|---|---|---|---|---|
| D07 ↔ D01 eggs, arepa, coffee | paraphrase | 326 / 326 | 0 % | yes | yes |
| D08 ↔ D02 chicken, rice, avocado, salad | paraphrase | 740 / 700 | 5.6 % | yes | yes |
| E01 ↔ B03 200 g chicken + rice, "yesterday for dinner" | paraphrase | 535 / 535 | 0 % | yes | yes |
| F01 ↔ A01 arepa con queso | transcript | 250 / 280 | 11.3 % | yes | yes |
| F02 ↔ D01 dos huevos una arepa y un café | transcript | 296 / 326 | 9.6 % | yes | yes |
| F03 ↔ B03 two hundred grams of chicken… | transcript | 535 / 535 | 0 % | yes | yes |
| F04 ↔ A06 tres patacones con hogao | transcript | 455 / 430 | 5.6 % | yes | no |
| F05 ↔ B01 protein shake, whey + milk | transcript | 273 / 275 | 0.7 % | yes | yes |
| F06 ↔ C03 a cup and a half of rice | transcript | 308 / 308 | 0 % | yes | yes |
| F07 ↔ A04 dos empanadas con ají | transcript | 440 / 450 | 2.2 % | yes | no |
| F08 ↔ B07 four scrambled eggs | transcript | 288 / 288 | 0 % | yes | yes |
| F09 ↔ D02 lunch was uh grilled chicken… | transcript | 660 / 700 | 5.9 % | yes | yes |
| F10 ↔ A02 bandeja paisa | transcript | 1,925 / 3,090 | **46.5 %** | **no** | no |
| F11 ↔ C07 one and a half scoops of whey | transcript | 180 / 180 | 0 % | yes | yes |
| F12 ↔ A08 buñuelo, almojábana, agua de panela | transcript | 520 / 500 | 3.9 % | yes | yes |

Phrasing barely moves the number: dictated fillers, Spanish, numbers as words
and terse lists all land within a few per cent of the clean twin. The one
real spread is the bandeja paisa, and it is the doubled card again, not the
phrasing. The three "items agree: no" are compound dishes split differently
(patacones + hogao as one row or two; empanadas with ají) — a presentation
choice, not an error.

### Consistency — noise floor (same text × 3)

Median CV **0.5 %**, p90 15.2 % · CV ≤ 10 % on 85 % · all 3 runs in band on 80 %.
Seventeen of twenty utterances come back the same to within a few kcal; the
three that wander are the Colombian composites — bandeja paisa 3,090 / 1,515 /
1,665 (CV 34 %, the first a doubled card), patacones con hogao 430 / 350 / 510
(15 %), two empanadas 450 / 500 / 370 (12 %), sancocho 550 / 520 / 650 (10 %).
So the dice are small except exactly where the portion knowledge is weak.

### Calories vs macros — the D2 evidence

135 items checked (4 alcohol items exempt). **Four disagree by more than
15 %, and all four are items under 20 kcal**: black coffee at 2 kcal against
0 by the formula (three times), a spoon of ají at 10 against 8. No item with
a real calorie count disagreed with its own macros. Over every utterance the
median |error| against the reference is 3.7 % for the card's kcal and 7.1 %
for 4P + 4C + 9F — the kcal figure is the better of the two when they differ
at all. The historical 1-in-7 mismatch in his table (rows from Feb–Oct, older
prompts and models) does not reproduce on today's model.

**D2 verdict (replaces the provisional default).** Do not rewrite anything.
The deterministic check becomes a FLAG only, with an absolute floor (items
under 30 kcal are not judged), alcohol exempt, shown on the card only when it
trips; nothing is added to the prompt for a problem that measures at 0 %.
Revisit if Phase 3's after-run shows real mismatches.

### Labels

12 of 12 reads exact on every field — product, serving as printed, servings
per container, kcal, P, C, F — at both resolutions, EN and ES panels,
`confident: true`, 1.0–1.4 s each. Through the chat with a multiplier: "this
label, I had two scoops" → 240 / 50 / 6 / 2 (exact ×2); "esta etiqueta, me
comí una porción y media" → 165 / 22.5 / 9 / 4.5 (exact ×1.5). The label path
has no accuracy problem on clean panels; a blurry phone shot is his checklist
item.

### Photo path — failure modes

Coloured shapes with no words: no card, "it's just colored shapes, not a
recognizable meal or label". A blank 1 × 1 image: no card, "I didn't receive a
visible image". Nothing was invented. Real-plate accuracy is his to judge
(decision D6: no photo downloads).

### Corrections (two turns)

| | turn 1 | turn 2 | result |
|---|---|---|---|
| H01 | lunch: 200 g chicken + a cup of rice (saved) | "make lunch 650" | **pass** — one row edited so the lunch totals 650 |
| H02 | two eggs and an arepa (pending) | "actually make that three eggs" | **pass** — a fresh card at 380 kcal (reference 408) |
| H03 | a protein shake with milk (saved) | "that shake was 300 calories, not what you put" | **unclear** — the shake was saved as two rows and the model edited one of them to 180; the check assumed one row. The harness will compare the implied total in Phase 3. |

### Other things the baseline shows

- **`loggedAt` is on every item** (139 / 139) — the model stamps it itself, so
  the per-item path in `lib/food-timing.ts` is live. The one time miss is
  "yesterday for dinner" stamped at **12:00** (the prompt's "date without time
  → 12:00") instead of 20:00; the message-level rule would have said 20:00 but
  the model's explicit time wins. A tool-description fix (Phase 3 item 7).
- **No confidence field exists** (0 / 139), as expected.
- **The usual matched twice** (exact text, and "el batido verde de la mañana de
  siempre") with the saved 310 kcal carried; the English paraphrase produced
  no card — the model read his data twice and answered that no such shake was
  saved, because usuals are not something it is told about and the matcher is
  word-overlap in one language.

### Phase 3 targets, from this baseline

| # | what the baseline shows | the change | target in the after-run |
|---|---|---|---|
| 1 | Colombian composites +19 % median bias; sancocho/ajiaco +43 %, tajadas +40 % | a compact portion-and-kcal table for ~12 dishes in the prompt (tokens measured) | colombian kcal in band ≥ 90 %, bias within ±10 %, ALL ≥ 95 % |
| 2 | a card listed every bandeja component twice | deterministic duplicate-row check at proposal time (same description and kcal → flag/collapse) | 0 doubled cards; bandeja noise-floor CV < 15 % |
| 3 | 95.5 % of logs read `today_summary` first; 15.2k input tokens on a fresh chat | prompt rule: no `get_app_data` before a plain food log | read-first ≤ 10 %, input tokens −40 %, median latency −1.5 s, accuracy unchanged |
| 4 | "for dinner" stamped 12:00 | `loggedAt` tool description: a meal word means that meal's hour; per-item times for mixed messages | time 100 % |
| 5 | the usual missed in the other language; the model does not know usuals exist | match usuals and history before the turn and tell the model when one matches | G03 → the usual's card |
| 6 | 5 fixtures have seeded history (arepa con queso ×3 days, patacones, shake, sancocho, chicken + rice) | `history` annotation on the card; prompt anchor only under the D3 gate | 5 / 5 annotated; anchor injected for the arepa only |
| 7 | no confidence field | optional `confidence` per item | present on 100 % of items |
| — | labels, photos, gym, quantities, mixed, twins | no change needed | hold at 100 % / 2.2 % spread |

Everything else in Phase 3 — `source` stamping, normalisation, the ½× / 1.5× /
2× chips, "Save as usual" — is deterministic and unit-tested rather than
measured here.
