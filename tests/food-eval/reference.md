# Food eval — reference nutrients

Per 100 g (per 100 ml for drinks): kcal · protein g · carbs g · fat g. Public,
typical values of the kind in USDA FoodData Central and Colombian
food-composition tables, rounded as those tables round. Nothing here is from
Michael's logs. Generated from `tests/food-eval/foods.mjs` by
`scripts/food-eval.mjs`; edit the module, not this file.

| key | food | per 100 g |
|---|---|---|
| `arepa` | Arepa de maíz blanca, asada (plain) | 219 · 4.3 · 46 · 2.1 |
| `queso_fresco` | Queso fresco / campesino | 290 · 18 · 3 · 23 |
| `huevo` | Huevo entero, cocido o revuelto sin grasa | 155 · 13 · 1.1 · 11 |
| `arroz_blanco` | Arroz blanco cocido | 130 · 2.7 · 28 · 0.3 |
| `frijoles` | Frijoles rojos cocidos con hogao | 140 · 8 · 22 · 2.5 |
| `carne_molida` | Carne molida 85 %, cocida | 250 · 26 · 0 · 15 |
| `chicharron` | Chicharrón de cerdo | 520 · 32 · 0 · 43 |
| `chorizo` | Chorizo cocido | 455 · 24 · 2 · 38 |
| `maduro_frito` | Plátano maduro frito (tajadas) | 215 · 1.4 · 33 · 9 |
| `patacon` | Patacón (plátano verde frito) | 250 · 1.5 · 38 · 11 |
| `aguacate` | Aguacate | 160 · 2 · 8.5 · 14.7 |
| `hogao` | Hogao (tomate y cebolla sofritos) | 60 · 1 · 7 · 3.5 |
| `sancocho` | Sancocho de pollo (sopa con tubérculos) | 85 · 5 · 10 · 2.5 |
| `ajiaco` | Ajiaco santafereño | 90 · 5 · 11 · 3 |
| `arroz_con_pollo` | Arroz con pollo | 150 · 9 · 18 · 4.5 |
| `empanada` | Empanada colombiana de carne, frita | 290 · 8 · 30 · 15 |
| `pandebono` | Pandebono | 320 · 9 · 42 · 13 |
| `bunuelo` | Buñuelo | 350 · 10 · 30 · 21 |
| `almojabana` | Almojábana | 300 · 10 · 38 · 12 |
| `jugo_lulo` | Jugo de lulo en agua, endulzado | 50 · 0.3 · 12 · 0.1 |
| `agua_panela` | Agua de panela | 40 · 0 · 10 · 0 |
| `cafe_negro` | Café negro sin azúcar | 2 · 0.1 · 0 · 0 |
| `cafe_con_leche` | Café con leche entera (50/50) | 30 · 1.6 · 2.4 · 1.6 |
| `crema_leche` | Crema de leche | 340 · 2 · 3 · 36 |
| `whey` | Whey protein powder | 400 · 80 · 8 · 5 |
| `leche_entera` | Leche entera | 61 · 3.2 · 4.8 · 3.3 |
| `avena_seca` | Avena en hojuelas, seca | 379 · 13 · 68 · 6.5 |
| `banano` | Banano | 89 · 1.1 · 23 · 0.3 |
| `manzana` | Manzana | 52 · 0.3 · 14 · 0.2 |
| `pollo_plancha` | Pechuga de pollo a la plancha, sin piel | 165 · 31 · 0 · 3.6 |
| `yogur_griego` | Yogur griego natural 2 % | 73 · 10 · 4 · 2 |
| `almendras` | Almendras | 579 · 21 · 22 · 50 |
| `atun_agua` | Atún en agua, escurrido | 116 · 26 · 0 · 1 |
| `ensalada` | Ensalada verde con tomate, sin aderezo | 20 · 1.3 · 4 · 0.2 |
| `salmon` | Salmón a la plancha | 206 · 22 · 0 · 12 |
| `papa_cocida` | Papa cocida | 87 · 1.9 · 20 · 0.1 |
| `pan_integral` | Pan integral tajado | 247 · 13 · 41 · 3.4 |
| `mantequilla_mani` | Mantequilla de maní | 588 · 25 · 20 · 50 |
| `quinoa` | Quinoa cocida | 120 · 4.4 · 21 · 1.9 |
| `lentejas` | Lentejas cocidas | 116 · 9 · 20 · 0.4 |
| `pasta` | Pasta cocida | 158 · 5.8 · 31 · 0.9 |
| `aceite_oliva` | Aceite de oliva | 884 · 0 · 0 · 100 |
| `pizza_queso` | Pizza de queso (porción) | 266 · 11 · 33 · 10 |
| `cerveza` | Cerveza 5 % | 43 · 0.5 · 3.6 · 0 |
| `vino_tinto` | Vino tinto | 85 · 0.1 · 2.6 · 0 |
| `chocolate_70` | Chocolate negro 70 % | 598 · 7.8 · 46 · 43 |

Bands: kcal −25 % / +30 % of the portion's reference; each macro −40 % / +50 %
with a 4 g floor. Composite dishes (bandeja paisa, sancocho, ajiaco, arroz con
pollo) use −30 % / +35 % on kcal and −50 % / +60 % on macros because two
honest recipes differ that much.
