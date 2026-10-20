// How a food row is written down, the same way from every door (2026-10-18).
//
// `source` — who logged it. Until this round the chat card never said, and
// the batch route wrote "voice" for typed, dictated and photographed logs
// alike (580 of 674 rows). The vocabulary is closed; an unknown value falls
// back to the caller's default so an older client keeps working.
//
// Descriptions were already consistently shaped in his history (97 % start
// with a capital, 88 % carry a portion in parentheses); the normaliser only
// removes the noise a model or a keyboard adds — stray spaces, a trailing
// full stop, a lower-case first letter — and never touches his words.

export const FOOD_SOURCES = ["chat", "voice", "photo", "label", "usual", "mcp", "manual", "import"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export function normalizeFoodSource(value: unknown, fallback: FoodSource): FoodSource {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  // "text" is what the chat page calls a typed message; stored as "chat".
  if (v === "text") return "chat";
  return (FOOD_SOURCES as readonly string[]).includes(v) ? (v as FoodSource) : fallback;
}

/** The chat page's message source → the row's source. */
export function sourceFromChat(messageSource: string): FoodSource {
  return messageSource === "voice" ? "voice" : messageSource === "photo" ? "photo" : "chat";
}

export function normalizeFoodDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  let s = value.replace(/\s+/g, " ").trim();
  // a trailing full stop, comma or semicolon — never "!" or "?", he may mean them
  s = s.replace(/[.,;:]+$/g, "").trim();
  // balance a dropped closing parenthesis
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  if (open === close + 1 && s.includes("(")) s += ")";
  if (s.length > 0) {
    const first = s[0];
    if (first !== first.toLocaleUpperCase() && /\p{L}/u.test(first)) s = first.toLocaleUpperCase() + s.slice(1);
  }
  return s;
}
