# Food eval — baseline · 2026-10-18T01:54:23.994Z
Model `gpt-5.6-terra` · reasoning `low` · temperature not set by the route (API default) · commit `63b0dc2` · run clock 2026-10-17 20h America/Bogota · 67 utterances · synthetic fixtures only · tables regenerated 2026-10-18T02:01:31.781Z

## Cost per call (every row below was paid for at these rates)
| chat calls | mean input tokens / call | mean output tokens / call | $ per chat call | run total $ | median ms to card | p90 ms | utterances that read data first |
|---|---|---|---|---|---|---|---|
| 117 | 15220 | 316 | 0.0342 | 4.096 | 4377.5 | 5146 | 95.5 % |

## Accuracy by group (totals per utterance vs the reference band)
| group | n | items split ok | kcal in band | P | C | F | all four | median |kcal err| | median kcal bias | items: macros≈kcal | meal type | time | usual | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| colombian | 14 | 92.9 % | 71.4 % | 92.9 % | 85.7 % | 85.7 % | 57.1 % | 19.7 % | +19.1 % | 92.9 % | 100 % | — | — | 4256.5 |
| gym | 12 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.8 % | 0 % | 100 % | 100 % | — | — | 4161.5 |
| quantities | 10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0.8 % | 0 % | 100 % | 100 % | — | — | 3854 |
| mixed | 10 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 5.5 % | +2.2 % | 80 % | 100 % | — | — | 4900 |
| temporal | 6 | 100 % | 83.3 % | 100 % | 100 % | 100 % | 83.3 % | 2.6 % | +1.4 % | 100 % | 100 % | 80 % | — | 4745.5 |
| transcript | 12 | 100 % | 100 % | 91.7 % | 100 % | 100 % | 91.7 % | 9.4 % | 0 % | 91.7 % | 100 % | — | — | 4555 |
| usual | 2 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % | 0 % | 0 % | 100 % | 0 % | — | 100 % | 6573 |
| ALL | 66 | 98.5 % | 92.4 % | 97 % | 97 % | 97 % | 87.9 % | 3.7 % | +0.6 % | 93.8 % | 97 % | 80 % | 100 % | 4377.5 |

## Consistency — PRIMARY: paired twins (same food and portion, different phrasing)
15 pairs · median kcal spread **2.2 %**, p90 11.3 % · spread ≤ 10 % on 86.7 %, ≤ 20 % on 93.3 % · both in band on **93.3 %** · same item count on 80 %

| pair | kind | kcal (twin / clean) | spread | spread % | both in band | items agree |
|---|---|---|---|---|---|---|
| D07 ↔ D01 | paraphrase | 326 / 326 | 0 | 0 % | yes | yes |
| D08 ↔ D02 | paraphrase | 740 / 700 | 40 | 5.6 % | yes | yes |
| E01 ↔ B03 | paraphrase | 535 / 535 | 0 | 0 % | yes | yes |
| F01 ↔ A01 | transcript | 250 / 280 | 30 | 11.3 % | yes | yes |
| F02 ↔ D01 | transcript | 296 / 326 | 30 | 9.6 % | yes | yes |
| F03 ↔ B03 | transcript | 535 / 535 | 0 | 0 % | yes | yes |
| F04 ↔ A06 | transcript | 455 / 430 | 25 | 5.6 % | yes | no |
| F05 ↔ B01 | transcript | 273 / 275 | 2 | 0.7 % | yes | yes |
| F06 ↔ C03 | transcript | 308 / 308 | 0 | 0 % | yes | yes |
| F07 ↔ A04 | transcript | 440 / 450 | 10 | 2.2 % | yes | no |
| F08 ↔ B07 | transcript | 288 / 288 | 0 | 0 % | yes | yes |
| F09 ↔ D02 | transcript | 660 / 700 | 40 | 5.9 % | yes | yes |
| F10 ↔ A02 | transcript | 1925 / 3090 | 1165 | 46.5 % | no | no |
| F11 ↔ C07 | transcript | 180 / 180 | 0 | 0 % | yes | yes |
| F12 ↔ A08 | transcript | 520 / 500 | 20 | 3.9 % | yes | yes |

## Consistency — NOISE FLOOR: the same text 3 times (sampling only; he never sends the same text twice)
Median CV **0.5 %**, p90 15.2 % · CV ≤ 10 % on 85 % · all 3 runs in band on 80 %

