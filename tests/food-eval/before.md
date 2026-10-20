# Food eval — before · 2026-10-20T14:04:19.677Z
Server code `d3f537a` · database `pitaya_lane_d_eval` (0 food rows, 0 usuals, 0 chats before seeding) · model observed `gpt-5.6-terra` · reasoning `low` · temperature not set by the route (API default) · run clock 2026-10-20 9h America/Bogota · 78 utterances · synthetic fixtures only · re-scored 2026-10-20T14:32:09.788Z with the current references

## Cost by stage
| stage | chat calls | mean input tokens / call | mean output tokens / call | $ per chat call | stage $ |
|---|---|---|---|---|---|
| main | 78 | 15121 | 305 | 0.0339 | 2.683 |
| repeats | 40 | 14988 | 327 | 0.0339 | 1.375 |
| corrections | 6 | 14196 | 294 | 0.0319 | 0.193 |
| labels | 2 | 17910 | 243 | 0.0387 | 0.114 |
| photos | 2 | 15858 | 140 | 0.0334 | 0.068 |

Run total $4.433 · median 5313 ms to the card (5314 ms to the end of the turn) · read data before proposing on 95.9 % of carded utterances (today_summary ×67, favorite_foods ×3, settings ×1, recent_food ×1)

## Accuracy by group — rates over EVERY utterance sent (no card = a miss)
| group | n | cards | items split ok | kcal in band | P | C | F | all four | median |kcal err| | median kcal bias | items: macros≈kcal | meal type | time | usual | median ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colombian | 14 | 14/14 | 100 % | 78.6 % | 85.7 % | 85.7 % | 85.7 % | 57.1 % | 16.5 % | +2.8 % | 100 % | 100 % | — | — | 5566 |
| colombian-stated | 10 | 10/10 | 100 % | 80 % | 100 % | 90 % | 80 % | 60 % | 14.5 % | +6.2 % | 100 % | 100 % | — | — | 5578.5 |
| gym | 12 | 12/12 | 100 % | 91.7 % | 100 % | 100 % | 100 % | 91.7 % | 2.3 % | +0.2 % | 100 % | 100 % | — | — | 5313 |
| quantities | 10 | 10/10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 1.6 % | 0 % | 100 % | 100 % | — | — | 5048.5 |
| mixed | 10 | 10/10 | 100 % | 100 % | 100 % | 90 % | 100 % | 90 % | 8.2 % | +3.9 % | 100 % | 90 % | — | — | 5188.5 |
| temporal | 7 | 5/7 | 71.4 % | 71.4 % | 71.4 % | 71.4 % | 71.4 % | 71.4 % | 0.8 % | -0.8 % | 100 % | 71.4 % | 40 % | — | 5852 |
| transcript | 12 | 12/12 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 6 % | +4.4 % | 100 % | 100 % | — | — | 4977 |
| usual | 3 | 1/3 | 33.3 % | 33.3 % | 33.3 % | 33.3 % | 33.3 % | 33.3 % | 0 % | 0 % | 100 % | 33.3 % | — | 33.3 % | 5742 |
| ALL | 78 | 74/78 | 94.9 % | 87.2 % | 92.3 % | 89.7 % | 89.7 % | 79.5 % | 6.3 % | +0.4 % | 100 % | 93.6 % | 40 % | 33.3 % | 5313 |

## Card fields (Phase 3 additions — absent before by design)
| items with confidence | cards with source = chat | history shown where seeded | anchor gate right | anchors handed to the model | save-as-usual offered | rows folded as duplicates | items flagged |
|---|---|---|---|---|---|---|---|
| 0 % | 0 % | 0/3 | 4/5 | none | none | none | 0 |

## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)
15 pairs (15 with a card on both sides) · pair CV median **0 %**, mean 3.7 %, p90 15.3 % · both in band on **93.3 %** · same item count on 86.7 %. Pair CV is |a−b| / (a+b), the same unit as the noise floor's CV.

