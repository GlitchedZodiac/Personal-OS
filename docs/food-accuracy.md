# Food accuracy — how it is measured, and the numbers

Lane D (intake reliability). Michael's ask: *"pressure test against the chat
and speech to text and photo app to get more accurate on the calories for
food, storing the meals and data more consistently."* This document is the
measurement half: a repeatable eval of the real food-logging path, the same
fixtures run against the code before Phase 3 and after it, and what changed.
The plan and the gaps it rests on are in
[`intake-reliability-plan.md`](intake-reliability-plan.md) §W1.

## What he will notice

- **Colombian dishes come back the same way every time.** A bandeja paisa
  used to come back as 1,250 kcal one time and 3,170 the next (every
  component listed twice); sancocho, patacones and empanadas wandered by
  10–20 %. Now the same message gives the same card, and the numbers sit on
  USDA-based values for a typical restaurant serving.
- **Logging is faster and about half the price.** The assistant no longer
  reads his whole day before writing a plain food card: the card arrives in
  about 3½ seconds instead of 5, and each log costs about 40 % less.
- **Times make sense.** "Yesterday for dinner" lands at 8 pm, not noon;
  "at 7 pm I had…" said in the morning lands last night, not tonight.
- **"My usual" works in any wording or language**, and the card offers his
  saved usual's exact numbers.
- **The card is easier to fix**: ½× · 1× · 1.5× · 2× chips, "last time: N
  kcal" under foods he has logged before, a quiet "roughly / a guess" hint,
  and — after the same food on three different days — "save it as a usual?",
  which saves only if he taps it.
- **Rows remember how they came in** (chat, voice, photo, label, usual,
  Claude, typed), from now on.

What was **not** tested here: the microphone and the speech recogniser (the
"dictated" fixtures are typed text shaped like transcripts — real speech
needs his voice), and real plates in photos (no food photos were downloaded;
only the failure modes were probed). Both are on his checklist.

## What is measured, and how

**The path under test is the real one.** `scripts/food-eval.mjs` logs in
with the lane's PIN (read from `.env.local`, never written in the script),
posts each utterance to `POST /api/ai/chat/stream` exactly as the chat screen
does (a fresh chat per utterance, `source: "text"`, `timeZone:
America/Bogota`), reads the stream, and scores the `log_food` cards. Nothing
is mocked and no prompt is bypassed.

**A frozen evaluation database, and the same harness for both sides.** Both
runs go against `pitaya_lane_d_eval`: the schema, his settings row (targets,
timezone, language) and the run's synthetic seeds — none of his food, chats
or usuals, so his real history cannot help or hurt either side. The BEFORE
server runs a checkout of the baseline commit (`d3f537a`), the AFTER server
this tree; one harness scores both. Every table carries the server's commit
(and a hash of any uncommitted changes), the database's row counts and the
model observed in the usage log. Seeds are removed before and after by tag,
chats by the ids the server reported; an interrupted run cleans up after
itself.

**Safety.** The harness refuses a database URL that can reach beyond this
machine (including a `?host=` override, the bypass the review found), asks
the database where it actually answered from, refuses a server address that
is not this machine, and — after seeding — proves the server and the harness
see the same rows before it spends anything.

**Fixed conditions.** Model `gpt-5.6-terra` (the registry default, confirmed
from the usage log), `reasoning: low`, no temperature set by the route (the
API default). Meal type without a meal word follows the prompt's clock rule
at the run's local time; a stated clock time later than the run clock means
the day before.

**Fixtures are synthetic** (`tests/food-eval/fixtures.mjs`): 78 utterances, 3
two-turn corrections, 6 labels, 2 photo probes, in the shapes he logs —
Colombian staples (24, ten with the amount stated), gym food, quantities,
mixed meals, temporal phrases, typed-transcript twins, a usual by nickname.
None is a row from his history; the repo is public.

**References are cited** (`tests/food-eval/foods.mjs`, printed to
`tests/food-eval/reference.md`): a USDA FoodData Central id for every
generic food, a branded label in the same database for whey isolate and the
Colombian cheese breads, and a stated recipe of cited components for
sancocho, ajiaco, arroz con pollo, buñuelo, hogao and the drinks. Portions a
fixture does not state use a typical serving written into the fixture (a
550 g bowl of soup, a 45 g tajada); those are assumptions, which is why ten
Colombian fixtures state the amount and are scored without them.
Acceptance is a band: kcal −25 % / +30 %, each macro −40 % / +50 % with a
4 g floor; unstated composite dishes −30 % / +35 % and −50 % / +60 %.

