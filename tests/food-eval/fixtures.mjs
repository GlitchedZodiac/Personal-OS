// SYNTHETIC utterances for the food eval. They mirror the SHAPE of how he
// logs — Colombian staples, gym food, quantities, EN/ES mixing, dictated
// transcripts with fillers — without copying any row of his history. Every
// fixture carries a reference built from foods.mjs at the stated portion
// (or an explicit band for a composite dish) and the expectations the
// harness scores: item count, meal type, time, usual match.
//
// Fields:
//   id, group, text
//   parts: [[foodKey, grams], …]      reference from foods.mjs
//   bandOpts?                          wider factors for composites
//   items: n | [lo, hi]                expected item count on the card
//   mealType?: string | string[]       expected; else the clock rule applies
//   time?: { day: 0|-1, hour }         expected local (Bogotá) loggedAt
//   consistency?: true                 in the ×3 consistency subset
//   twinOf?: id                        same food + portion, different phrasing
//                                      (a dictated transcript, or a paraphrase) —
//                                      the PRIMARY consistency metric
//   usual?: true | false               the seeded usual should (not) match

const COMPOSITE = { kcalLo: 0.7, kcalHi: 1.35, macroLo: 0.5, macroHi: 1.6, macroPad: 6 };

const BANDEJA = [
  ["frijoles", 200], ["arroz_blanco", 150], ["carne_molida", 100], ["chicharron", 60],
  ["huevo", 50], ["maduro_frito", 60], ["aguacate", 60], ["arepa", 50], ["chorizo", 50],
];

const USUAL_REF = { kcal: [232, 403], proteinG: [19, 48], carbsG: [17, 42], fatG: [2, 10], point: { kcal: 310, proteinG: 32, carbsG: 28, fatG: 6 } };