| id | runs | kcal per run | spread | CV | all in band |
|---|---|---|---|---|---|
| A01 | 3 | 280 / 280 / 250 | 30 | 5.2 % | yes |
| A02 | 3 | 3090 / 1515 / 1665 | 1575 | 34 % | no |
| A03 | 3 | 550 / 520 / 650 | 130 | 9.7 % | no |
| A04 | 3 | 450 / 500 / 370 | 130 | 12.2 % | no |
| A06 | 3 | 430 / 350 / 510 | 160 | 15.2 % | no |
| A09 | 3 | 650 / 650 / 650 | 0 | 0 % | yes |
| A13 | 3 | 520 / 570 / 475 | 95 | 7.4 % | yes |
| B01 | 3 | 275 / 273 / 273 | 2 | 0.3 % | yes |
| B03 | 3 | 535 / 535 / 535 | 0 | 0 % | yes |
| B04 | 3 | 261 / 255 / 255 | 6 | 1.1 % | yes |
| B05 | 3 | 274 / 274 / 274 | 0 | 0 % | yes |
| B08 | 3 | 483 / 483 / 483 | 0 | 0 % | yes |
| C01 | 3 | 150 / 160 / 130 | 30 | 8.5 % | yes |
| C03 | 3 | 308 / 308 / 308 | 0 | 0 % | yes |
| D01 | 3 | 326 / 326 / 321 | 5 | 0.7 % | yes |
| D02 | 3 | 700 / 660 / 705 | 45 | 2.9 % | yes |
| D06 | 3 | 720 / 720 / 720 | 0 | 0 % | yes |
| E01 | 3 | 535 / 535 / 535 | 0 | 0 % | yes |
| F02 | 3 | 296 / 296 / 296 | 0 | 0 % | yes |
| F05 | 3 | 273 / 273 / 273 | 0 | 0 % | yes |

## When an item's calories and macros disagree (> 15 %), which side is right? (D2 evidence)
Checked 135 items (4 alcohol items exempt — 4P+4C+9F cannot see 7 kcal/g): **3 % disagree**. Among single-item utterances (32, the only ones with an item-level reference) 0 disagree: the kcal side was closer on 0, the macro side on 0; kcal in band on 0, macro-kcal in band on 0. Over every utterance the median |error| is 3.7 % for kcal and 7.1 % for 4P+4C+9F.

## Label reader (`/api/health/food/scan-label`) — synthetic panels, exact match per field
| label | lang | res | confident | product | serving | servings/container | kcal | P | C | F | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| I01 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1214 |
| I01 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1129 |
| I02 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1408 |
| I02 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1153 |
| I03 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1252 |
| I03 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1006 |
| I04 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1181 |
| I04 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1103 |
| I05 | en | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1357 |
| I05 | en | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1059 |
| I06 | es | hi | yes | yes | yes | yes | yes | yes | yes | yes | 1311 |
| I06 | es | lo | yes | yes | yes | yes | yes | yes | yes | yes | 1041 |

## Label through the chat with a servings multiplier
| id | label | × | cards | items | got kcal/P/C/F | want | scaled ok (±8 %) | ms |
|---|---|---|---|---|---|---|---|---|
| L01 | I01 | 2 | food | 1 | 240/50/6/2 | 240/50/6/2 | yes | 3474 |
| L02 | I02 | 1.5 | food | 1 | 165/22.5/9/4.5 | 165/22.5/9/4.5 | yes | 4116 |

## Photo path — failure modes (no meal photos were downloaded; D6)
| probe | image | cards | invented a meal? | honest | reply (start) | ms |
|---|---|---|---|---|---|---|
| P01 | coloured shapes, no food, no words | none | no | yes | I can’t log this honestly—it’s just colored shapes, not a recognizable meal or label. Send the food photo and I’ll handle it. | 4145 |
| P02 | a 1×1 blank image, no words | none | no | yes | I didn’t receive a visible image to inspect. Send it again and I’ll log what’s on it. | 4107 |

## Corrections (two turns)
| id | turn 1 | saved? | turn 2 | turn-2 cards | pass | note |
|---|---|---|---|---|---|---|
| H01 | Lunch: 200 g grilled chicken with a cup of rice | yes | make lunch 650 | edit_food | yes | edits → 445 kcal (turn-1 total 535) |
| H02 | Two eggs and an arepa | no | actually make that three eggs | food | yes | re-proposed 380 kcal (want 408) |
| H03 | A protein shake with milk | yes | that shake was 300 calories, not what you put | edit_food | no | set.calories = 180 |

## Utterances with no food card or an error
| id | error | cards | reply (start) |
|---|---|---|---|
| G03 | — | 0 | I don’t have a green morning shake saved yet. What goes in yours, and roughly how much of each? |