**Metrics.**
- *Accuracy*: rates over EVERY utterance sent — no card (an error, a
  timeout, a question back) is a miss — with the card rate beside them;
  median absolute kcal error and signed bias over the carded ones. A refused
  connection is the infrastructure's failure, not the model's: it is
  reported and the affected turns are re-run.
- *Consistency, primary*: 15 twin pairs (the same food and portion phrased
  two ways). Pair CV = |a−b| / (a+b), both in band, items agree.
- *Consistency, noise floor*: 20 utterances × 3 identical runs, CV in the
  same unit. A twin difference smaller than the noise floor's mean is dice,
  not phrasing, and is not claimed.
- *Macro sanity*: an item of 30 kcal or more whose kcal and 4P + 4C + 9F
  differ by more than 15 % (alcohol exempt), and which side is closer to the
  reference (decision D2).
- *Item splitting, meal type, time, usual matching*.
- *Card fields* (after only): confidence, source, "last time", the anchor
  gate, save-as-usual offers, rows folded as duplicates, flags.
- *Corrections*: three two-turn flows, each edit checked against the row it
  names among the rows actually saved.
- *Labels*: six synthetic panels at two resolutions →
  `POST /api/health/food/scan-label`, exact per field; two through the chat
  with a servings multiplier.
- *Photo path*: failure modes only.
- *Cost and latency*: chat calls, input/output tokens and $ per call for
  each stage's own time window; time to the card; which tools the model
  called before proposing, by name.

**Run it:** two dev servers against the eval database (BEFORE on a checkout
of the baseline commit, AFTER on this tree), then
`DATABASE_URL=<eval db> node scripts/food-eval.mjs --base <server> --tag <name>`
(≈ 130 chat calls). `--stages a,b --merge <run.json>` re-runs only those
stages into an existing run; `--resummarize <run.json>` re-scores a saved run
from its raw answers. It is never part of `vitest` — it spends money.

---

## Before and after — frozen evaluation database, 2026-10-20

Both runs: database `pitaya_lane_d_eval` (0 food rows, 0 usuals, 0 chats
before seeding; his settings row only), model observed `gpt-5.6-terra`,
reasoning `low`, run clock 09:00–10:20 Bogotá, 78 utterances + 20 × 3 noise
floor + 3 corrections + 6 labels × 2 + 2 label-through-chat + 2 photo probes,
the same harness and fixtures. **BEFORE** = server at `d3f537a` (clean
checkout). **AFTER** = this commit's tree. Full tables:
[`tests/food-eval/before.md`](../tests/food-eval/before.md),
[`tests/food-eval/after.md`](../tests/food-eval/after.md); raw answers in the
`.json` beside them.

Two runs were disturbed by another process restarting every dev server on
the machine (followup filed). The harness classed the lost turns as
infrastructure, not model, failures: BEFORE's repeats, corrections, labels and
photos were re-run into the same file (`--stages … --merge`), and AFTER resends
any turn whose connection dropped. Both final files report **0** lost turns.

### Cost and speed

| | chat calls (main pass) | input tokens / call | output tokens / call | $ / call | read data before proposing | time to the card (median) | turn p90 |
|---|---|---|---|---|---|---|---|
| BEFORE | 78 | 15,121 | 305 | 0.0339 | **95.9 %** (`today_summary` ×67) | 5.3 s | 8.0 s |
| AFTER | 78 | **8,282** | 260 | **0.0197** | **0 %** | **3.6 s** | 5.3 s |

The whole run: $4.43 → $2.66. The prompt grew by about 900 tokens (the
Colombian table, the read rule, two tool descriptions); dropping the read that
preceded almost every log removed a whole second model request, worth about
7,000 tokens. The two-turn corrections still read (they must find the row to
edit): 11,261 tokens a call after, 14,196 before.

### Accuracy — rates over every utterance sent (no card = a miss)

