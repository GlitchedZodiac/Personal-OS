export interface AIInstructions {
  health: string;
  todos: string;
  social: string;
}

export interface WorkoutGoals {
  goal: "build_muscle" | "lose_weight" | "general_fitness" | "endurance";
  fitnessLevel: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: string[]; // "full_gym", "dumbbells", "bodyweight", "resistance_bands", "barbell_rack"
  focusAreas: string[]; // "chest", "back", "legs", "shoulders", "arms", "core", "full_body"
  injuries: string; // free-text for any injuries/limitations
}

export interface BodyGoals {
  goalWeightKg: number | null;
  goalWaistCm: number | null;
}

export type AILanguage = "english" | "spanish" | "portuguese" | "french";

export interface AppSettings {
  calorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  units: "metric" | "imperial";
  theme: "dark" | "light" | "system";
  gender: "male" | "female" | "";
  birthYear: number | null;
  aiLanguage: AILanguage;
  bodyGoals: BodyGoals;
  aiInstructions: AIInstructions;
  workoutGoals: WorkoutGoals;
}

const DEFAULT_SETTINGS: AppSettings = {
  calorieTarget: 2000,
  proteinPct: 30,
  carbsPct: 40,
  fatPct: 30,
  units: "metric",
  theme: "dark",
  gender: "",
  birthYear: null,
  aiLanguage: "english",
  bodyGoals: {
    goalWeightKg: null,
    goalWaistCm: null,
  },
  aiInstructions: {
    health: "",
    todos: "",
    social: "",
  },
  workoutGoals: {
    goal: "build_muscle",
    fitnessLevel: "beginner",
    daysPerWeek: 4,
    sessionMinutes: 45,
    equipment: ["full_gym"],
    focusAreas: ["full_body"],
    injuries: "",
  },
};

const STORAGE_KEY = "personal-os-settings";

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate from old gram-based settings to percentage-based
      if (parsed.proteinTargetG && !parsed.proteinPct) {
        const totalMacroCals =
          parsed.proteinTargetG * 4 +
          parsed.carbsTargetG * 4 +
          parsed.fatTargetG * 9;
        if (totalMacroCals > 0) {
          parsed.proteinPct = Math.round(
            ((parsed.proteinTargetG * 4) / totalMacroCals) * 100
          );
          parsed.carbsPct = Math.round(
            ((parsed.carbsTargetG * 4) / totalMacroCals) * 100
          );
          parsed.fatPct =
            100 - parsed.proteinPct - parsed.carbsPct;
        }
        // Clean up old fields
        delete parsed.proteinTargetG;
        delete parsed.carbsTargetG;
        delete parsed.fatTargetG;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Compute gram targets from calorie target + macro percentages.
 * protein & carbs = 4 cal/g, fat = 9 cal/g
 */
export function getMacroGrams(settings: AppSettings) {
  const proteinG = Math.round(
    (settings.calorieTarget * settings.proteinPct) / 100 / 4
  );
  const carbsG = Math.round(
    (settings.calorieTarget * settings.carbsPct) / 100 / 4
  );
  const fatG = Math.round(
    (settings.calorieTarget * settings.fatPct) / 100 / 9
  );
  return { proteinG, carbsG, fatG };
}

export function useSettingsValue<K extends keyof AppSettings>(
  key: K
): AppSettings[K] {
  return getSettings()[key];
}
