# Food eval — reference nutrients

Per 100 g (per 100 ml for drinks): kcal · protein g · carbs g · fat g. Every
row cites its source: a USDA FoodData Central id (SR Legacy, FNDDS or
Foundation), a FoodData Central Branded Foods id (the product's own label —
used for the Colombian cheese breads, which USDA does not list generically,
and for whey isolate, where the generic entry is unlike what is sold), or a
stated recipe of cited components (sancocho, ajiaco, arroz con pollo,
buñuelo, hogao, the drinks). Ids can be opened at
`https://fdc.nal.usda.gov/food-details/<id>/nutrients`. Nothing here is from
Michael's logs. Generated from `tests/food-eval/foods.mjs` by
`scripts/food-eval.mjs`; edit the module, not this file.

| key | food | per 100 g | source |
|---|---|---|---|
| `arepa` | Arepa de maíz (Latino restaurant arepa) | 219 · 5.5 · 37.1 · 5.4 | FDC 168070 |
| `queso_fresco` | Queso fresco / campesino | 299 · 18.1 · 3 · 23.8 | FDC 172223 |
| `huevo` | Egg, scrambled (no added fat in the SR entry beyond its own) | 149 · 10 · 1.6 · 11 | FDC 172187 |
| `huevo_cocido` | Egg, hard-boiled | 155 · 12.6 · 1.1 · 10.6 | FDC 173424 |
| `huevo_frito` | Egg, fried | 196 · 13.6 · 0.8 · 14.8 | FDC 173423 |
| `arroz_blanco` | White rice, cooked | 130 · 2.7 · 28.2 · 0.3 | FDC 168878 |
| `frijoles` | Red kidney beans, cooked (plain — Colombian frijoles add pork or plantain, so this is a floor) | 127 · 8.7 · 22.8 · 0.5 | FDC 175194 |
| `carne_molida` | Ground beef 85 %, pan-browned | 256 · 27.7 · 0 · 15.3 | FDC 174034 |
| `chicharron` | Pork cracklings (chicharrón) | 569 · 45 · 0 · 41.7 | FDC 2705895 |
| `chorizo` | Pork chorizo, pan-fried | 346 · 19.3 · 2.6 · 28.1 | FDC 746781 |
| `maduro_frito` | Ripe plantain, fried (tajadas de maduro) | 236 · 1.4 · 40.8 · 7.5 | FDC 168200 |
| `patacon` | Green plantain, fried (patacón) | 309 · 1.5 · 49.2 · 11.8 | FDC 168199 |
| `aguacate` | Avocado | 160 · 2 · 8.5 · 14.7 | FDC 171705 |
| `empanada` | Empanada, beef (fried) | 333 · 12.1 · 27.5 · 19.2 | FDC 2708711 |
| `pandebono` | Pandebono (cheese bread) | 321 · 16.1 · 23.2 · 17.9 | FDC Branded 2308976 |
| `almojabana` | Almojábana (cheese bun) | 298 · 20 · 24.4 · 13.3 | FDC Branded 2154112 |
| `crema_leche` | Heavy cream | 340 · 2.8 · 2.8 · 36.1 | FDC 170859 |
| `alcaparras` | Capers, canned | 23 · 2.4 · 4.9 · 0.9 | FDC 172238 |
| `cafe_negro` | Coffee, brewed | 1 · 0.1 · 0 · 0 | FDC 171890 |
| `pollo_muslo` | Chicken thigh, meat only, stewed | 195 · 25 · 0 · 9.8 | FDC 172389 |
| `yuca` | Cassava (boiled ≈ raw per gram; the SR raw entry) | 160 · 1.4 · 38.1 · 0.3 | FDC 169985 |
| `platano_verde_cocido` | Green plantain, boiled | 121 · 1.1 · 29.2 · 0.1 | FDC 168216 |
| `mazorca` | Sweet corn, boiled | 96 · 3.4 · 21 · 1.5 | FDC 169999 |
| `tomate` | Tomato, raw | 18 · 0.9 · 3.9 · 0.2 | FDC 170457 |
| `cebolla` | Onion, raw | 40 · 1.1 · 9.3 · 0.1 | FDC 170000 |
| `tapioca` | Tapioca / cassava starch | 358 · 0.2 · 88.7 · 0 | FDC 169717 |
| `maicena` | Cornstarch | 381 · 0.3 · 91.3 · 0.1 | FDC 169698 |
| `azucar` | Sugar, granulated | 387 · 0 · 100 · 0 | FDC 169655 |
| `panela_bloque` | Panela (brown sugar entry as the closest USDA match) | 380 · 0.1 · 98.1 · 0 | FDC 168833 |
| `lulo_pulpa` | Naranjilla (lulo) pulp, unsweetened | 25 · 0.4 · 5.9 · 0.2 | FDC 167790 |
| `agua` | Water / broth | 0 · 0 · 0 · 0 | — |
| `whey` | Whey protein isolate (Dymatize ISO100 label) | 375 · 78.1 · 6.3 · 1.6 | FDC Branded 2452284 |
| `leche_entera` | Whole milk | 61 · 3.2 · 4.8 · 3.3 | FDC 171265 |
| `avena_seca` | Oats, dry | 379 · 13.2 · 67.7 · 6.5 | FDC 173904 |
| `banano` | Banana | 89 · 1.1 · 22.8 · 0.3 | FDC 173944 |
| `manzana` | Apple, with skin | 52 · 0.3 · 13.8 · 0.2 | FDC 171688 |
| `pollo_plancha` | Chicken breast, meat only, roasted | 165 · 31 · 0 · 3.6 | FDC 171477 |
| `yogur_griego` | Greek yogurt, plain, lowfat | 73 · 10 · 3.9 · 1.9 | FDC 170903 |
| `almendras` | Almonds | 579 · 21.2 · 21.6 · 49.9 | FDC 170567 |
| `atun_agua` | Tuna, light, canned in water, drained | 86 · 19.4 · 0 · 1 | FDC 173709 |
| `lechuga` | Lettuce, green leaf | 15 · 1.4 · 2.9 · 0.2 | FDC 169249 |
| `salmon` | Salmon, Atlantic, farmed, cooked | 206 · 22.1 · 0 · 12.4 | FDC 175168 |
| `papa_cocida` | Potato, boiled, no skin | 86 · 1.7 · 20 · 0.1 | FDC 170440 |
| `pan_integral` | Whole-wheat bread | 252 · 12.4 · 42.7 · 3.5 | FDC 172688 |
| `mantequilla_mani` | Peanut butter, smooth | 598 · 22.2 · 22.3 · 51.4 | FDC 172470 |
| `quinoa` | Quinoa, cooked | 120 · 4.4 · 21.3 · 1.9 | FDC 168917 |
| `lentejas` | Lentils, cooked | 116 · 9 · 20.1 · 0.4 | FDC 172421 |
| `pasta` | Pasta, cooked | 158 · 5.8 · 30.9 · 0.9 | FDC 169737 |
| `aceite_oliva` | Olive oil | 884 · 0 · 0 · 100 | FDC 171413 |
| `pizza_queso` | Cheese pizza, regular crust | 268 · 10.4 · 29 · 12.3 | FDC 170317 |
| `cerveza` | Beer, regular | 43 · 0.5 · 3.6 · 0 | FDC 168746 |
| `vino_tinto` | Red wine | 85 · 0.1 · 2.6 · 0 | FDC 173190 |
| `chocolate_70` | Dark chocolate 70–85 % | 598 · 7.8 · 45.9 · 42.6 | FDC 170273 |
| `sancocho` | Sancocho de pollo — one 550 g bowl: chicken thigh 100, yuca 100, potato 80, green plantain 60, corn 60, broth 150 | 100.7 · 5.5 · 15.3 · 2 | recipe: `pollo_muslo`, `yuca`, `papa_cocida`, `platano_verde_cocido`, `mazorca`, `agua` |
| `ajiaco` | Ajiaco santafereño (without cream) — one 550 g bowl: chicken breast 90, potatoes 200, corn 60, broth 200 | 68.8 · 6.1 · 9.6 · 0.8 | recipe: `pollo_plancha`, `papa_cocida`, `mazorca`, `agua` |
| `arroz_con_pollo` | Arroz con pollo — one 350 g plate: rice 200, chicken thigh 100, oil 7, tomato and onion 43 | 151 · 8.8 · 16.9 · 5 | recipe: `arroz_blanco`, `pollo_muslo`, `aceite_oliva`, `tomate`, `cebolla` |
| `hogao` | Hogao — tomato 75, onion 20, oil 5 | 65.7 · 0.9 · 4.8 · 5.2 | recipe: `tomate`, `cebolla`, `aceite_oliva` |
| `bunuelo` | Buñuelo — queso fresco 40, cassava starch 30, cornstarch 10, egg 10, frying oil absorbed 10 (≈100 g fried) | 369 · 8.6 · 37 · 20.6 | recipe: `queso_fresco`, `tapioca`, `maicena`, `huevo_cocido`, `aceite_oliva` |
| `jugo_lulo` | Jugo de lulo en agua — 300 ml: lulo pulp 100, sugar 25, water 175 | 40.6 · 0.2 · 10.3 · 0.1 | recipe: `lulo_pulpa`, `azucar`, `agua` |
| `agua_panela` | Agua de panela — 250 ml: panela 25, water 225 | 38 · 0 · 9.8 · 0 | recipe: `panela_bloque`, `agua` |
| `cafe_con_leche` | Café con leche — coffee 50, whole milk 50 | 31 · 1.6 · 2.4 · 1.6 | recipe: `cafe_negro`, `leche_entera` |
| `ensalada` | Green salad, no dressing — lettuce 60, tomato 40 | 16.2 · 1.2 · 3.3 · 0.2 | recipe: `lechuga`, `tomate` |

**Portions.** A fixture that STATES an amount ("a 550 g bowl", "150 g of
patacones") is scored against exactly that amount. A fixture that does not
("a bowl of sancocho", "two tajadas") uses a typical serving written into the
fixture: a restaurant bowl of soup 550 g, one tajada 45 g, one patacón 45 g,
one empanada 65 g, one arepa 80 g (a small one 50 g), a pandebono 56 g and an
almojábana 45 g (their labels' serving sizes), a glass of juice 300 ml. Those
typical servings are assumptions, not measurements; the stated-amount
fixtures exist so that accuracy can be judged without them.

**Bands.** kcal −25 % / +30 % of the reference; each macro −40 % / +50 % with a
4 g floor. Composite dishes with an unstated portion (bandeja paisa,
sancocho, ajiaco, arroz con pollo) use −30 % / +35 % and −50 % / +60 %.
