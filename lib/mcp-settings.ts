import { prisma } from "@/lib/prisma";

// Settings the Claude connector reads (2026-10, SEC-011 / PLAN D3). Stored in
// user_settings.data under a SERVER-OWNED key (app/api/settings/route.ts
// keeps the client's blind saves from clobbering it).

export const MCP_FINANCE_SETTING_KEY = "mcpAllowFinance";

async function readSettings(): Promise<Record<string, unknown>> {
  const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
  return (row?.data as Record<string, unknown> | null) ?? {};
}

/** May the connector read finance_* datasets? Off until he switches it on. */
export async function mcpFinanceAllowed(): Promise<boolean> {
  const data = await readSettings();
  return data[MCP_FINANCE_SETTING_KEY] === true;
}

export async function setMcpFinanceAllowed(on: boolean): Promise<boolean> {
  const data = { ...(await readSettings()), [MCP_FINANCE_SETTING_KEY]: on };
  await prisma.userSettings.upsert({
    where: { id: "default" },
    create: { id: "default", data: data as object },
    update: { data: data as object },
  });
  return on;
}