| pair | kind | kcal (twin / clean) | pair CV | both in band | items agree |
|---|---|---|---|---|---|
| D07 ↔ D01 | paraphrase | 306 / 306 | 0 % | yes | yes |
| D08 ↔ D02 | paraphrase | 705 / 700 | 0.4 % | yes | yes |
| E01 ↔ B03 | paraphrase | 535 / 535 | 0 % | yes | yes |
| F01 ↔ A01 | transcript | 280 / 220 | 12 % | yes | yes |
| F02 ↔ D01 | transcript | 296 / 306 | 1.7 % | yes | yes |
| F03 ↔ B03 | transcript | 535 / 535 | 0 % | yes | yes |
| F04 ↔ A06 | transcript | 490 / 360 | 15.3 % | yes | yes |
| F05 ↔ B01 | transcript | 273 / 273 | 0 % | yes | yes |
| F06 ↔ C03 | transcript | 308 / 308 | 0 % | yes | yes |
| F07 ↔ A04 | transcript | 530 / 500 | 2.9 % | yes | no |
| F08 ↔ B07 | transcript | 288 / 288 | 0 % | yes | yes |
| F09 ↔ D02 | transcript | 700 / 700 | 0 % | yes | yes |
| F10 ↔ A02 | transcript | 1845 / 1250 | 19.2 % | no | no |
| F11 ↔ C07 | transcript | 180 / 180 | 0 % | yes | yes |
| F12 ↔ A08 | transcript | 440 / 480 | 4.3 % | yes | yes |

## Consistency — NOISE FLOOR: identical text 3 times (sampling only)
CV median **0.4 %**, mean 5 %, p90 18.7 % · 13/20 within 10 kcal · 17/20 with CV ≤ 10 % · every run in band on 95 %. A twin difference smaller than the mean here is the model's dice, not phrasing.

| id | runs (cards) | kcal per run | spread | CV | all in band |
|---|---|---|---|---|---|
| A01 | 3 (3) | 220 / 290 / 280 | 70 | 11.7 % | yes |
| A02 | 3 (3) | 1250 / 3170 / 1250 | 1920 | 47.9 % | no |
| A03 | 3 (3) | 520 / 500 / 500 | 20 | 1.9 % | yes |
| A04 | 3 (3) | 500 / 500 / 500 | 0 | 0 % | yes |
| A06 | 3 (3) | 360 / 410 / 555 | 195 | 18.7 % | yes |
| A09 | 3 (3) | 650 / 650 / 650 | 0 | 0 % | yes |
| A13 | 3 (3) | 480 / 480 / 475 | 5 | 0.5 % | yes |
| B01 | 3 (3) | 273 / 273 / 273 | 0 | 0 % | yes |
| B03 | 3 (3) | 535 / 535 / 535 | 0 | 0 % | yes |
| B04 | 3 (3) | 261 / 261 / 257 | 4 | 0.7 % | yes |
| B05 | 3 (3) | 274 / 274 / 274 | 0 | 0 % | yes |
| B08 | 3 (3) | 483 / 486 / 483 | 3 | 0.3 % | yes |
| C01 | 3 (3) | 140 / 130 / 150 | 20 | 5.8 % | yes |
| C03 | 3 (3) | 308 / 308 / 308 | 0 | 0 % | yes |
| D01 | 3 (3) | 306 / 296 / 296 | 10 | 1.6 % | yes |
| D02 | 3 (3) | 700 / 657 / 735 | 78 | 4.6 % | yes |
| D06 | 3 (3) | 720 / 720 / 720 | 0 | 0 % | yes |
| E01 | 3 (3) | 535 / 535 / 535 | 0 | 0 % | yes |
| F02 | 3 (3) | 296 / 326 / 286 | 40 | 5.6 % | yes |
| F05 | 3 (3) | 273 / 273 / 273 | 0 | 0 % | yes |

