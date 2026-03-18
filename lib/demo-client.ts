function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

const isPublicDemoMode =
  cleanEnv(process.env.NEXT_PUBLIC_DEMO_MODE).toLowerCase() === "true";
const rawDemoLanguage = cleanEnv(process.env.NEXT_PUBLIC_DEMO_LANGUAGE || "en").toLowerCase();

function normalizeLanguage(raw: string): "en" | "es" {
  if (raw === "spanish" || raw.startsWith("es")) return "es";
  return "en";
}

export const demoModeEnabled = isPublicDemoMode;
export const demoLanguage = normalizeLanguage(rawDemoLanguage);
export const demoSpanishEnabled = demoModeEnabled && demoLanguage === "es";

export function demoText(english: string, spanish: string): string {
  return demoSpanishEnabled ? spanish : english;
}
