// Reference nutrients for the food eval — every row CITED (2026-10-20, after
// review of d3f537a: "No reference cites a source", and three Colombian
// portions were set so small they manufactured the +19 % bias). Values are
// per 100 g (per 100 ml for drinks): [kcal, proteinG, carbsG, fatG].
//
// Sources, looked up through the FoodData Central API (api.nal.usda.gov/fdc):
//   fdc       a USDA FoodData Central entry — SR Legacy, FNDDS (Survey) or Foundation
//   branded   a FoodData Central Branded Foods entry (the product's own label);
//             used where USDA has no generic entry (Colombian cheese breads) or
//             the generic one is unlike what is sold (whey isolate)
//   recipe    a dish USDA does not list, built from cited components at
//             stated grams; `yield` is the cooked weight the grams make
//
// Nothing here comes from Michael's logs. tests/food-eval/reference.md is
// generated from this module by scripts/food-eval.mjs.

const RAW = {
  // ── Colombian ─────────────────────────────────────────────────────────
  arepa: { name: "Arepa de maíz (Latino restaurant arepa)", fdc: 168070, per100: [219, 5.48, 37.1, 5.38] },
  queso_fresco: { name: "Queso fresco / campesino", fdc: 172223, per100: [299, 18.1, 2.98, 23.8] },
  huevo: { name: "Egg, scrambled (no added fat in the SR entry beyond its own)", fdc: 172187, per100: [149, 9.99, 1.61, 11] },
  huevo_cocido: { name: "Egg, hard-boiled", fdc: 173424, per100: [155, 12.6, 1.12, 10.6] },
  huevo_frito: { name: "Egg, fried", fdc: 173423, per100: [196, 13.6, 0.83, 14.8] },
  arroz_blanco: { name: "White rice, cooked", fdc: 168878, per100: [130, 2.69, 28.2, 0.28] },
  frijoles: { name: "Red kidney beans, cooked (plain — Colombian frijoles add pork or plantain, so this is a floor)", fdc: 175194, per100: [127, 8.67, 22.8, 0.5] },
  carne_molida: { name: "Ground beef 85 %, pan-browned", fdc: 174034, per100: [256, 27.7, 0, 15.3] },
  chicharron: { name: "Pork cracklings (chicharrón)", fdc: 2705895, per100: [569, 45.03, 0, 41.74] },
  chorizo: { name: "Pork chorizo, pan-fried", fdc: 746781, per100: [346, 19.3, 2.63, 28.1] },
  maduro_frito: { name: "Ripe plantain, fried (tajadas de maduro)", fdc: 168200, per100: [236, 1.42, 40.8, 7.51] },
  patacon: { name: "Green plantain, fried (patacón)", fdc: 168199, per100: [309, 1.5, 49.2, 11.8] },
  aguacate: { name: "Avocado", fdc: 171705, per100: [160, 2, 8.53, 14.7] },
  empanada: { name: "Empanada, beef (fried)", fdc: 2708711, per100: [333, 12.09, 27.45, 19.2] },
  pandebono: { name: "Pandebono (cheese bread)", branded: 2308976, per100: [321, 16.1, 23.2, 17.9] },
  almojabana: { name: "Almojábana (cheese bun)", branded: 2154112, per100: [298, 20, 24.4, 13.3] },
  crema_leche: { name: "Heavy cream", fdc: 170859, per100: [340, 2.84, 2.84, 36.1] },
  alcaparras: { name: "Capers, canned", fdc: 172238, per100: [23, 2.36, 4.89, 0.86] },
  cafe_negro: { name: "Coffee, brewed", fdc: 171890, per100: [1, 0.12, 0, 0.02] },

  // components used only inside recipes below
  pollo_muslo: { name: "Chicken thigh, meat only, stewed", fdc: 172389, per100: [195, 25, 0, 9.79] },
  yuca: { name: "Cassava (boiled ≈ raw per gram; the SR raw entry)", fdc: 169985, per100: [160, 1.36, 38.1, 0.28] },
  platano_verde_cocido: { name: "Green plantain, boiled", fdc: 168216, per100: [121, 1.09, 29.2, 0.08] },
  mazorca: { name: "Sweet corn, boiled", fdc: 169999, per100: [96, 3.41, 21, 1.5] },
  tomate: { name: "Tomato, raw", fdc: 170457, per100: [18, 0.88, 3.89, 0.2] },
  cebolla: { name: "Onion, raw", fdc: 170000, per100: [40, 1.1, 9.34, 0.1] },
  tapioca: { name: "Tapioca / cassava starch", fdc: 169717, per100: [358, 0.19, 88.7, 0.02] },
  maicena: { name: "Cornstarch", fdc: 169698, per100: [381, 0.26, 91.3, 0.05] },
  azucar: { name: "Sugar, granulated", fdc: 169655, per100: [387, 0, 100, 0] },
  panela_bloque: { name: "Panela (brown sugar entry as the closest USDA match)", fdc: 168833, per100: [380, 0.12, 98.1, 0] },
  lulo_pulpa: { name: "Naranjilla (lulo) pulp, unsweetened", fdc: 167790, per100: [25, 0.44, 5.9, 0.22] },
  agua: { name: "Water / broth", fdc: null, per100: [0, 0, 0, 0] },

  // ── Gym / everyday ────────────────────────────────────────────────────
  whey: { name: "Whey protein isolate (Dymatize ISO100 label)", branded: 2452284, per100: [375, 78.1, 6.25, 1.56] },
  leche_entera: { name: "Whole milk", fdc: 171265, per100: [61, 3.15, 4.8, 3.25] },
  avena_seca: { name: "Oats, dry", fdc: 173904, per100: [379, 13.2, 67.7, 6.52] },
  banano: { name: "Banana", fdc: 173944, per100: [89, 1.09, 22.8, 0.33] },
  manzana: { name: "Apple, with skin", fdc: 171688, per100: [52, 0.26, 13.8, 0.17] },
  pollo_plancha: { name: "Chicken breast, meat only, roasted", fdc: 171477, per100: [165, 31, 0, 3.57] },
  yogur_griego: { name: "Greek yogurt, plain, lowfat", fdc: 170903, per100: [73, 9.95, 3.94, 1.92] },
  almendras: { name: "Almonds", fdc: 170567, per100: [579, 21.2, 21.6, 49.9] },
  atun_agua: { name: "Tuna, light, canned in water, drained", fdc: 173709, per100: [86, 19.4, 0, 0.96] },
  lechuga: { name: "Lettuce, green leaf", fdc: 169249, per100: [15, 1.36, 2.87, 0.15] },
  salmon: { name: "Salmon, Atlantic, farmed, cooked", fdc: 175168, per100: [206, 22.1, 0, 12.4] },
  papa_cocida: { name: "Potato, boiled, no skin", fdc: 170440, per100: [86, 1.71, 20, 0.1] },
  pan_integral: { name: "Whole-wheat bread", fdc: 172688, per100: [252, 12.4, 42.7, 3.5] },
  mantequilla_mani: { name: "Peanut butter, smooth", fdc: 172470, per100: [598, 22.2, 22.3, 51.4] },
  quinoa: { name: "Quinoa, cooked", fdc: 168917, per100: [120, 4.4, 21.3, 1.92] },
  lentejas: { name: "Lentils, cooked", fdc: 172421, per100: [116, 9.02, 20.1, 0.38] },
  pasta: { name: "Pasta, cooked", fdc: 169737, per100: [158, 5.8, 30.9, 0.93] },
  aceite_oliva: { name: "Olive oil", fdc: 171413, per100: [884, 0, 0, 100] },
  pizza_queso: { name: "Cheese pizza, regular crust", fdc: 170317, per100: [268, 10.4, 29, 12.3] },
  cerveza: { name: "Beer, regular", fdc: 168746, per100: [43, 0.46, 3.55, 0] },
  vino_tinto: { name: "Red wine", fdc: 173190, per100: [85, 0.07, 2.61, 0] },
  chocolate_70: { name: "Dark chocolate 70–85 %", fdc: 170273, per100: [598, 7.79, 45.9, 42.6] },
};