| group | cards | kcal in band | all four in band | items split | median \|kcal err\| | median bias | meal type | time | usual |
|---|---|---|---|---|---|---|---|---|---|
| colombian (14) | 14 → 14 | 78.6 → **100 %** | 57.1 → 78.6 % | 100 → 100 % | 16.5 → **0.8 %** | +2.8 → +0.3 % | 100 → 100 % | — | — |
| colombian, amount stated (10) | 10 → 10 | 80 → **100 %** | 60 → 70 % | 100 → 100 % | 14.5 → **0.3 %** | +6.2 → 0 % | 100 → 100 % | — | — |
| gym (12) | 12 → 12 | 91.7 → 91.7 % | 91.7 → 91.7 % | 100 → 100 % | 2.3 → 2.3 % | +0.2 → +1.0 % | 100 → 100 % | — | — |
| quantities (10) | 10 → 10 | 100 → 100 % | 100 → 100 % | 100 → 100 % | 1.6 → 1.4 % | 0 → +0.6 % | 100 → 100 % | — | — |
| mixed (10) | 10 → 10 | 100 → 100 % | 90 → 90 % | 100 → 100 % | 8.2 → 2.2 % | +3.9 → +2.1 % | 90 → 100 % | — | — |
| temporal (7) | **5 → 7** | 71.4 → **100 %** | 71.4 → 85.7 % | 71.4 → 100 % | 0.8 → 0.7 % | −0.8 → −0.6 % | 71.4 → 100 % | **40 → 100 %** | — |
| typed transcripts (12) | 12 → 12 | 100 → 100 % | 100 → 100 % | 100 → 100 % | 6.0 → 1.7 % | +4.4 → +0.1 % | 100 → 100 % | — | — |
| usual (3) | **1 → 3** | 33.3 → **100 %** | 33.3 → 100 % | 33.3 → 100 % | 0 → 0 % | 0 → 0 % | 33.3 → 100 % | — | **33.3 → 100 %** |
| **ALL (78)** | **74 → 78** | **87.2 → 98.7 %** | **79.5 → 88.5 %** | 94.9 → 100 % | **6.3 → 1.2 %** | +0.4 → +0.2 % | 93.6 → 100 % | **40 → 100 %** | 33.3 → 100 % |

**BEFORE's four misses** got no card at all: "anoche comí una bandeja paisa"
(an empty answer), "a las 2pm me comí un sancocho" said at 9 am (it asked
whether that was yesterday), and two of the three usual requests (it asked
what was in the shake). **AFTER has no misses.** One utterance is still out of
band on kcal: "a can of tuna in water with a green salad" (200 vs a reference
of 119 — a can's drained weight is the assumption; out of band before as
well). The "all four" gap is macros on Colombian composites and the cheese
breads (sancocho's carbs, pandebono's protein): the kcal is right and the
split between protein, carbs and fat differs from the cited recipe or label —
where two honest recipes differ as much.

**Read this honestly.** The Colombian gains are partly by construction: the
prompt now carries the same USDA densities and typical servings that the
references use, so "in band" there means "the model applies the table
faithfully and the same way every time". It does not prove that a typical
serving is HIS serving. The stated-amount fixtures (10) are the fairer test,
and they moved from 80 % to 100 % in band with a median error of 0.3 %.
Whether his own bowls are bigger or smaller than a restaurant's is the
checklist's question.

### Consistency

| | pair CV median | pair CV mean | p90 | both twins in band | same item count |
|---|---|---|---|---|---|
| **Twins** (15 pairs, primary) BEFORE | 0 % | 3.7 % | 15.3 % | 93.3 % | 86.7 % |
| AFTER | 0 % | 2.0 % | 8.9 % | **100 %** | **100 %** |

| | CV median | CV mean | p90 | within 10 kcal | every run in band |
|---|---|---|---|---|---|
| **Noise floor** (20 × 3 identical text) BEFORE | 0.4 % | **5.0 %** | 18.7 % | 13/20 | 95 % |
| AFTER | 0 % | **0.5 %** | 2.7 % | **18/20** | **100 %** |

