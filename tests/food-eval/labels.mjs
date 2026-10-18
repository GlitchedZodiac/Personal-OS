// Synthetic nutrition labels (rendered to PNG by Playwright in the harness)
// and the two photo probes. Products and numbers are invented; the layouts
// follow the two formats he photographs — the US "Nutrition Facts" panel and
// the Colombian "Información Nutricional" table.

export const LABELS = [
  {
    id: "I01", lang: "en", brand: "Northfield", product: "Whey Isolate — Vanilla",
    servingLabel: "1 scoop (31 g)", servingsPerContainer: 29,
    calories: 120, fatG: 1, carbsG: 3, proteinG: 25,
  },
  {
    id: "I02", lang: "es", brand: "Lácteos del Valle", product: "Yogur Griego Natural",
    servingLabel: "1 vaso (150 g)", servingsPerContainer: 1,
    calories: 110, fatG: 3, carbsG: 6, proteinG: 15,
  },
  {
    id: "I03", lang: "en", brand: "Harvest Mill", product: "Old-Fashioned Rolled Oats",
    servingLabel: "1/2 cup dry (40 g)", servingsPerContainer: 30,
    calories: 150, fatG: 2.5, carbsG: 27, proteinG: 5,
  },
  {
    id: "I04", lang: "es", brand: "Andina", product: "Barra de Granola con Almendras",
    servingLabel: "1 barra (35 g)", servingsPerContainer: 6,
    calories: 160, fatG: 7, carbsG: 21, proteinG: 3,
  },
  {
    id: "I05", lang: "en", brand: "Grove & Co.", product: "Creamy Peanut Butter",
    servingLabel: "2 tbsp (32 g)", servingsPerContainer: 14,
    calories: 190, fatG: 16, carbsG: 7, proteinG: 8,
  },
  {
    id: "I06", lang: "es", brand: "La Molienda", product: "Tortillas de Maíz",
    servingLabel: "2 tortillas (50 g)", servingsPerContainer: 10,
    calories: 110, fatG: 1.5, carbsG: 22, proteinG: 3,
  },
];

/** Two labels also go through the chat with a servings multiplier. */
export const LABEL_CHAT = [
  { id: "L01", label: "I01", text: "This label, I had two scoops", multiplier: 2 },
  { id: "L02", label: "I02", text: "Esta etiqueta, me comí una porción y media", multiplier: 1.5 },
];

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e4dc; font-family: Helvetica, Arial, sans-serif; color: #111; }
  .wrap { padding: 28px; }
  .panel { background: #fff; border: 2px solid #000; padding: 10px 12px; width: 100%; }
  h1 { font-size: 34px; margin: 0 0 4px; font-weight: 900; letter-spacing: -0.5px; }
  .brand { font-size: 13px; color: #333; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid #000; font-size: 15px; }
  .row.thick { border-top: 8px solid #000; }
  .row.mid { border-top: 4px solid #000; }
  .row b { font-weight: 800; }
  .row .pct { font-weight: 800; }
  .cal { display: flex; justify-content: space-between; align-items: flex-end; border-top: 8px solid #000; padding-top: 6px; }
  .cal .k { font-size: 44px; font-weight: 900; line-height: 1; }
  .cal .lbl { font-size: 15px; font-weight: 800; }
  .foot { font-size: 11px; color: #222; margin-top: 8px; border-top: 4px solid #000; padding-top: 6px; }
  .indent { padding-left: 16px; }
`;

/** US-style panel or a Colombian table, depending on `lang`. */
export function labelHtml(l) {
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const sat = fmt(Math.round(l.fatG * 0.3 * 10) / 10);
  const sugar = fmt(Math.round(l.carbsG * 0.4));
  const sodium = Math.round(l.calories * 1.1);
  if (l.lang === "es") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body><div class="wrap"><div class="panel">
  <h1 style="font-size:26px">Información Nutricional</h1>
  <div class="brand">${l.brand} · ${l.product}</div>
  <div class="row"><span>Tamaño por porción</span><b>${l.servingLabel}</b></div>
  <div class="row"><span>Porciones por envase</span><b>${l.servingsPerContainer}</b></div>
  <div class="row thick"><b>Cantidad por porción</b><span></span></div>
  <div class="row"><b>Calorías</b><b>${fmt(l.calories)} kcal</b></div>
  <div class="row mid"><span><b>Grasa total</b></span><b>${fmt(l.fatG)} g</b></div>
  <div class="row"><span class="indent">Grasa saturada</span><span>${sat} g</span></div>
  <div class="row"><span><b>Sodio</b></span><span>${sodium} mg</span></div>
  <div class="row"><span><b>Carbohidratos totales</b></span><b>${fmt(l.carbsG)} g</b></div>
  <div class="row"><span class="indent">Azúcares</span><span>${sugar} g</span></div>
  <div class="row"><span><b>Proteína</b></span><b>${fmt(l.proteinG)} g</b></div>
  <div class="foot">* Los porcentajes de valores diarios están basados en una dieta de 2.000 calorías.</div>
</div></div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body><div class="wrap"><div class="panel">
  <h1>Nutrition Facts</h1>
  <div class="brand">${l.brand} · ${l.product}</div>
  <div class="row"><span>${l.servingsPerContainer} servings per container</span><span></span></div>
  <div class="row"><b>Serving size</b><b>${l.servingLabel}</b></div>
  <div class="cal"><div><div class="lbl">Amount per serving</div><div class="lbl" style="font-size:22px">Calories</div></div><div class="k">${fmt(l.calories)}</div></div>
  <div class="row mid"><span></span><span class="pct">% Daily Value*</span></div>
  <div class="row"><span><b>Total Fat</b> ${fmt(l.fatG)}g</span><span class="pct">${Math.round((l.fatG / 78) * 100)}%</span></div>
  <div class="row"><span class="indent">Saturated Fat ${sat}g</span><span class="pct">${Math.round(((l.fatG * 0.3) / 20) * 100)}%</span></div>
  <div class="row"><span><b>Sodium</b> ${sodium}mg</span><span class="pct">${Math.round((sodium / 2300) * 100)}%</span></div>
  <div class="row"><span><b>Total Carbohydrate</b> ${fmt(l.carbsG)}g</span><span class="pct">${Math.round((l.carbsG / 275) * 100)}%</span></div>
  <div class="row"><span class="indent">Total Sugars ${sugar}g</span><span></span></div>
  <div class="row"><span><b>Protein</b> ${fmt(l.proteinG)}g</span><span></span></div>
  <div class="foot">* The % Daily Value tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</div>
</div></div></body></html>`;
}

/** A non-food image: coloured shapes, no text. The model should not "see" a meal. */
export const SHAPES_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#1d2b3a;width:600px;height:600px;position:relative;overflow:hidden}
  .c{position:absolute;border-radius:50%}
  .r{position:absolute}
</style></head><body>
  <div class="c" style="left:60px;top:80px;width:220px;height:220px;background:#e4572e"></div>
  <div class="r" style="left:300px;top:120px;width:200px;height:140px;background:#17bebb;transform:rotate(12deg)"></div>
  <div class="r" style="left:120px;top:360px;width:360px;height:60px;background:#ffc914"></div>
  <div class="c" style="left:380px;top:400px;width:120px;height:120px;background:#76b041"></div>
</body></html>`;

/** 1×1 transparent PNG — an "image" with nothing in it. */
export const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
