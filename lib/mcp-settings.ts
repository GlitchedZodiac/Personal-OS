import { prisma } from "@/lib/prisma";

// Settings the Claude connector reads (2026-10, SEC-011 / PLAN D3). The finance
// switch lives in its OWN user_settings row (id "mcp-connector"), not in the
// shared "default" blob: six writers read-modify-write that blob, one of them
// (lib/finance-inbox.ts) across a seconds-long Gmail fetch, so a stale copy
// written back could flip the switch (review of 3b). Every other reader
// addresses the "default" row by id, so this row is invisible to them.

const ROW_ID = "mcp-connector";
export const MCP_FINANCE_SETTING_KEY = "allowFinance";

/** May the connector read finance_* datasets? Off until he switches it on. */
export async function mcpFinanceAllowed(): Promise<boolean> {
  const row = await prisma.userSettings.findUnique({ where: { id: ROW_ID }, select: { data: true } });
  return (row?.data as Record<string, unknown> | null)?.[MCP_FINANCE_SETTING_KEY] === true;
}

export async function setMcpFinanceAllowed(on: boolean): Promise<boolean> {
  const data = { [MCP_FINANCE_SETTING_KEY]: on };
  await prisma.userSettings.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, data },
    update: { data },
  });
  return on;
}