export const FIXTURES = [
  // ── A · Colombian staples ─────────────────────────────────────────
  { id: "A01", group: "colombian", text: "Arepa con queso for breakfast, just one arepa", parts: [["arepa", 80], ["queso_fresco", 30]], items: [1, 2], mealType: "breakfast", consistency: true },
  { id: "A02", group: "colombian", text: "I had a bandeja paisa for lunch", parts: BANDEJA, bandOpts: COMPOSITE, items: [1, 9], mealType: "lunch", consistency: true },
  { id: "A03", group: "colombian", text: "A bowl of sancocho de pollo", parts: [["sancocho", 450]], bandOpts: COMPOSITE, items: [1, 3], consistency: true },
  { id: "A04", group: "colombian", text: "Two beef empanadas with ají", parts: [["empanada", 130]], items: [1, 2], consistency: true },
  { id: "A05", group: "colombian", text: "A pandebono and a café con leche", parts: [["pandebono", 55], ["cafe_con_leche", 240]], items: 2 },
  { id: "A06", group: "colombian", text: "Three patacones with hogao", parts: [["patacon", 135], ["hogao", 40]], items: [1, 2], consistency: true },
  { id: "A07", group: "colombian", text: "Ajiaco, a full bowl, with the cream and capers", parts: [["ajiaco", 450], ["crema_leche", 15]], bandOpts: COMPOSITE, items: [1, 3] },
  { id: "A08", group: "colombian", text: "A buñuelo and an almojábana with agua de panela", parts: [["bunuelo", 50], ["almojabana", 60], ["agua_panela", 250]], items: 3 },
  { id: "A09", group: "colombian", text: "Arroz con pollo, a regular plate", parts: [["arroz_con_pollo", 350]], bandOpts: COMPOSITE, items: [1, 2], consistency: true },
  { id: "A10", group: "colombian", text: "A glass of jugo de lulo en agua", parts: [["jugo_lulo", 300]], items: 1 },
  { id: "A11", group: "colombian", text: "100 g of chicharrón with a small arepa", parts: [["chicharron", 100], ["arepa", 50]], items: 2 },
  { id: "A12", group: "colombian", text: "Two tajadas de maduro", parts: [["maduro_frito", 60]], items: 1 },
  { id: "A13", group: "colombian", text: "Frijoles con arroz, a normal plate, with a bit of hogao", parts: [["frijoles", 200], ["arroz_blanco", 150], ["hogao", 40]], items: [1, 3], consistency: true },
  { id: "A14", group: "colombian", text: "Calentao for breakfast: rice, beans and a fried egg", parts: [["arroz_blanco", 120], ["frijoles", 100], ["huevo", 50]], items: [1, 3], mealType: "breakfast" },

  // ── B · Gym food ──────────────────────────────────────────────────
  { id: "B01", group: "gym", text: "Protein shake: one scoop of whey with 250 ml of whole milk", parts: [["whey", 30], ["leche_entera", 250]], items: [1, 2], consistency: true },
  { id: "B02", group: "gym", text: "Two scoops of whey in water", parts: [["whey", 60]], items: 1 },
  { id: "B03", group: "gym", text: "200 g grilled chicken breast with a cup of white rice", parts: [["pollo_plancha", 200], ["arroz_blanco", 160]], items: 2, consistency: true },
  { id: "B04", group: "gym", text: "Oatmeal: 40 g of oats cooked in water with a banana", parts: [["avena_seca", 40], ["banano", 118]], items: [1, 2], consistency: true },
  { id: "B05", group: "gym", text: "170 g of plain Greek yogurt with 30 g of almonds", parts: [["yogur_griego", 170], ["almendras", 30]], items: 2, consistency: true },
  { id: "B06", group: "gym", text: "A can of tuna in water with a green salad, no dressing", parts: [["atun_agua", 120], ["ensalada", 100]], items: 2 },
  { id: "B07", group: "gym", text: "Four scrambled eggs", parts: [["huevo", 200]], items: 1 },
  { id: "B08", group: "gym", text: "150 g of grilled salmon with 200 g of boiled potatoes", parts: [["salmon", 150], ["papa_cocida", 200]], items: 2, consistency: true },
  { id: "B09", group: "gym", text: "Three slices of whole wheat bread with two tablespoons of peanut butter", parts: [["pan_integral", 90], ["mantequilla_mani", 32]], items: 2 },
  { id: "B10", group: "gym", text: "200 g cooked quinoa with 150 g chicken breast", parts: [["quinoa", 200], ["pollo_plancha", 150]], items: 2 },
  { id: "B11", group: "gym", text: "250 g of cooked lentils", parts: [["lentejas", 250]], items: 1 },
  { id: "B12", group: "gym", text: "300 g of cooked pasta with a tablespoon of olive oil", parts: [["pasta", 300], ["aceite_oliva", 14]], items: [1, 2] },

  // ── C · Quantities and portions ───────────────────────────────────
  { id: "C01", group: "quantities", text: "Half an arepa with cheese", parts: [["arepa", 40], ["queso_fresco", 15]], items: [1, 2], consistency: true },
  { id: "C02", group: "quantities", text: "Three boiled eggs", parts: [["huevo", 150]], items: 1 },
  { id: "C03", group: "quantities", text: "A cup and a half of white rice", parts: [["arroz_blanco", 240]], items: 1, consistency: true },
  { id: "C04", group: "quantities", text: "250 ml of whole milk", parts: [["leche_entera", 250]], items: 1 },
  { id: "C05", group: "quantities", text: "A handful of almonds, about 30 g", parts: [["almendras", 30]], items: 1 },
  { id: "C06", group: "quantities", text: "Two tablespoons of peanut butter", parts: [["mantequilla_mani", 32]], items: 1 },
  { id: "C07", group: "quantities", text: "One and a half scoops of whey in water", parts: [["whey", 45]], items: 1 },
  { id: "C08", group: "quantities", text: "A small banana", parts: [["banano", 100]], items: 1 },
  { id: "C09", group: "quantities", text: "A large apple", parts: [["manzana", 220]], items: 1 },
  { id: "C10", group: "quantities", text: "A 330 ml beer", parts: [["cerveza", 330]], items: 1 },

  // ── D · Mixed meals ───────────────────────────────────────────────
  { id: "D01", group: "mixed", text: "Breakfast: two eggs, an arepa and a black coffee", parts: [["huevo", 100], ["arepa", 80], ["cafe_negro", 240]], items: 3, mealType: "breakfast", consistency: true },
  { id: "D02", group: "mixed", text: "Lunch was grilled chicken, rice, half an avocado and a salad", parts: [["pollo_plancha", 150], ["arroz_blanco", 160], ["aguacate", 70], ["ensalada", 100]], items: 4, mealType: "lunch", consistency: true },
  { id: "D03", group: "mixed", text: "Dinner: salmon, boiled potatoes and a glass of red wine", parts: [["salmon", 150], ["papa_cocida", 200], ["vino_tinto", 150]], items: 3, mealType: "dinner" },
  { id: "D04", group: "mixed", text: "Snack: Greek yogurt and a banana", parts: [["yogur_griego", 170], ["banano", 118]], items: 2, mealType: "snack" },
  { id: "D05", group: "mixed", text: "A coffee with milk and a pandebono", parts: [["cafe_con_leche", 240], ["pandebono", 55]], items: 2 },
  { id: "D06", group: "mixed", text: "Two slices of cheese pizza and a beer", parts: [["pizza_queso", 200], ["cerveza", 330]], items: 2, consistency: true },
  { id: "D07", group: "mixed", twinOf: "D01", text: "Eggs, arepa, coffee", parts: [["huevo", 100], ["arepa", 80], ["cafe_negro", 240]], items: 3 },
  { id: "D08", group: "mixed", twinOf: "D02", text: "Chicken, rice, avocado, salad", parts: [["pollo_plancha", 150], ["arroz_blanco", 160], ["aguacate", 70], ["ensalada", 100]], items: 4 },
  { id: "D09", group: "mixed", text: "Oats, banana and a scoop of whey all in one bowl", parts: [["avena_seca", 40], ["banano", 118], ["whey", 30]], items: [1, 3] },
  { id: "D10", group: "mixed", text: "A glass of red wine and 20 g of dark chocolate", parts: [["vino_tinto", 150], ["chocolate_70", 20]], items: 2 },

  // ── E · Temporal phrases (loggedAt + meal type) ───────────────────
  { id: "E01", group: "temporal", twinOf: "B03", text: "Yesterday for dinner I had 200 g of chicken breast with rice", parts: [["pollo_plancha", 200], ["arroz_blanco", 160]], items: 2, mealType: "dinner", time: { day: -1, hour: 20 }, consistency: true },
  { id: "E02", group: "temporal", text: "This morning I had oatmeal with a banana", parts: [["avena_seca", 40], ["banano", 118]], items: [1, 2], mealType: "breakfast", time: { day: 0, hour: 8 } },
  { id: "E03", group: "temporal", text: "At 7pm I ate two empanadas", parts: [["empanada", 130]], items: [1, 2], mealType: "dinner", time: { day: 0, hour: 19 } },
  { id: "E04", group: "temporal", text: "Anoche comí una bandeja paisa", parts: BANDEJA, bandOpts: COMPOSITE, items: [1, 9], mealType: "dinner", time: { day: -1, hour: 20 } },
  { id: "E05", group: "temporal", text: "Para el desayuno comí dos huevos y una arepa con queso", parts: [["huevo", 100], ["arepa", 80], ["queso_fresco", 30]], items: [2, 3], mealType: "breakfast" },
  { id: "E06", group: "temporal", text: "A las 2pm me comí un sancocho", parts: [["sancocho", 450]], bandOpts: COMPOSITE, items: [1, 3], mealType: ["lunch", "snack"], time: { day: 0, hour: 14 } },

  // ── F · Dictated-transcript twins (fillers, numbers as words, EN/ES, no punctuation)
  { id: "F01", group: "transcript", twinOf: "A01", text: "ok so for breakfast i had uh an arepa with cheese just one", parts: [["arepa", 80], ["queso_fresco", 30]], items: [1, 2], mealType: "breakfast" },
  { id: "F02", group: "transcript", twinOf: "D01", text: "dos huevos una arepa y un café negro para el desayuno", parts: [["huevo", 100], ["arepa", 80], ["cafe_negro", 240]], items: 3, mealType: "breakfast", consistency: true },
  { id: "F03", group: "transcript", twinOf: "B03", text: "two hundred grams of grilled chicken breast and like a cup of white rice", parts: [["pollo_plancha", 200], ["arroz_blanco", 160]], items: 2 },
  { id: "F04", group: "transcript", twinOf: "A06", text: "tres patacones con hogao", parts: [["patacon", 135], ["hogao", 40]], items: [1, 2] },
  { id: "F05", group: "transcript", twinOf: "B01", text: "um a protein shake one scoop of whey with uh two hundred and fifty mils of whole milk", parts: [["whey", 30], ["leche_entera", 250]], items: [1, 2], consistency: true },
  { id: "F06", group: "transcript", twinOf: "C03", text: "a cup and a half of rice white rice", parts: [["arroz_blanco", 240]], items: 1 },
  { id: "F07", group: "transcript", twinOf: "A04", text: "me comí dos empanadas de carne con ají", parts: [["empanada", 130]], items: [1, 2] },
  { id: "F08", group: "transcript", twinOf: "B07", text: "four scrambled eggs that's it", parts: [["huevo", 200]], items: 1 },
  { id: "F09", group: "transcript", twinOf: "D02", text: "lunch was uh grilled chicken rice half an avocado and a salad", parts: [["pollo_plancha", 150], ["arroz_blanco", 160], ["aguacate", 70], ["ensalada", 100]], items: 4, mealType: "lunch" },
  { id: "F10", group: "transcript", twinOf: "A02", text: "bandeja paisa for lunch the whole thing", parts: BANDEJA, bandOpts: COMPOSITE, items: [1, 9], mealType: "lunch" },
  { id: "F11", group: "transcript", twinOf: "C07", text: "one and a half scoops of whey in water", parts: [["whey", 45]], items: 1 },
  { id: "F12", group: "transcript", twinOf: "A08", text: "un buñuelo una almojábana y agua de panela", parts: [["bunuelo", 50], ["almojabana", 60], ["agua_panela", 250]], items: 3 },

  // ── G · A usual by nickname (the seeded favourite below) ──────────
  { id: "G01", group: "usual", text: "Mi batido verde de la mañana", ref: USUAL_REF, items: 1, usual: true },
  { id: "G02", group: "usual", text: "el batido verde de la mañana de siempre", ref: USUAL_REF, items: 1, usual: true },
  { id: "G03", group: "usual", text: "my usual green morning shake", ref: USUAL_REF, items: 1, usual: false },
];

