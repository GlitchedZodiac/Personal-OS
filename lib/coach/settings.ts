// Settings → Coach (2026-10-17, lane B). Stored under user_settings.data.coach
// and written here, server-side, by read-merge-write of that ONE key — never
// by the client's wholesale PUT of the settings blob, which the settings
// route is told to leave alone for this key (SERVER_OWNED_KEYS).

import { MODEL_TIERS, type ModelTier } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export interface CoachSettings {
  /** off = no Sunday run, no notification; past reviews stay readable */
  enabled: boolean;
  /** USD per calendar month, measured on review spend only (docs/coach-plan.md D7) */
  monthlyBudgetUsd: number;
  /** the registry tier the review is written with */
  modelTier: ModelTier;
  /** quote up to three short journal lines as facts (D22) */
  journalExcerpts: boolean;
}

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  enabled: true,
  monthlyBudgetUsd: 3,
  modelTier: "sol",
  journalExcerpts: false,
};

export const MIN_BUDGET_USD = 0.5;
export const MAX_BUDGET_USD = 100;

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === "string" && value in MODEL_TIERS;
}

/** Keep only what is well-formed; anything else keeps its stored value. */
export function sanitizeCoachSettings(patch: unknown): Partial<CoachSettings> {
  const input = (patch ?? {}) as Record<string, unknown>;
  const out: Partial<CoachSettings> = {};
  if (typeof input.enabled === "boolean") out.enabled = input.enabled;
  if (typeof input.journalExcerpts === "boolean") out.journalExcerpts = input.journalExcerpts;
  const budget = Number(input.monthlyBudgetUsd);
  if (Number.isFinite(budget)) {
    out.monthlyBudgetUsd = Math.round(Math.min(MAX_BUDGET_USD, Math.max(MIN_BUDGET_USD, budget)) * 100) / 100;
  }
  if (isModelTier(input.modelTier)) out.modelTier = input.modelTier;
  return out;
}

export function coachSettingsFrom(settingsData: unknown): CoachSettings {
  const data = (settingsData ?? {}) as { coach?: unknown };
  return { ...DEFAULT_COACH_SETTINGS, ...sanitizeCoachSettings(data.coach) };
}

export async function getCoachSettings(): Promise<CoachSettings> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { id: "default" },
      select: { data: true },
    });
    return coachSettingsFrom(row?.data);
  } catch {
    return { ...DEFAULT_COACH_SETTINGS };
  }
}

export async function saveCoachSettings(patch: unknown): Promise<CoachSettings> {
  const row = await prisma.userSettings.findUnique({ where: { id: "default" } });
  const data = (row?.data ?? {}) as Record<string, unknown>;
  const merged: CoachSettings = {
    ...DEFAULT_COACH_SETTINGS,
    ...sanitizeCoachSettings(data.coach),
    ...sanitizeCoachSettings(patch),
  };
  const nextData = { ...data, coach: merged };
  await prisma.userSettings.upsert({
    where: { id: "default" },
    update: { data: nextData as object },
    create: { id: "default", data: nextData as object },
  });
  return merged;
}