/**
 * Dishes USDA does not list, as stated recipes of cited components.
 * `grams` is one stated batch; `yield` is what it weighs as served.
 */
const RECIPES = {
  sancocho: {
    name: "Sancocho de pollo — one 550 g bowl: chicken thigh 100, yuca 100, potato 80, green plantain 60, corn 60, broth 150",
    grams: [["pollo_muslo", 100], ["yuca", 100], ["papa_cocida", 80], ["platano_verde_cocido", 60], ["mazorca", 60], ["agua", 150]],
    yield: 550,
  },
  ajiaco: {
    name: "Ajiaco santafereño (without cream) — one 550 g bowl: chicken breast 90, potatoes 200, corn 60, broth 200",
    grams: [["pollo_plancha", 90], ["papa_cocida", 200], ["mazorca", 60], ["agua", 200]],
    yield: 550,
  },
  arroz_con_pollo: {
    name: "Arroz con pollo — one 350 g plate: rice 200, chicken thigh 100, oil 7, tomato and onion 43",
    grams: [["arroz_blanco", 200], ["pollo_muslo", 100], ["aceite_oliva", 7], ["tomate", 25], ["cebolla", 18]],
    yield: 350,
  },
  hogao: {
    name: "Hogao — tomato 75, onion 20, oil 5",
    grams: [["tomate", 75], ["cebolla", 20], ["aceite_oliva", 5]],
    yield: 100,
  },
  bunuelo: {
    name: "Buñuelo — queso fresco 40, cassava starch 30, cornstarch 10, egg 10, frying oil absorbed 10 (≈100 g fried)",
    grams: [["queso_fresco", 40], ["tapioca", 30], ["maicena", 10], ["huevo_cocido", 10], ["aceite_oliva", 10]],
    yield: 100,
  },
  jugo_lulo: {
    name: "Jugo de lulo en agua — 300 ml: lulo pulp 100, sugar 25, water 175",
    grams: [["lulo_pulpa", 100], ["azucar", 25], ["agua", 175]],
    yield: 300,
  },
  agua_panela: {
    name: "Agua de panela — 250 ml: panela 25, water 225",
    grams: [["panela_bloque", 25], ["agua", 225]],
    yield: 250,
  },
  cafe_con_leche: {
    name: "Café con leche — coffee 50, whole milk 50",
    grams: [["cafe_negro", 50], ["leche_entera", 50]],
    yield: 100,
  },
  ensalada: {
    name: "Green salad, no dressing — lettuce 60, tomato 40",
    grams: [["lechuga", 60], ["tomate", 40]],
    yield: 100,
  },
};