## When an item's calories and macros disagree (> 15 %, items ≥ 30 kcal), which side is right? (D2 evidence)
Checked 132 items of 30 kcal or more (4 alcohol items exempt): **0 % disagree**. Single-item utterances: 37; 0 disagree — kcal closer to the reference on 0, macros on 0.

## Label reader (`/api/health/food/scan-label`) — synthetic panels, exact match per field
| label | lang | res | confident | product | serving | servings/container | kcal | P | C | F | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| I01 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2562 |
| I01 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1538 |
| I02 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2099 |
| I02 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1885 |
| I03 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1931 |
| I03 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1455 |
| I04 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1838 |
| I04 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1559 |
| I05 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2019 |
| I05 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1431 |
| I06 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 2062 |
| I06 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1495 |

## Label through the chat with a servings multiplier
| id | label | × | cards | items | got kcal/P/C/F | want | scaled ok (±8 %) | ms |
|---|---|---|---|---|---|---|---|---|
| L01 | I01 | 2 | food | 1 | 240/50/6/2 | 240/50/6/2 | yes | 4860 |
| L02 | I02 | 1.5 | food | 1 | 165/22.5/9/4.5 | 165/22.5/9/4.5 | yes | 4984 |

## Photo path — failure modes only (no meal photos were downloaded; D6)
| probe | image | cards | invented a meal? | honest | reply (start) | ms |
|---|---|---|---|---|---|---|
| P01 | coloured shapes, no food, no words | none | no | yes | I can’t identify food from this image—it’s just colored shapes. Send the meal photo or tell me what’s on the plate and roughly how much. | 3749 |
| P02 | a 1×1 blank image, no words | none | no | yes | I can’t actually see the photo on my end. Send it again (or tell me what’s on the plate), and I’ll log it. | 3863 |

## Corrections (two turns; edits checked against the rows actually saved)
| id | turn 1 | saved? | turn 2 | turn-2 cards | pass | note |
|---|---|---|---|---|---|---|
| H01 | Lunch: 200 g grilled chicken with a cup of rice | yes | make lunch 650 | edit_food | yes | saved rows 330+205 · edits 320 · new total 650 (want 650) |
| H02 | Two eggs and an arepa | no | actually make that three eggs | food | yes | re-proposed 366 kcal (want 399) |
| H03 | A protein shake with milk | yes | that shake was 300 calories, not what you put | edit_food | yes | saved rows 120+150 · edits 180 · new total 300 (want 300) |

## Utterances with no food card or an error (counted as misses above)
| id | error | cards | reply (start) |
|---|---|---|---|
| E04 | — | 0 |  |
| E06 | — | 0 | ¿Fue ayer a las 2 pm? Ahora mismo son las 9:06 am, así que no quiero mandarlo al día equivocado. |
| G02 | — | 0 | No tengo ese batido guardado ni encuentro una versión anterior. ¿Qué lleva y en qué cantidades? |
| G03 | — | 0 | I don’t have a saved “green morning shake” yet. What goes in yours—and roughly how much of each? |

