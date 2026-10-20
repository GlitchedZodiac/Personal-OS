# Food eval — after · 2026-10-20T14:21:51.997Z
Server code `d3f537a` + uncommitted changes (tree cfd80bb99059) · database `pitaya_lane_d_eval` (0 food rows, 0 usuals, 0 chats before seeding) · model observed `gpt-5.6-terra` · reasoning `low` · temperature not set by the route (API default) · run clock 2026-10-20 9h America/Bogota · 78 utterances · synthetic fixtures only · re-scored 2026-10-20T14:32:09.875Z with the current references

## Cost by stage
| stage | chat calls | mean input tokens / call | mean output tokens / call | $ per chat call | stage $ |
|---|---|---|---|---|---|
| main | 78 | 8282 | 260 | 0.0197 | 1.574 |
| repeats | 40 | 8282 | 274 | 0.0199 | 0.814 |
| corrections | 6 | 11261 | 244 | 0.0255 | 0.154 |
| labels | 2 | 9518 | 200 | 0.0214 | 0.079 |
| photos | 2 | 8493 | 47 | 0.0176 | 0.036 |

Run total $2.657 · median 3615.5 ms to the card (3617 ms to the end of the turn) · read data before proposing on 0 % of carded utterances

## Accuracy by group — rates over EVERY utterance sent (no card = a miss)
| group | n | cards | items split ok | kcal in band | P | C | F | all four | median |kcal err| | median kcal bias | items: macros≈kcal | meal type | time | usual | median ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colombian | 14 | 14/14 | 100 % | 100 % | 100 % | 92.9 % | 85.7 % | 78.6 % | 0.8 % | +0.3 % | 85.7 % | 100 % | — | — | 3564.5 |
| colombian-stated | 10 | 10/10 | 100 % | 100 % | 100 % | 90 % | 80 % | 70 % | 0.3 % | 0 % | 100 % | 100 % | — | — | 3202.5 |
| gym | 12 | 12/12 | 100 % | 91.7 % | 91.7 % | 100 % | 100 % | 91.7 % | 2.3 % | +1 % | 100 % | 100 % | — | — | 3328.5 |
| quantities | 10 | 10/10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 1.4 % | +0.6 % | 100 % | 100 % | — | — | 3153.5 |
| mixed | 10 | 10/10 | 100 % | 100 % | 100 % | 90 % | 100 % | 90 % | 2.2 % | +2.1 % | 100 % | 100 % | — | — | 4080 |
| temporal | 7 | 7/7 | 100 % | 100 % | 100 % | 100 % | 85.7 % | 85.7 % | 0.7 % | -0.6 % | 100 % | 100 % | 100 % | — | 4409 |
| transcript | 12 | 12/12 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 1.7 % | +0.1 % | 100 % | 100 % | — | — | 3822 |
| usual | 3 | 3/3 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0 % | 0 % | 100 % | 100 % | — | 100 % | 3564 |
| ALL | 78 | 78/78 | 100 % | 98.7 % | 98.7 % | 96.2 % | 93.6 % | 88.5 % | 1.2 % | +0.2 % | 97.4 % | 100 % | 100 % | 100 % | 3615.5 |

## Card fields (Phase 3 additions — absent before by design)
| items with confidence | cards with source = chat | history shown where seeded | anchor gate right | anchors handed to the model | save-as-usual offered | rows folded as duplicates | items flagged |
|---|---|---|---|---|---|---|---|
| 100 % | 100 % | 3/3 | 5/5 | A01 | A01, C01, E05, F01, F10 | none | 2 |

## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)
15 pairs (15 with a card on both sides) · pair CV median **0 %**, mean 2 %, p90 8.9 % · both in band on **100 %** · same item count on 100 %. Pair CV is |a−b| / (a+b), the same unit as the noise floor's CV.