function fromRecipe(r) {
  const t = [0, 0, 0, 0];
  for (const [key, g] of r.grams) {
    const f = RAW[key];
    if (!f) throw new Error(`recipe uses unknown food "${key}"`);
    for (let i = 0; i < 4; i++) t[i] += (f.per100[i] * g) / 100;
  }
  const scale = 100 / r.yield;
  return t.map((v) => Math.round(v * scale * 100) / 100);
}

export const FOODS = {
  ...RAW,
  ...Object.fromEntries(Object.entries(RECIPES).map(([key, r]) => [key, { name: r.name, recipe: r.grams.map(([k]) => k), per100: fromRecipe(r) }])),
};

/** Nutrients of `grams` of a food. */
export function nutrients(key, grams) {
  const food = FOODS[key];
  if (!food) throw new Error(`unknown food "${key}"`);
  const [kcal, p, c, f] = food.per100;
  const g = grams / 100;
  return { kcal: kcal * g, proteinG: p * g, carbsG: c * g, fatG: f * g };
}

/** Sum of several [key, grams] parts. */
export function pointFor(parts) {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const [key, grams] of parts) {
    const n = nutrients(key, grams);
    t.kcal += n.kcal;
    t.proteinG += n.proteinG;
    t.carbsG += n.carbsG;
    t.fatG += n.fatG;
  }
  return t;
}

/**
 * Acceptance band around a reference point. Portions in speech are
 * approximate ("a cup", "a plate") and two honest references for the same
 * dish differ by 15–20 %, so the band is wide on purpose: kcal −25 % / +30 %;
 * macros −40 % / +50 % with a 4 g floor. Composite dishes with an UNSTATED
 * portion pass their own, wider factors.
 */
export function band(point, opts = {}) {
  const { kcalLo = 0.75, kcalHi = 1.3, macroLo = 0.6, macroHi = 1.5, macroPad = 4 } = opts;
  const macro = (v) => [
    Math.max(0, Math.min(v * macroLo, v - macroPad)),
    Math.max(v * macroHi, v + macroPad),
  ];
  return {
    kcal: [point.kcal * kcalLo, point.kcal * kcalHi],
    proteinG: macro(point.proteinG),
    carbsG: macro(point.carbsG),
    fatG: macro(point.fatG),
    point: {
      kcal: Math.round(point.kcal),
      proteinG: Math.round(point.proteinG),
      carbsG: Math.round(point.carbsG),
      fatG: Math.round(point.fatG),
    },
  };
}

function sourceCell(f) {
  if (f.recipe) return `recipe: ${f.recipe.map((k) => `\`${k}\``).join(", ")}`;
  if (f.branded) return `FDC Branded ${f.branded}`;
  if (f.fdc) return `FDC ${f.fdc}`;
  return "—";
}

/** Markdown for reference.md — written by the harness so the doc never drifts. */
export function referenceMarkdown() {
  const rows = Object.entries(FOODS)
    .map(([key, f]) => `| \`${key}\` | ${f.name} | ${f.per100.map((v) => Math.round(v * 10) / 10).join(" · ")} | ${sourceCell(f)} |`)
    .join("\n");
  return `# Food eval — reference nutrients

Per 100 g (per 100 ml for drinks): kcal · protein g · carbs g · fat g. Every
row cites its source: a USDA FoodData Central id (SR Legacy, FNDDS or
Foundation), a FoodData Central Branded Foods id (the product's own label —
used for the Colombian cheese breads, which USDA does not list generically,
and for whey isolate, where the generic entry is unlike what is sold), or a
stated recipe of cited components (sancocho, ajiaco, arroz con pollo,
buñuelo, hogao, the drinks). Ids can be opened at
\`https://fdc.nal.usda.gov/food-details/<id>/nutrients\`. Nothing here is from
Michael's logs. Generated from \`tests/food-eval/foods.mjs\` by
\`scripts/food-eval.mjs\`; edit the module, not this file.

| key | food | per 100 g | source |
|---|---|---|---|
${rows}

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
`;
}