/** Fixtures run three times for the consistency metric. */
export const CONSISTENCY_IDS = FIXTURES.filter((f) => f.consistency).map((f) => f.id);

/**
 * Two-turn correction flows. `confirm: true` saves turn 1's card the way the
 * client does (POST /api/health/food/batch + PATCH the proposal to saved) so
 * turn 2 has a real row to edit; without it the card stays pending and the
 * model should re-propose.
 */
export const CORRECTIONS = [
  {
    id: "H01", first: "Lunch: 200 g grilled chicken with a cup of rice", confirm: true,
    second: "make lunch 650",
    expect: { kind: "edit_food", totalKcal: [600, 700] },
  },
  {
    id: "H02", first: "Two eggs and an arepa", confirm: false,
    second: "actually make that three eggs",
    expect: { kind: "food", parts: [["huevo", 150], ["arepa", 80]] },
  },
  {
    id: "H03", first: "A protein shake with milk", confirm: true,
    second: "that shake was 300 calories, not what you put",
    expect: { kind: "edit_food", setCalories: 300 },
  },
];

/** The favourite seeded for group G (deleted after the run). */
export const USUAL_SEED = {
  foodDescription: "Mi batido verde de la mañana",
  mealType: "breakfast",
  calories: 310,
  proteinG: 32,
  carbsG: 28,
  fatG: 6,
  kind: "meal",
};