## Every utterance
| id | group | items | kcal got/ref | P | C | F | kcal in band | items: macros≈kcal | meal got/exp | time ok | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | colombian | 1 | 280/262 | 10/9 | 34/38 | 12/9 | yes | yes | breakfast/breakfast | — | 4374 |
| A02 | colombian | 16 | 3090/1677 | 134/88 | 312/135 | 150/86 | no | yes | lunch/lunch | — | 11672 |
| A03 | colombian | 1 | 550/383 | 36/23 | 62/45 | 18/11 | no | yes | dinner/dinner | — | 4338 |
| A04 | colombian | 2 | 450/377 | 16/10 | 46/39 | 22/20 | yes | no | dinner/dinner | — | 4357 |
| A05 | colombian | 2 | 270/248 | 10/9 | 32/29 | 12/11 | yes | yes | dinner/dinner | — | 4100 |
| A06 | colombian | 1 | 430/362 | 4/2 | 61/54 | 20/16 | yes | yes | dinner/dinner | — | 3758 |
| A07 | colombian | 1 | 650/456 | 35/23 | 65/50 | 27/19 | no | yes | dinner/dinner | — | 4752 |
| A08 | colombian | 3 | 500/455 | 13/11 | 72/63 | 18/18 | yes | yes | dinner/dinner | — | 4827 |
| A09 | colombian | 1 | 650/525 | 33/32 | 85/63 | 18/16 | yes | yes | dinner/dinner | — | 3594 |
| A10 | colombian | 1 | 120/150 | 1/1 | 30/36 | 0/0 | yes | yes | dinner/dinner | — | 3575 |
| A11 | colombian | 2 | 650/630 | 22/34 | 20/23 | 51/44 | yes | yes | dinner/dinner | — | 4473 |
| A12 | colombian | 1 | 180/129 | 1/1 | 30/20 | 7/5 | no | yes | dinner/dinner | — | 4175 |
| A13 | colombian | 1 | 520/499 | 20/20 | 101/89 | 6/7 | yes | yes | dinner/dinner | — | 3792 |
| A14 | colombian | 1 | 485/374 | 20/18 | 69/56 | 15/8 | yes | yes | breakfast/breakfast | — | 3820 |
| B01 | gym | 1 | 275/273 | 33/32 | 16/14 | 10/10 | yes | yes | dinner/dinner | — | 3270 |
| B02 | gym | 1 | 240/240 | 48/48 | 6/5 | 2/3 | yes | yes | dinner/dinner | — | 4478 |
| B03 | gym | 2 | 535/538 | 66/66 | 45/45 | 7.4/8 | yes | yes | dinner/dinner | — | 3875 |
| B04 | gym | 2 | 261/257 | 8.1/6 | 53.5/54 | 3.2/3 | yes | yes | dinner/dinner | — | 4078 |
| B05 | gym | 2 | 274/298 | 23/23 | 12/13 | 15/18 | yes | yes | dinner/dinner | — | 3199 |
| B06 | gym | 2 | 169/159 | 33/33 | 6/4 | 1/1 | yes | yes | dinner/dinner | — | 4221 |
| B07 | gym | 1 | 288/310 | 25/26 | 2/2 | 20/22 | yes | yes | dinner/dinner | — | 3618 |
| B08 | gym | 2 | 483/483 | 36.8/37 | 40/40 | 18.7/18 | yes | yes | dinner/dinner | — | 4457 |
| B09 | gym | 2 | 400/410 | 20/20 | 43/43 | 19/19 | yes | yes | dinner/dinner | — | 4102 |
| B10 | gym | 2 | 488/488 | 55.3/55 | 42.6/42 | 9.2/9 | yes | yes | dinner/dinner | — | 4370 |
| B11 | gym | 1 | 290/290 | 22.5/23 | 50.3/50 | 1/1 | yes | yes | dinner/dinner | — | 4895 |
| B12 | gym | 2 | 593/598 | 17/17 | 93/93 | 17/17 | yes | yes | dinner/dinner | — | 4841 |
| C01 | quantities | 1 | 150/131 | 5/4 | 18/19 | 7/4 | yes | yes | dinner/dinner | — | 3932 |
| C02 | quantities | 1 | 234/233 | 19/20 | 2/2 | 16/17 | yes | yes | dinner/dinner | — | 3787 |
| C03 | quantities | 1 | 308/312 | 6/6 | 67/67 | 1/1 | yes | yes | dinner/dinner | — | 3901 |
| C04 | quantities | 1 | 153/153 | 8/8 | 12/12 | 8/8 | yes | yes | dinner/dinner | — | 3552 |
| C05 | quantities | 1 | 174/174 | 6.4/6 | 6.5/7 | 15/15 | yes | yes | dinner/dinner | — | 3724 |
| C06 | quantities | 1 | 190/188 | 8/8 | 7/6 | 16/16 | yes | yes | dinner/dinner | — | 3883 |
| C07 | quantities | 1 | 180/180 | 36/36 | 5/4 | 2/2 | yes | yes | dinner/dinner | — | 4899 |
| C08 | quantities | 1 | 89/89 | 1.1/1 | 22.8/23 | 0.3/0 | yes | yes | dinner/dinner | — | 3825 |
| C09 | quantities | 1 | 116/114 | 0.6/1 | 31/31 | 0.4/0 | yes | yes | dinner/dinner | — | 3744 |
| C10 | quantities | 1 | 140/142 | 1/2 | 11/12 | 0/0 | yes | alcohol | dinner/dinner | — | 4448 |
| D01 | mixed | 3 | 326/335 | 17/17 | 37/38 | 12/13 | yes | no | breakfast/breakfast | — | 4403 |
| D02 | mixed | 4 | 700/588 | 64/54 | 61/55 | 22/16 | yes | yes | lunch/lunch | — | 4982 |
| D03 | mixed | 3 | 649/611 | 41/37 | 44/44 | 22/18 | yes | yes | dinner/dinner | — | 4884 |
| D04 | mixed | 2 | 205/229 | 18.3/18 | 33/34 | 0.4/4 | yes | yes | snack/snack | — | 4916 |
| D05 | mixed | 2 | 260/248 | 9/9 | 34/29 | 10/11 | yes | yes | dinner/dinner | — | 3939 |
| D06 | mixed | 2 | 720/674 | 25/24 | 85/78 | 22/20 | yes | yes | dinner/dinner | — | 4831 |
| D07 | mixed | 3 | 326/335 | 17/17 | 37/38 | 12/13 | yes | no | dinner/dinner | — | 6033 |
| D08 | mixed | 4 | 740/588 | 70/54 | 63/55 | 22/16 | yes | yes | dinner/dinner | — | 5080 |
| D09 | mixed | 3 | 375/377 | 30/30 | 57/57 | 5/4 | yes | yes | dinner/dinner | — | 4927 |
| D10 | mixed | 2 | 245/247 | 1.5/2 | 13/13 | 8.5/9 | yes | yes | dinner/dinner | — | 4381 |
| E01 | temporal | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | dinner/dinner | no | 4979 |
| E02 | temporal | 2 | 259/257 | 7/6 | 54/54 | 3/3 | yes | yes | breakfast/breakfast | yes | 4174 |
| E03 | temporal | 1 | 400/377 | 12/10 | 42/39 | 20/20 | yes | yes | dinner/dinner | yes | 4512 |
| E04 | temporal | 8 | 1710/1677 | 76/88 | 166/135 | 82/86 | yes | yes | dinner/dinner | yes | 7725 |
| E05 | temporal | 2 | 404/417 | 23/22 | 35/39 | 20/20 | yes | yes | breakfast/breakfast | — | 4484 |
| E06 | temporal | 1 | 550/383 | 35/23 | 65/45 | 16/11 | no | yes | lunch/lunch|snack | yes | 4981 |
| F01 | transcript | 1 | 250/262 | 8/9 | 30/38 | 11/9 | yes | yes | breakfast/breakfast | — | 2647 |
| F02 | transcript | 3 | 296/335 | 16/17 | 31/38 | 12/13 | yes | no | breakfast/breakfast | — | 5146 |
| F03 | transcript | 2 | 535/538 | 66/66 | 45/45 | 7/8 | yes | yes | dinner/dinner | — | 4082 |
| F04 | transcript | 2 | 455/362 | 5/2 | 68/54 | 19/16 | yes | yes | dinner/dinner | — | 4709 |
| F05 | transcript | 1 | 273/273 | 32/32 | 15/14 | 10/10 | yes | yes | dinner/dinner | — | 4351 |
| F06 | transcript | 1 | 308/312 | 6.5/6 | 67.5/67 | 0.6/1 | yes | yes | dinner/dinner | — | 3975 |
| F07 | transcript | 1 | 440/377 | 20/10 | 48/39 | 22/20 | yes | yes | dinner/dinner | — | 4497 |
| F08 | transcript | 1 | 288/310 | 25/26 | 2/2 | 19/22 | yes | yes | dinner/dinner | — | 3311 |
| F09 | transcript | 4 | 660/588 | 64/54 | 58/55 | 18/16 | yes | yes | lunch/lunch | — | 5282 |
| F10 | transcript | 9 | 1925/1677 | 89/88 | 167/135 | 101/86 | yes | yes | lunch/lunch | — | 5852 |
| F11 | transcript | 1 | 180/180 | 36/36 | 5/4 | 2/2 | yes | yes | dinner/dinner | — | 4821 |
| F12 | transcript | 3 | 520/455 | 13/11 | 77/63 | 18/18 | yes | yes | dinner/dinner | — | 4613 |
| G01 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/dinner | — | 4714 |
| G02 | usual | 1 | 310/310 | 32/32 | 28/28 | 6/6 | yes | yes | breakfast/dinner | — | 8432 |
| G03 | usual | 0 | 0/310 | 0/32 | 0/28 | 0/6 | — | — | — | — | 5095 |
