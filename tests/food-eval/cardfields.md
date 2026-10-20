# Food eval — cardfields · 2026-10-20T14:31:17.872Z
Server code `d3f537a` + uncommitted changes (tree f474fbcc14a7) · database `pitaya_lane_d_eval` (0 food rows, 0 usuals, 0 chats before seeding) · model observed `gpt-5.6-terra` · reasoning `low` · temperature not set by the route (API default) · run clock 2026-10-20 9h America/Bogota · 11 utterances · synthetic fixtures only · re-scored 2026-10-20T14:32:01.673Z with the current references

## Cost by stage
| stage | chat calls | mean input tokens / call | mean output tokens / call | $ per chat call | stage $ |
|---|---|---|---|---|---|
| main | 11 | 8284 | 341 | 0.0207 | 0.233 |

Run total $0.233 · median 3847 ms to the card (3849 ms to the end of the turn) · read data before proposing on 0 % of carded utterances

## Accuracy by group — rates over EVERY utterance sent (no card = a miss)
| group | n | cards | items split ok | kcal in band | P | C | F | all four | median |kcal err| | median kcal bias | items: macros≈kcal | meal type | time | usual | median ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colombian | 4 | 4/4 | 100 % | 100 % | 100 % | 100 % | 75 % | 75 % | 2.9 % | +2.4 % | 100 % | 100 % | — | — | 4056 |
| gym | 2 | 2/2 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 1.8 % | +1.2 % | 100 % | 100 % | — | — | 3446.5 |
| quantities | 1 | 1/1 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.8 % | +0.8 % | 100 % | 100 % | — | — | 3215 |
| temporal | 1 | 1/1 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 1.2 % | -1.2 % | 100 % | 100 % | — | — | 5047 |
| transcript | 3 | 3/3 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.2 % | 0 % | 66.7 % | 100 % | — | — | 3847 |
| ALL | 11 | 11/11 | 100 % | 100 % | 100 % | 100 % | 90.9 % | 90.9 % | 0.8 % | 0 % | 90.9 % | 100 % | — | — | 3847 |

## Card fields (Phase 3 additions — absent before by design)
| items with confidence | cards with source = chat | history shown where seeded | anchor gate right | anchors handed to the model | save-as-usual offered | rows folded as duplicates | items flagged |
|---|---|---|---|---|---|---|---|
| 100 % | 100 % | 3/3 | 5/5 | A01 | A01, C01, F01 | none | 1 |

## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)
3 pairs (3 with a card on both sides) · pair CV median **1.1 %**, mean 3.5 %, p90 9.4 % · both in band on **100 %** · same item count on 100 %. Pair CV is |a−b| / (a+b), the same unit as the noise floor's CV.

| pair | kind | kcal (twin / clean) | pair CV | both in band | items agree |
|---|---|---|---|---|---|
| F01 ↔ A01 | transcript | 265 / 320 | 9.4 % | yes | yes |
| F04 ↔ A06 | transcript | 455 / 465 | 1.1 % | yes | yes |
| F10 ↔ A02 | transcript | 1930 / 1930 | 0 % | yes | yes |

## Consistency — NOISE FLOOR: identical text 1 times (sampling only)
CV median **— %**, mean — %, p90 — % · 0/0 within 10 kcal · 0/0 with CV ≤ 10 % · every run in band on —. A twin difference smaller than the mean here is the model's dice, not phrasing.

| id | runs (cards) | kcal per run | spread | CV | all in band |
|---|---|---|---|---|---|

## When an item's calories and macros disagree (> 15 %, items ≥ 30 kcal), which side is right? (D2 evidence)
Checked 33 items of 30 kcal or more (0 alcohol items exempt): **3 % disagree**. Single-item utterances: 4; 0 disagree — kcal closer to the reference on 0, macros on 0.

## Every utterance
| id | group | items | kcal got/ref | P | C | F | kcal in band | items: macros≈kcal | meal got/exp | time ok | tools | ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | colombian | 1 | 320/265 | 10/10 | 38/31 | 12/11 | yes | yes | breakfast/breakfast | — | — | 2972 |
| A02 | colombian | 9 | 1930/1934 | 106/111 | 154/151 | 102/97 | yes | yes | lunch/lunch | — | — | 7340 |
| A03 | colombian | 1 | 550/554 | 38/30 | 55/84 | 18/11 | yes | yes | breakfast/breakfast | — | — | 4065 |
| A06 | colombian | 2 | 465/443 | 4/2 | 64/68 | 22/18 | yes | yes | breakfast/breakfast | — | — | 4047 |
| B01 | gym | 2 | 273/265 | 32/31 | 15/14 | 10.3/9 | yes | yes | breakfast/breakfast | — | — | 3644 |
| B03 | gym | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | breakfast/breakfast | — | — | 3249 |
| C01 | quantities | 1 | 133/132 | 5/5 | 18/15 | 5/6 | yes | yes | breakfast/breakfast | — | — | 3215 |
| E05 | temporal | 3 | 409/414 | 23/20 | 38/32 | 19/22 | yes | yes | breakfast/breakfast | — | — | 5047 |
| F01 | transcript | 1 | 265/265 | 9/10 | 35/31 | 10/11 | yes | yes | breakfast/breakfast | — | — | 3013 |
| F04 | transcript | 2 | 455/443 | 3/2 | 62/68 | 23/18 | yes | no | breakfast/breakfast | — | — | 3847 |
| F10 | transcript | 9 | 1930/1934 | 107/111 | 160/151 | 99/97 | yes | yes | lunch/lunch | — | — | 6905 |
