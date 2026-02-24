type FluidFoodLog = {
  foodDescription: string;
  notes?: string | null;
};

const DRINK_KEYWORDS = [
  "water",
  "agua",
  "juice",
  "jugo",
  "coffee",
  "cafe",
  "tea",
  "smoothie",
  "shake",
  "milk",
  "leche",
  "soda",
  "coke",
  "cola",
  "gatorade",
  "electrolyte",
  "sports drink",
  "beer",
  "cerveza",
  "wine",
  "vino",
  "cocktail",
  "drink",
  "bebida",
  "broth",
  "soup",
  "caldo",
  "sopa",
];

function hasFluidKeyword(text: string): boolean {
  const normalized = text.toLowerCase();
  return DRINK_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function parseNumber(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

/**
 * Estimate hydration fluid from a food log text description.
 * Uses explicit units first (ml/l/oz/cups/glasses/bottles), then a conservative default.
 */
export function estimateFluidMlFromFoodLog(log: FluidFoodLog): number {
  const text = `${log.foodDescription || ""} ${log.notes || ""}`.trim().toLowerCase();
  if (!text || !hasFluidKeyword(text)) return 0;

  let totalMl = 0;

  const mlMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ml|milliliters?|millilitres?)/g)];
  for (const match of mlMatches) totalMl += parseNumber(match[1]);

  const literMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:l|liters?|litres?|liter|litre)/g)];
  for (const match of literMatches) totalMl += parseNumber(match[1]) * 1000;

  const ozMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:oz|ounce|ounces)/g)];
  for (const match of ozMatches) totalMl += parseNumber(match[1]) * 29.5735;

  const cupMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:cup|cups|taza|tazas)/g)];
  for (const match of cupMatches) totalMl += parseNumber(match[1]) * 240;

  const glassMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:glass|glasses|vaso|vasos)/g)];
  for (const match of glassMatches) totalMl += parseNumber(match[1]) * 250;

  const bottleMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:bottle|bottles|botella|botellas)/g)];
  for (const match of bottleMatches) totalMl += parseNumber(match[1]) * 500;

  // Guardrail against implausibly huge values from malformed text.
  if (totalMl > 0) return Math.min(Math.round(totalMl), 4000);

  // If it clearly looks like a drink but no amount was captured, assume one glass.
  return 250;
}

export function estimateFluidMlFromFoodLogs(logs: FluidFoodLog[]): number {
  return logs.reduce((sum, log) => sum + estimateFluidMlFromFoodLog(log), 0);
}