Pair CV and noise-floor CV are the same unit (|a−b| / (a+b) is the CV of two
values). The twins' mean moved 3.7 → 2.0 %, which is inside BEFORE's own
sampling noise (5.0 %), so **no phrasing gain is claimed**. What did change is
the noise itself. BEFORE gave the same bandeja paisa as 1,250, 3,170 and
1,250 kcal (CV 48 %), patacones 360 / 410 / 555, an arepa con queso 220 / 290
/ 280. AFTER gives none of the 20 a CV above 3 %. That, and both twins of
every pair now in band, is the consistency he asked for ("the same food,
the same number").

### Calories vs macros (decision D2) — the verdict

158 items of 30 kcal or more checked (alcohol exempt): **2 disagree** by more
than 15 % (BEFORE: 0 of 132). The only single-item one is two tajadas de
maduro (210 kcal; 4P + 4C + 9F = 253; reference 212) — the **kcal side** was
right. Over every utterance the kcal figure is the closer of the two. So D2
lands as: **never rewrite a number**; the check is a flag on the card ("kcal
and macros disagree"), with a 30 kcal floor and alcohol exempt.

### Card fields (new in Phase 3)

Measured on the final matcher with the 11 fixtures that carry seeded history
([`tests/food-eval/cardfields.md`](../tests/food-eval/cardfields.md); the
model's input is identical to the full AFTER run — the history anchor still
reaches the model only for A01 — so only these annotations were re-measured):
confidence on 100 % of items · `source: "chat"` on 100 % of typed cards ·
"last time" on 3 / 3 items whose food has seeded history (arepa con queso,
sancocho, chicken breast; plain white rice also finds plain white rice) ·
the anchor reached the model only for the one food eligible under D3 (arepa
con queso: three different days, stable number, no amount stated) and stayed
off for the four that were not · "save it as a usual?" offered on the three
arepa cards and nowhere else · no card folded (two identical empanadas stay
two rows; the doubled bandeja no longer occurs) · 1 item flagged.

The full AFTER run first showed two false "last time" hits — a hogao row
borrowing "Patacones con hogao" and a bandeja's plain arepa borrowing "Arepa
con queso" (the usuals matcher's containment rule, reused). The history
matcher now groups rows by food, requires the names to be essentially the
same (portion, vessel and default-variety words ignored), and for the
prompt anchor requires the whole saved name inside the message and only one
food to qualify. "use it" is offered only when last time's number is within
⅔×–1.5× of this item, so a half arepa is never scaled to a whole one.

### Labels, photos, corrections — unchanged and good

Labels 12 / 12 exact on every field at both resolutions, before and after;
"two scoops" and "una porción y media" scaled exactly (240 / 240,
165 / 165). Photo probes: nothing invented either side. Corrections 3 / 3
both sides, now checked against the rows actually saved ("make lunch 650":
the edited row plus the untouched one total exactly 650).

### What changed in Phase 3, and which row of the tables it moved

| change | where | moved |
|---|---|---|
| "A plain log needs no read" | `lib/ai-prompts.ts` CHAT_SYSTEM_PROMPT | read-first 96 → 0 %, tokens −45 %, time to card −1.7 s |
| Colombian portions from cited USDA values | `lib/ai-prompts.ts` | Colombian error 16.5 → 0.8 %, noise floor 5.0 → 0.5 % |
| Each component once; a repeated whole list folded | prompt + `lib/food-check.ts` | the doubled bandeja (1,250 / 3,170 kcal) gone |
| A meal word beats "noon"; a later clock time means yesterday | tool description + `lib/food-timing.ts` | time 40 → 100 % |
| His usuals handed to the model when asked for or named | `lib/food-match.ts` + route | usual 1/3 → 3/3 |
| Confidence per item | tool schema | 0 → 100 % of items |
| kcal/macro flag (no rewrite), history "last time", gated anchor, save-as-usual offer, `source` stamping, description tidy, ½× / 1.5× / 2× chips | `lib/food-check.ts`, `lib/food-normalize.ts`, `lib/food-match.ts`, routes, `components/intake/food-card.tsx` | unit-tested; card fields table |

## The first baseline (2026-10-17) — superseded

The Phase 2 numbers in [`tests/food-eval/baseline.md`](../tests/food-eval/baseline.md)
were measured against the lane's copy of his real data, with uncited
references and three Colombian portions below a typical serving, and they
dropped no-card utterances from the denominators. Its headline "+19 %
Colombian bias" was mostly those references (the model's 550 kcal sancocho
was right; the reference said 383). The tables above replace it; the file is
kept as a record.