| pair | kind | kcal (twin / clean) | pair CV | both in band | items agree |
|---|---|---|---|---|---|
| D07 ↔ D01 | paraphrase | 322 / 321 | 0.2 % | yes | yes |
| D08 ↔ D02 | paraphrase | 602 / 720 | 8.9 % | yes | yes |
| E01 ↔ B03 | paraphrase | 535 / 535 | 0 % | yes | yes |
| F01 ↔ A01 | transcript | 265 / 320 | 9.4 % | yes | yes |
| F02 ↔ D01 | transcript | 321 / 321 | 0 % | yes | yes |
| F03 ↔ B03 | transcript | 535 / 535 | 0 % | yes | yes |
| F04 ↔ A06 | transcript | 470 / 460 | 1.1 % | yes | yes |
| F05 ↔ B01 | transcript | 273 / 273 | 0 % | yes | yes |
| F06 ↔ C03 | transcript | 308 / 308 | 0 % | yes | yes |
| F07 ↔ A04 | transcript | 440 / 435 | 0.6 % | yes | yes |
| F08 ↔ B07 | transcript | 288 / 320 | 5.3 % | yes | yes |
| F09 ↔ D02 | transcript | 660 / 720 | 4.3 % | yes | yes |
| F10 ↔ A02 | transcript | 1930 / 1930 | 0 % | yes | yes |
| F11 ↔ C07 | transcript | 180 / 180 | 0 % | yes | yes |
| F12 ↔ A08 | transcript | 415 / 415 | 0 % | yes | yes |

## Consistency — NOISE FLOOR: identical text 3 times (sampling only)
CV median **0 %**, mean 0.5 %, p90 2.7 % · 18/20 within 10 kcal · 20/20 with CV ≤ 10 % · every run in band on 100 %. A twin difference smaller than the mean here is the model's dice, not phrasing.

| id | runs (cards) | kcal per run | spread | CV | all in band |
|---|---|---|---|---|---|
| A01 | 3 (3) | 320 / 320 / 320 | 0 | 0 % | yes |
| A02 | 3 (3) | 1930 / 1930 / 1930 | 0 | 0 % | yes |
| A03 | 3 (3) | 550 / 550 / 550 | 0 | 0 % | yes |
| A04 | 3 (3) | 435 / 440 / 435 | 5 | 0.5 % | yes |
| A06 | 3 (3) | 460 / 465 / 455 | 10 | 0.9 % | yes |
| A09 | 3 (3) | 530 / 530 / 530 | 0 | 0 % | yes |
| A13 | 3 (3) | 505 / 500 / 475 | 30 | 2.7 % | yes |
| B01 | 3 (3) | 273 / 273 / 273 | 0 | 0 % | yes |
| B03 | 3 (3) | 535 / 535 / 535 | 0 | 0 % | yes |
| B04 | 3 (3) | 261 / 255 / 261 | 6 | 1.1 % | yes |
| B05 | 3 (3) | 274 / 274 / 274 | 0 | 0 % | yes |
| B08 | 3 (3) | 483 / 483 / 483 | 0 | 0 % | yes |
| C01 | 3 (3) | 135 / 133 / 133 | 2 | 0.7 % | yes |
| C03 | 3 (3) | 308 / 308 / 308 | 0 | 0 % | yes |
| D01 | 3 (3) | 321 / 321 / 321 | 0 | 0 % | yes |
| D02 | 3 (3) | 720 / 665 / 685 | 55 | 3.3 % | yes |
| D06 | 3 (3) | 720 / 720 / 720 | 0 | 0 % | yes |
| E01 | 3 (3) | 535 / 525 / 535 | 10 | 0.9 % | yes |
| F02 | 3 (3) | 321 / 321 / 321 | 0 | 0 % | yes |
| F05 | 3 (3) | 273 / 273 / 273 | 0 | 0 % | yes |

## When an item's calories and macros disagree (> 15 %, items ≥ 30 kcal), which side is right? (D2 evidence)
Checked 158 items of 30 kcal or more (4 alcohol items exempt): **1.3 % disagree**. Single-item utterances: 32; 1 disagree — kcal closer to the reference on 1, macros on 0.

| id | item | kcal | 4P+4C+9F | reference | closer |
|---|---|---|---|---|---|
| A12 | 2 tajadas de maduro fritas (~90 g) | 210 | 253 | 212 | kcal |

## Label reader (`/api/health/food/scan-label`) — synthetic panels, exact match per field
| label | lang | res | confident | product | serving | servings/container | kcal | P | C | F | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| I01 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2435 |
| I01 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1859 |
| I02 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 3029 |
| I02 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1691 |
| I03 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2270 |
| I03 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1469 |
| I04 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2113 |
| I04 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1480 |
| I05 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2010 |
| I05 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1499 |
| I06 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2060 |
| I06 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1604 |

## Label through the chat with a servings multiplier
| id | label | × | cards | items | got kcal/P/C/F | want | scaled ok (±8 %) | ms |
|---|---|---|---|---|---|---|---|---|
| L01 | I01 | 2 | food | 1 | 240/50/6/2 | 240/50/6/2 | yes | 2769 |
| L02 | I02 | 1.5 | food | 1 | 165/22.5/9/4.5 | 165/22.5/9/4.5 | yes | 10080 |

