// Reference nutrients for the food eval — PUBLIC per-100 g values of the
// kind found in USDA FoodData Central and Colombian food-composition tables,
// rounded to the precision those tables carry. Nothing here comes from
// Michael's own logs; the fixtures in fixtures.mjs combine these foods at
// stated portions, and the harness widens the result into an acceptance
// band (see band()). The table is the single source: the harness writes
// tests/food-eval/reference.md from it on every run.
//
// Shape: [kcal, proteinG, carbsG, fatG] per 100 g (or per 100 ml for drinks).

export const FOODS = {
  // ── Colombian staples ─────────────────────────────────────────────
  arepa: { name: "Arepa de maíz blanca, asada (plain)", per100: [219, 4.3, 46, 2.1] },
  queso_fresco: { name: "Queso fresco / campesino", per100: [290, 18, 3, 23] },
  huevo: { name: "Huevo entero, cocido o revuelto sin grasa", per100: [155, 13, 1.1, 11] },
  arroz_blanco: { name: "Arroz blanco cocido", per100: [130, 2.7, 28, 0.3] },
  frijoles: { name: "Frijoles rojos cocidos con hogao", per100: [140, 8, 22, 2.5] },
  carne_molida: { name: "Carne molida 85 %, cocida", per100: [250, 26, 0, 15] },
  chicharron: { name: "Chicharrón de cerdo", per100: [520, 32, 0, 43] },
  chorizo: { name: "Chorizo cocido", per100: [455, 24, 2, 38] },
  maduro_frito: { name: "Plátano maduro frito (tajadas)", per100: [215, 1.4, 33, 9] },
  patacon: { name: "Patacón (plátano verde frito)", per100: [250, 1.5, 38, 11] },
  aguacate: { name: "Aguacate", per100: [160, 2, 8.5, 14.7] },
  hogao: { name: "Hogao (tomate y cebolla sofritos)", per100: [60, 1, 7, 3.5] },
  sancocho: { name: "Sancocho de pollo (sopa con tubérculos)", per100: [85, 5, 10, 2.5] },
  ajiaco: { name: "Ajiaco santafereño", per100: [90, 5, 11, 3] },
  arroz_con_pollo: { name: "Arroz con pollo", per100: [150, 9, 18, 4.5] },
  empanada: { name: "Empanada colombiana de carne, frita", per100: [290, 8, 30, 15] },
  pandebono: { name: "Pandebono", per100: [320, 9, 42, 13] },
  bunuelo: { name: "Buñuelo", per100: [350, 10, 30, 21] },
  almojabana: { name: "Almojábana", per100: [300, 10, 38, 12] },
  jugo_lulo: { name: "Jugo de lulo en agua, endulzado", per100: [50, 0.3, 12, 0.1] },
  agua_panela: { name: "Agua de panela", per100: [40, 0, 10, 0] },
  cafe_negro: { name: "Café negro sin azúcar", per100: [2, 0.1, 0, 0] },
  cafe_con_leche: { name: "Café con leche entera (50/50)", per100: [30, 1.6, 2.4, 1.6] },
  crema_leche: { name: "Crema de leche", per100: [340, 2, 3, 36] },

  // ── Gym / everyday ────────────────────────────────────────────────
  whey: { name: "Whey protein powder", per100: [400, 80, 8, 5] },
  leche_entera: { name: "Leche entera", per100: [61, 3.2, 4.8, 3.3] },
  avena_seca: { name: "Avena en hojuelas, seca", per100: [379, 13, 68, 6.5] },
  banano: { name: "Banano", per100: [89, 1.1, 23, 0.3] },
  manzana: { name: "Manzana", per100: [52, 0.3, 14, 0.2] },
  pollo_plancha: { name: "Pechuga de pollo a la plancha, sin piel", per100: [165, 31, 0, 3.6] },
  yogur_griego: { name: "Yogur griego natural 2 %", per100: [73, 10, 4, 2] },
  almendras: { name: "Almendras", per100: [579, 21, 22, 50] },
  atun_agua: { name: "Atún en agua, escurrido", per100: [116, 26, 0, 1] },
  ensalada: { name: "Ensalada verde con tomate, sin aderezo", per100: [20, 1.3, 4, 0.2] },
  salmon: { name: "Salmón a la plancha", per100: [206, 22, 0, 12] },
  papa_cocida: { name: "Papa cocida", per100: [87, 1.9, 20, 0.1] },
  pan_integral: { name: "Pan integral tajado", per100: [247, 13, 41, 3.4] },
  mantequilla_mani: { name: "Mantequilla de maní", per100: [588, 25, 20, 50] },
  quinoa: { name: "Quinoa cocida", per100: [120, 4.4, 21, 1.9] },
  lentejas: { name: "Lentejas cocidas", per100: [116, 9, 20, 0.4] },
  pasta: { name: "Pasta cocida", per100: [158, 5.8, 31, 0.9] },
  aceite_oliva: { name: "Aceite de oliva", per100: [884, 0, 0, 100] },
  pizza_queso: { name: "Pizza de queso (porción)", per100: [266, 11, 33, 10] },
  cerveza: { name: "Cerveza 5 %", per100: [43, 0.5, 3.6, 0] },
  vino_tinto: { name: "Vino tinto", per100: [85, 0.1, 2.6, 0] },
  chocolate_70: { name: "Chocolate negro 70 %", per100: [598, 7.8, 46, 43] },
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
 * dish differ by 15–20 %, so the band is wide on purpose: kcal −25 % / +30 %
 * (models round up more often than down); macros −40 % / +50 % with a 4 g
 * floor so a 1 g fat figure is not failed by a 2 g estimate. Composite dishes
 * pass their own, wider factors.
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

/** Markdown for reference.md — written by the harness so the doc never drifts. */
export function referenceMarkdown() {
  const rows = Object.entries(FOODS)
    .map(([key, f]) => `| \`${key}\` | ${f.name} | ${f.per100.join(" · ")} |`)
    .join("\n");
  return `# Food eval — reference nutrients

Per 100 g (per 100 ml for drinks): kcal · protein g · carbs g · fat g. Public,
typical values of the kind in USDA FoodData Central and Colombian
food-composition tables, rounded as those tables round. Nothing here is from
Michael's logs. Generated from \`tests/food-eval/foods.mjs\` by
\`scripts/food-eval.mjs\`; edit the module, not this file.

| key | food | per 100 g |
|---|---|---|
${rows}

Bands: kcal −25 % / +30 % of the portion's reference; each macro −40 % / +50 %
with a 4 g floor. Composite dishes (bandeja paisa, sancocho, ajiaco, arroz con
pollo) use −30 % / +35 % on kcal and −50 % / +60 % on macros because two
honest recipes differ that much.
`;
}
