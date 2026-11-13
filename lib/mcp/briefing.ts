// The live part of the connector's briefing (2026-11-12, MCP v2).
//
// `initialize.instructions` used to be fixed text. Now it ends with what
// Michael has taught Pitaya through Claude — his standing rules
// (settings.aiInstructions.health, written by update_settings) — and, from
// later phases, the custom fields that exist and the movements still
// waiting for an explanation. Every new Claude session reads it on connect.
//
// Never throws: a briefing that fails to load must not stop the connector
// from connecting, so any failure falls back to the fixed text alone.

import { prisma } from "@/lib/prisma";

export const MAX_BRIEFING_RULES = 2000;

type Section = () => Promise<string | null>;

const sections: Section[] = [standingRules];

/** Register a section (Phases B and C add theirs). */
export function addBriefingSection(section: Section) {
  if (!sections.includes(section)) sections.push(section);
}

async function standingRules(): Promise<string | null> {
  const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
  const data = (row?.data ?? {}) as { aiInstructions?: { health?: unknown } };
  const rules = typeof data.aiInstructions?.health === "string" ? data.aiInstructions.health.trim() : "";
  if (!rules) return null;
  return `Standing rules from Michael (he set these through update_settings; follow them, and change them only when he asks): ${rules.slice(0, MAX_BRIEFING_RULES)}`;
}

export async function connectorBriefing(): Promise<string> {
  const parts: string[] = [];
  for (const section of sections) {
    try {
      const text = await section();
      if (text) parts.push(text);
    } catch {
      // One failing section never blocks the others or the connection.
    }
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}