## Photo path — failure modes only (no meal photos were downloaded; D6)
| probe | image | cards | invented a meal? | honest | reply (start) | ms |
|---|---|---|---|---|---|---|
| P01 | coloured shapes, no food, no words | none | no | yes | I can’t identify food from this image—it looks like colored shapes, not a meal. Send the plate or tell me what you ate and roughly how much. | 2599 |
| P02 | a 1×1 blank image, no words | none | no | yes | I can’t see the photo attachment on my end. Send it again and I’ll log what’s on it. | 3740 |

## Corrections (two turns; edits checked against the rows actually saved)
| id | turn 1 | saved? | turn 2 | turn-2 cards | pass | note |
|---|---|---|---|---|---|---|
| H01 | Lunch: 200 g grilled chicken with a cup of rice | yes | make lunch 650 | edit_food | yes | saved rows 330+205 · edits 445 · new total 650 (want 650) |
| H02 | Two eggs and an arepa | no | actually make that three eggs | food | yes | re-proposed 391 kcal (want 399) |
| H03 | A protein shake with milk | yes | that shake was 300 calories, not what you put | edit_food | yes | saved rows 240 · edits 300 · new total 300 (want 300) |

## Every utterance
| id | group | items | kcal got/ref | P | C | F | kcal in band | items: macros≈kcal | meal got/exp | time ok | tools | ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | colombian | 1 | 320/265 | 10/10 | 38/31 | 12/11 | yes | yes | breakfast/breakfast | — | — | 2638 |
| A02 | colombian | 9 | 1930/1934 | 106/111 | 154/151 | 102/97 | yes | yes | lunch/lunch | — | — | 5518 |
| A03 | colombian | 1 | 550/554 | 42/30 | 48/84 | 20/11 | yes | yes | breakfast/breakfast | — | — | 3054 |
| A04 | colombian | 2 | 435/433 | 16/16 | 43/36 | 22/25 | yes | yes | breakfast/breakfast | — | — | 2970 |
| A05 | colombian | 2 | 255/251 | 9/13 | 31/19 | 10/14 | yes | yes | breakfast/breakfast | — | — | 3987 |
| A06 | colombian | 2 | 460/443 | 5/2 | 60/68 | 24/18 | yes | yes | breakfast/breakfast | — | — | 2946 |
| A07 | colombian | 3 | 483/481 | 25/34 | 51/54 | 21/15 | yes | yes | breakfast/breakfast | — | — | 5049 |
| A08 | colombian | 3 | 415/414 | 10/13 | 60/54 | 15/16 | yes | yes | breakfast/breakfast | — | — | 5270 |
| A09 | colombian | 1 | 530/529 | 35/31 | 65/59 | 15/17 | yes | yes | breakfast/breakfast | — | — | 5212 |
| A10 | colombian | 1 | 120/122 | 0/0 | 30/31 | 0/0 | yes | yes | breakfast/breakfast | — | — | 4588 |
| A11 | colombian | 2 | 680/679 | 48/48 | 22/19 | 49/44 | yes | yes | breakfast/breakfast | — | — | 3729 |
| A12 | colombian | 1 | 210/212 | 1/1 | 42/37 | 9/7 | yes | no | breakfast/breakfast | — | — | 2834 |
| A13 | colombian | 2 | 505/475 | 19/22 | 91/90 | 8/3 | yes | no | breakfast/breakfast | — | — | 3218 |
| A14 | colombian | 3 | 485/381 | 23/19 | 76/57 | 9/8 | yes | yes | breakfast/breakfast | — | — | 3400 |
| K01 | colombian-stated | 1 | 550/554 | 42/30 | 55/84 | 18/11 | yes | yes | breakfast/breakfast | — | — | 3532 |
| K02 | colombian-stated | 2 | 540/530 | 19/20 | 74/61 | 18/23 | yes | yes | breakfast/breakfast | — | — | 3469 |
| K03 | colombian-stated | 1 | 465/464 | 3/2 | 68/74 | 20/18 | yes | yes | breakfast/breakfast | — | — | 3578 |
| K04 | colombian-stated | 9 | 1930/1934 | 99/111 | 168/151 | 94/97 | yes | yes | breakfast/breakfast | — | — | 8329 |
| K05 | colombian-stated | 2 | 480/480 | 23/34 | 48/53 | 23/15 | yes | yes | breakfast/breakfast | — | — | 3642 |
| K06 | colombian-stated | 1 | 430/433 | 14/16 | 40/36 | 24/25 | yes | yes | breakfast/breakfast | — | — | 2936 |
| K07 | colombian-stated | 1 | 120/122 | 1/0 | 29/31 | 0/0 | yes | yes | breakfast/breakfast | — | — | 2172 |
| K08 | colombian-stated | 1 | 212/212 | 1.2/1 | 36.5/37 | 7.2/7 | yes | yes | breakfast/breakfast | — | — | 2756 |
| K09 | colombian-stated | 1 | 530/529 | 31/31 | 70/59 | 14/17 | yes | yes | breakfast/breakfast | — | — | 2686 |
| K10 | colombian-stated | 2 | 255/254 | 9/13 | 32/19 | 10/14 | yes | yes | breakfast/breakfast | — | — | 2393 |
| B01 | gym | 2 | 273/265 | 32/31 | 15/14 | 10/9 | yes | yes | breakfast/breakfast | — | — | 3196 |
| B02 | gym | 1 | 240/225 | 48/47 | 6/4 | 4/1 | yes | yes | breakfast/breakfast | — | — | 2837 |
| B03 | gym | 2 | 535/538 | 66/66 | 45/45 | 7.5/8 | yes | yes | breakfast/breakfast | — | — | 3886 |
| B04 | gym | 2 | 261/257 | 8.1/7 | 53.5/54 | 3.2/3 | yes | yes | breakfast/breakfast | — | — | 3887 |
| B05 | gym | 2 | 274/298 | 23/23 | 12/13 | 15/18 | yes | yes | breakfast/breakfast | — | — | 2350 |
| B06 | gym | 2 | 200/119 | 38/24 | 7/3 | 1/1 | no | yes | breakfast/breakfast | — | — | 3681 |
| B07 | gym | 1 | 320/298 | 25/20 | 2/3 | 23/22 | yes | yes | breakfast/breakfast | — | — | 3091 |
| B08 | gym | 2 | 483/481 | 37/37 | 40/40 | 18/19 | yes | yes | breakfast/breakfast | — | — | 3676 |
| B09 | gym | 2 | 430/418 | 20/18 | 49/46 | 19/20 | yes | yes | breakfast/breakfast | — | — | 3257 |
| B10 | gym | 2 | 488/488 | 55.3/55 | 42.6/43 | 9.2/9 | yes | yes | breakfast/breakfast | — | — | 3708 |
| B11 | gym | 1 | 290/290 | 22.5/23 | 50.3/50 | 1/1 | yes | yes | breakfast/breakfast | — | — | 3209 |
| B12 | gym | 2 | 593/598 | 17.4/17 | 92.7/93 | 16.3/17 | yes | yes | breakfast/breakfast | — | — | 3400 |
| C01 | quantities | 1 | 135/132 | 5/5 | 18/15 | 5/6 | yes | yes | breakfast/breakfast | — | — | 3283 |
| C02 | quantities | 1 | 234/224 | 19/15 | 2/2 | 16/17 | yes | yes | breakfast/breakfast | — | — | 2379 |
| C03 | quantities | 1 | 308/312 | 6/6 | 67/68 | 1/1 | yes | yes | breakfast/breakfast | — | — | 4685 |
| C04 | quantities | 1 | 153/153 | 8/8 | 12/12 | 8/8 | yes | yes | breakfast/breakfast | — | — | 3219 |
| C05 | quantities | 1 | 174/174 | 6.4/6 | 6.5/6 | 15/15 | yes | yes | breakfast/breakfast | — | — | 3934 |
| C06 | quantities | 1 | 190/191 | 8/7 | 7/7 | 16/16 | yes | yes | breakfast/breakfast | — | — | 2965 |
| C07 | quantities | 1 | 180/169 | 36/35 | 5/3 | 3/1 | yes | yes | breakfast/breakfast | — | — | 3088 |
| C08 | quantities | 1 | 90/89 | 1.1/1 | 23/23 | 0.3/0 | yes | yes | breakfast/breakfast | — | — | 2420 |
| C09 | quantities | 1 | 116/114 | 0.6/1 | 31/30 | 0.4/0 | yes | yes | breakfast/breakfast | — | — | 2970 |
| C10 | quantities | 1 | 140/142 | 1/2 | 12/12 | 0/0 | yes | alcohol | breakfast/breakfast | — | — | 3783 |
| D01 | mixed | 3 | 321/327 | 17/15 | 37/31 | 12/15 | yes | yes | breakfast/breakfast | — | — | 4227 |
| D02 | mixed | 4 | 720/584 | 70/53 | 58/54 | 22/16 | yes | yes | lunch/lunch | — | — | 6262 |
| D03 | mixed | 3 | 649/609 | 41/37 | 44/44 | 22.2/19 | yes | yes | dinner/dinner | — | — | 4752 |
| D04 | mixed | 2 | 235/229 | 18/18 | 34/34 | 4/4 | yes | yes | snack/snack | — | — | 3422 |
| D05 | mixed | 2 | 255/251 | 9/13 | 33/19 | 9/14 | yes | yes | breakfast/breakfast | — | — | 3364 |
| D06 | mixed | 2 | 720/678 | 25/22 | 85/70 | 22/25 | yes | yes | breakfast/breakfast | — | — | 3796 |
| D07 | mixed | 3 | 322/327 | 17/15 | 37/31 | 12/15 | yes | yes | breakfast/breakfast | — | — | 3933 |
| D08 | mixed | 4 | 602/584 | 54/53 | 58/54 | 15/16 | yes | yes | breakfast/breakfast | — | — | 5258 |
| D09 | mixed | 3 | 375/369 | 30/30 | 57/56 | 5/3 | yes | yes | breakfast/breakfast | — | — | 4442 |
| D10 | mixed | 2 | 245/247 | 2/2 | 13/13 | 9/9 | yes | yes | breakfast/breakfast | — | — | 3813 |
| E01 | temporal | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | dinner/dinner | yes | — | 2891 |
| E02 | temporal | 2 | 259/257 | 7.3/7 | 54/54 | 3.4/3 | yes | yes | breakfast/breakfast | yes | — | 4053 |
| E03 | temporal | 1 | 430/433 | 12/16 | 48/36 | 22/25 | yes | yes | dinner/dinner | yes | — | 3704 |
| E04 | temporal | 9 | 1930/1934 | 106/111 | 156/151 | 101/97 | yes | yes | dinner/dinner | yes | — | 6414 |
| E05 | temporal | 2 | 409/414 | 23/20 | 36/32 | 20/22 | yes | yes | breakfast/breakfast | — | — | 4409 |
| E06 | temporal | 1 | 550/554 | 40/30 | 45/84 | 23/11 | yes | yes | lunch/lunch|snack | yes | — | 4436 |
| E07 | temporal | 4 | 794/795 | 73/73 | 98.9/99 | 10.6/11 | yes | yes | breakfast|lunch/breakfast|lunch | — | — | 4935 |
| F01 | transcript | 1 | 265/265 | 10/10 | 35/31 | 10/11 | yes | yes | breakfast/breakfast | — | — | 3045 |
| F02 | transcript | 3 | 321/327 | 17/15 | 37/31 | 12/15 | yes | yes | breakfast/breakfast | — | — | 3927 |
| F03 | transcript | 2 | 535/538 | 66/66 | 45/45 | 7.4/8 | yes | yes | breakfast/breakfast | — | — | 3717 |
| F04 | transcript | 2 | 470/443 | 4/2 | 70/68 | 21/18 | yes | yes | breakfast/breakfast | — | — | 5619 |
| F05 | transcript | 2 | 273/265 | 32/31 | 15/14 | 10/9 | yes | yes | breakfast/breakfast | — | — | 3417 |
| F06 | transcript | 1 | 308/312 | 6/6 | 67/68 | 1/1 | yes | yes | breakfast/breakfast | — | — | 3136 |
| F07 | transcript | 2 | 440/433 | 16/16 | 44/36 | 22/25 | yes | yes | breakfast/breakfast | — | — | 4319 |
| F08 | transcript | 1 | 288/298 | 25/20 | 2/3 | 20/22 | yes | yes | breakfast/breakfast | — | — | 5668 |
| F09 | transcript | 4 | 660/584 | 64/53 | 58/54 | 18/16 | yes | yes | lunch/lunch | — | — | 5198 |
| F10 | transcript | 9 | 1930/1934 | 106/111 | 162/151 | 99/97 | yes | yes | lunch/lunch | — | — | 7541 |
| F11 | transcript | 1 | 180/169 | 36/35 | 5/3 | 2/1 | yes | yes | breakfast/breakfast | — | — | 3212 |
| F12 | transcript | 3 | 415/414 | 11/13 | 59/54 | 15/16 | yes | yes | breakfast/breakfast | — | — | 3589 |
| G01 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/breakfast | — | — | 4623 |
| G02 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/breakfast | — | — | 3564 |
| G03 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/breakfast | — | — | 2223 |