/**
 * Synthetic history rows (deleted after the run). They exist so Phase 3's
 * history anchor has the same material in the before and after runs; the
 * baseline ignores them. Tagged in notes so cleanup can never touch his rows.
 */
export const HISTORY_SEEDS = [
  { foodDescription: "Arepa con queso (1, ~80 g, queso campesino)", mealType: "breakfast", calories: 320, proteinG: 10, carbsG: 38, fatG: 12 },
  { foodDescription: "Arepa con queso (1, ~80 g, queso campesino)", mealType: "breakfast", calories: 320, proteinG: 10, carbsG: 38, fatG: 12 },
  { foodDescription: "Arepa con queso (1, ~80 g)", mealType: "breakfast", calories: 330, proteinG: 10, carbsG: 38, fatG: 13 },
  { foodDescription: "Patacones con hogao (3)", mealType: "dinner", calories: 360, proteinG: 3, carbsG: 54, fatG: 16 },
  { foodDescription: "Patacones con hogao (3)", mealType: "dinner", calories: 360, proteinG: 3, carbsG: 54, fatG: 16 },
  { foodDescription: "Grilled chicken breast (~200 g)", mealType: "lunch", calories: 330, proteinG: 62, carbsG: 0, fatG: 7 },
  { foodDescription: "White rice (1 cup, ~160 g)", mealType: "lunch", calories: 205, proteinG: 4, carbsG: 45, fatG: 0.5 },
  { foodDescription: "Protein shake (1 scoop whey + 250 ml whole milk)", mealType: "snack", calories: 275, proteinG: 32, carbsG: 14, fatG: 10 },
  { foodDescription: "Protein shake (1 scoop whey + 250 ml whole milk)", mealType: "snack", calories: 275, proteinG: 32, carbsG: 14, fatG: 10 },
  { foodDescription: "Sancocho de pollo (1 bowl)", mealType: "lunch", calories: 380, proteinG: 22, carbsG: 45, fatG: 11 },
];