## Every utterance
| id | group | items | kcal got/ref | P | C | F | kcal in band | items: macros≈kcal | meal got/exp | time ok | tools | ms to card |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | colombian | 1 | 220/265 | 8/10 | 30/31 | 8/11 | yes | yes | breakfast/breakfast | — | today_summary | 6007 |
| A02 | colombian | 1 | 1250/1934 | 52/111 | 125/151 | 60/97 | no | yes | lunch/lunch | — | today_summary | 5120 |
| A03 | colombian | 1 | 520/554 | 35/30 | 52/84 | 18/11 | yes | yes | breakfast/breakfast | — | today_summary | 6303 |
| A04 | colombian | 1 | 500/433 | 18/16 | 44/36 | 28/25 | yes | yes | breakfast/breakfast | — | today_summary | 5105 |
| A05 | colombian | 2 | 300/251 | 14/13 | 36/19 | 12/14 | yes | yes | breakfast/breakfast | — | today_summary | 5245 |
| A06 | colombian | 1 | 360/443 | 4/2 | 57/68 | 15/18 | yes | yes | breakfast/breakfast | — | today_summary | 5266 |
| A07 | colombian | 1 | 650/481 | 40/34 | 65/54 | 25/15 | no | yes | breakfast/breakfast | — | today_summary | 5661 |
| A08 | colombian | 3 | 480/414 | 14/13 | 68/54 | 18/16 | yes | yes | breakfast/breakfast | — | today_summary | 6860 |
| A09 | colombian | 1 | 650/529 | 35/31 | 78/59 | 20/17 | yes | yes | breakfast/breakfast | — | today_summary | 5471 |
| A10 | colombian | 1 | 60/122 | 1/0 | 15/31 | 0/0 | no | yes | breakfast/breakfast | — | today_summary | 4215 |
| A11 | colombian | 2 | 710/679 | 21/48 | 23/19 | 54/44 | yes | yes | breakfast/breakfast | — | today_summary | 6221 |
| A12 | colombian | 1 | 180/212 | 1/1 | 32/37 | 7/7 | yes | yes | breakfast/breakfast | — | today_summary | 5260 |
| A13 | colombian | 3 | 480/475 | 20/22 | 93/90 | 3/3 | yes | yes | breakfast/breakfast | — | today_summary | 6073 |
| A14 | colombian | 3 | 435/381 | 18/19 | 67/57 | 10/8 | yes | yes | breakfast/breakfast | — | today_summary | 8573 |
| K01 | colombian-stated | 1 | 590/554 | 39/30 | 66/84 | 18/11 | yes | yes | breakfast/breakfast | — | — | 3454 |
| K02 | colombian-stated | 2 | 500/530 | 18/20 | 72/61 | 16/23 | yes | yes | breakfast/breakfast | — | today_summary | 4548 |
| K03 | colombian-stated | 1 | 390/464 | 3/2 | 62/74 | 15/18 | yes | yes | breakfast/breakfast | — | today_summary | 7847 |
| K04 | colombian-stated | 9 | 1941/1934 | 95/111 | 149/151 | 106.5/97 | yes | yes | breakfast/breakfast | — | today_summary | 10313 |
| K05 | colombian-stated | 2 | 650/480 | 36/34 | 69/53 | 26/15 | no | yes | breakfast/breakfast | — | today_summary | 8282 |
| K06 | colombian-stated | 1 | 320/433 | 12/16 | 30/36 | 16/25 | no | yes | breakfast/breakfast | — | today_summary | 5202 |
| K07 | colombian-stated | 1 | 140/122 | 1/0 | 35/31 | 0/0 | yes | yes | breakfast/breakfast | — | today_summary | 5358 |
| K08 | colombian-stated | 1 | 245/212 | 1/1 | 42/37 | 9/7 | yes | yes | breakfast/breakfast | — | today_summary | 5615 |
| K09 | colombian-stated | 1 | 560/529 | 32/31 | 72/59 | 15/17 | yes | yes | breakfast/breakfast | — | today_summary | 5542 |
| K10 | colombian-stated | 2 | 290/254 | 12/13 | 37/19 | 11/14 | yes | yes | breakfast/breakfast | — | today_summary | 7665 |
| B01 | gym | 1 | 273/265 | 32/31 | 15/14 | 9.5/9 | yes | yes | breakfast/breakfast | — | today_summary | 5097 |
| B02 | gym | 1 | 240/225 | 48/47 | 6/4 | 4/1 | yes | yes | breakfast/breakfast | — | today_summary | 5028 |
| B03 | gym | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | breakfast/breakfast | — | today_summary | 5981 |
| B04 | gym | 2 | 261/257 | 8.1/7 | 53.5/54 | 3.2/3 | yes | yes | breakfast/breakfast | — | today_summary | 6062 |
| B05 | gym | 2 | 274/298 | 23.4/23 | 12.5/13 | 15/18 | yes | yes | breakfast/breakfast | — | favorite_foods | 5872 |
| B06 | gym | 2 | 160/119 | 31/24 | 6/3 | 1/1 | no | yes | breakfast/breakfast | — | today_summary | 5814 |
| B07 | gym | 1 | 288/298 | 25/20 | 2/3 | 19/22 | yes | yes | breakfast/breakfast | — | today_summary | 5339 |
| B08 | gym | 2 | 483/481 | 37/37 | 40/40 | 19/19 | yes | yes | breakfast/breakfast | — | today_summary | 5969 |
| B09 | gym | 2 | 430/418 | 20/18 | 49/46 | 19/20 | yes | yes | breakfast/breakfast | — | today_summary | 5058 |
| B10 | gym | 2 | 488/488 | 56/55 | 43/43 | 9/9 | yes | yes | breakfast/breakfast | — | today_summary | 5287 |
| B11 | gym | 1 | 290/290 | 22.6/23 | 50.3/50 | 1/1 | yes | yes | breakfast/breakfast | — | today_summary | 4959 |
| B12 | gym | 2 | 593/598 | 17.4/17 | 92.7/93 | 16.2/17 | yes | yes | breakfast/breakfast | — | today_summary | 4770 |
| C01 | quantities | 1 | 140/132 | 5/5 | 18/15 | 5/6 | yes | yes | breakfast/breakfast | — | today_summary | 6039 |
| C02 | quantities | 1 | 234/224 | 19/15 | 2/2 | 16/17 | yes | yes | breakfast/breakfast | — | today_summary | 5053 |
| C03 | quantities | 1 | 308/312 | 6.4/6 | 67.4/68 | 0.6/1 | yes | yes | breakfast/breakfast | — | today_summary | 7375 |
| C04 | quantities | 1 | 153/153 | 8/8 | 12/12 | 8/8 | yes | yes | breakfast/breakfast | — | today_summary | 4434 |
| C05 | quantities | 1 | 174/174 | 6.4/6 | 6.5/6 | 15/15 | yes | yes | breakfast/breakfast | — | — | 3548 |
| C06 | quantities | 1 | 190/191 | 8/7 | 7/7 | 16/16 | yes | yes | breakfast/breakfast | — | today_summary | 4103 |
| C07 | quantities | 1 | 180/169 | 36/35 | 5/3 | 2/1 | yes | yes | breakfast/breakfast | — | favorite_foods | 5612 |
| C08 | quantities | 1 | 80/89 | 1/1 | 21/23 | 0.3/0 | yes | yes | breakfast/breakfast | — | today_summary | 5044 |
| C09 | quantities | 1 | 116/114 | 0.6/1 | 31/30 | 0.4/0 | yes | yes | breakfast/breakfast | — | today_summary | 4064 |
| C10 | quantities | 1 | 140/142 | 1/2 | 11/12 | 0/0 | yes | alcohol | breakfast/breakfast | — | today_summary | 5257 |
| D01 | mixed | 3 | 306/327 | 17/15 | 33/31 | 12/15 | yes | yes | breakfast/breakfast | — | today_summary | 4124 |
| D02 | mixed | 4 | 700/584 | 64/53 | 61/54 | 22/16 | yes | yes | lunch/lunch | — | today_summary | 6116 |
| D03 | mixed | 3 | 670/609 | 44/37 | 44/44 | 23/19 | yes | yes | dinner/dinner | — | today_summary | 5200 |
| D04 | mixed | 2 | 205/229 | 18/18 | 33/34 | 0/4 | yes | yes | breakfast/snack | — | today_summary | 5911 |
| D05 | mixed | 2 | 290/251 | 11/13 | 36/19 | 12/14 | yes | yes | breakfast/breakfast | — | today_summary | 5105 |
| D06 | mixed | 2 | 720/678 | 25/22 | 85/70 | 22/25 | yes | yes | breakfast/breakfast | — | today_summary | 5389 |
| D07 | mixed | 3 | 306/327 | 17/15 | 33/31 | 12/15 | yes | yes | breakfast/breakfast | — | today_summary | 4920 |
| D08 | mixed | 4 | 705/584 | 64/53 | 62/54 | 21.4/16 | yes | yes | breakfast/breakfast | — | today_summary | 8327 |
| D09 | mixed | 1 | 375/369 | 29/30 | 58/56 | 5/3 | yes | yes | breakfast/breakfast | — | today_summary | 4561 |
| D10 | mixed | 2 | 245/247 | 2/2 | 13/13 | 9/9 | yes | yes | breakfast/breakfast | — | today_summary | 5177 |
| E01 | temporal | 2 | 535/538 | 66.3/66 | 44.5/45 | 7.6/8 | yes | yes | dinner/dinner | no | — | 4506 |
| E02 | temporal | 2 | 255/257 | 6/7 | 54/54 | 3/3 | yes | yes | breakfast/breakfast | yes | today_summary | 6006 |
| E03 | temporal | 1 | 360/433 | 12/16 | 36/36 | 20/25 | yes | yes | dinner/dinner | yes | today_summary | 7956 |
| E04 | temporal | 0 | 0/1934 | 0/111 | 0/151 | 0/97 | no | — | — | no | today_summary | — |
| E05 | temporal | 2 | 404/414 | 23/20 | 37/32 | 19/22 | yes | yes | breakfast/breakfast | — | today_summary | 4444 |
| E06 | temporal | 0 | 0/554 | 0/30 | 0/84 | 0/11 | no | — | — | no | today_summary | — |
| E07 | temporal | 4 | 794/795 | 73/73 | 99/99 | 10/11 | yes | yes | breakfast|lunch/breakfast|lunch | — | today_summary | 5852 |
| F01 | transcript | 1 | 280/265 | 10/10 | 35/31 | 11/11 | yes | yes | breakfast/breakfast | — | today_summary | 4058 |
| F02 | transcript | 3 | 296/327 | 16/15 | 31/31 | 12/15 | yes | yes | breakfast/breakfast | — | today_summary | 5109 |
| F03 | transcript | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | breakfast/breakfast | — | today_summary | 4845 |
| F04 | transcript | 1 | 490/443 | 4/2 | 78/68 | 20/18 | yes | yes | breakfast/breakfast | — | settings | 4667 |
| F05 | transcript | 1 | 273/265 | 32/31 | 15/14 | 10/9 | yes | yes | breakfast/breakfast | — | today_summary | 4123 |
| F06 | transcript | 1 | 308/312 | 6/6 | 67/68 | 1/1 | yes | yes | breakfast/breakfast | — | today_summary | 10038 |
| F07 | transcript | 2 | 530/433 | 20/16 | 50/36 | 28/25 | yes | yes | breakfast/breakfast | — | today_summary | 5765 |
| F08 | transcript | 1 | 288/298 | 25/20 | 2/3 | 20/22 | yes | yes | breakfast/breakfast | — | today_summary | 4509 |
| F09 | transcript | 4 | 700/584 | 64/53 | 61/54 | 22/16 | yes | yes | lunch/lunch | — | today_summary | 8146 |
| F10 | transcript | 9 | 1845/1934 | 84/111 | 161/151 | 95/97 | yes | yes | lunch/lunch | — | today_summary | 8183 |
| F11 | transcript | 1 | 180/169 | 36/35 | 5/3 | 3/1 | yes | yes | breakfast/breakfast | — | today_summary | 4351 |
| F12 | transcript | 3 | 440/414 | 12/13 | 64/54 | 15/16 | yes | yes | breakfast/breakfast | — | today_summary | 6188 |
| G01 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/breakfast | — | recent_food,favorite_foods | 5742 |
| G02 | usual | 0 | 0/310 | 0/32 | 0/28 | 0/6 | no | — | — | — | favorite_foods,recent_food,recent_food | — |
| G03 | usual | 0 | 0/310 | 0/32 | 0/28 | 0/6 | no | — | — | — | favorite_foods | — |
