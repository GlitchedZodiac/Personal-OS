import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The connector's tool layer (audit 2026-10): finance is off until the Settings
// switch is on and the refusal names it (SEC-011/D3); every write leaves an
// audit row (SEC-013); arguments are bounded (SEC-014).

vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: vi.fn(async () => "America/Bogota") }));
vi.mock("@/lib/ai/data-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/data-access")>();
  return { ...actual, executeAppData: vi.fn(async (args: { dataset?: string }) => ({ echo: args.dataset })) };
});
vi.mock("@/lib/user-exercises", () => ({ ensureUserExercisesLoaded: vi.fn(async () => {}) }));
vi.mock("@/lib/prs", () => ({ detectAndRecordPRs: vi.fn(async () => []), rebuildPersonalRecords: vi.fn(async () => null) }));

const { db } = vi.hoisted(() => {
  const db = {
    settings: {} as Record<string, unknown>,
    audit: [] as Record<string, unknown>[],
    todos: [] as Record<string, unknown>[],
    water: 0,
    userSettings: {
      findUnique: vi.fn(async () => ({ data: db.settings })),
      upsert: vi.fn(async ({ create }: { create: { data: Record<string, unknown> } }) => { db.settings = create.data; return { data: db.settings }; }),
    },
    mcpAuditEvent: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.audit.push(data); return data; }) },
    todo: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "todo-1", ...data }; db.todos.push(row); return row; }) },
    waterLog: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => { db.water += data.length; return { count: data.length }; }) },
    foodLog: { delete: vi.fn(async () => { throw new Error("not found"); }) },
    favoriteFoods: { findMany: vi.fn(async () => []) },
  };
  return { db };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { callMcpTool, clampArgs, FINANCE_DENIED_MESSAGE } from "@/lib/mcp/tools";
import { summarizeArgs } from "@/lib/mcp/audit";
import { mcpFinanceAllowed, setMcpFinanceAllowed } from "@/lib/mcp-settings";

beforeEach(() => {
  db.settings = {};
  db.audit.length = 0;
  db.todos.length = 0;
  db.water = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("finance over MCP (SEC-011, D3)", () => {
  it("is OFF by default and the refusal is a tool error naming the Settings switch — not an empty result", async () => {
    expect(await mcpFinanceAllowed()).toBe(false);
    const res = (await callMcpTool("query_data", { dataset: "finance_accounts" })) as Record<string, unknown>;
    expect(res.error).toBe(FINANCE_DENIED_MESSAGE);
    expect(String(res.error)).toContain('Settings → Claude connector → "Allow finance over MCP"');
    expect(res).not.toHaveProperty("rows");
    for (const ds of ["finance_summary", "finance_transactions", " finance_budgets"]) {
      expect(((await callMcpTool("query_data", { dataset: ds })) as Record<string, unknown>).error).toBe(FINANCE_DENIED_MESSAGE);
    }
  });
  it("non-finance datasets are unaffected", async () => {
    expect(await callMcpTool("query_data", { dataset: "recent_workouts" })).toEqual({ echo: "recent_workouts" });
    expect(await callMcpTool("query_data", { dataset: "spirit_notes" })).toEqual({ echo: "spirit_notes" });
  });
  it("answers once the switch is on, and off again when it is switched off", async () => {
    await setMcpFinanceAllowed(true);
    expect(await callMcpTool("query_data", { dataset: "finance_accounts" })).toEqual({ echo: "finance_accounts" });
    await setMcpFinanceAllowed(false);
    expect(((await callMcpTool("query_data", { dataset: "finance_accounts" })) as Record<string, unknown>).error).toBe(FINANCE_DENIED_MESSAGE);
  });
  it("the setting rides user_settings under its own key without touching the rest", async () => {
    db.settings = { units: "metric" };
    await setMcpFinanceAllowed(true);
    expect(db.settings).toEqual({ units: "metric", mcpAllowFinance: true });
  });
});

describe("the audit trail (SEC-013)", () => {
  it("a write tool leaves a row with the tool, a bounded summary and the row it made", async () => {
    await callMcpTool("report_gap", { title: "A gap", detail: "x".repeat(50) }, { sessionId: "sess-1", deviceLabel: "Claude connector" });
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ tool: "report_gap", ok: true, refId: "todo-1", sessionId: "sess-1", deviceLabel: "Claude connector" });
    expect(String(db.audit[0].summary).length).toBeLessThanOrEqual(500);
    expect(String(db.audit[0].summary)).toContain("A gap");
  });
  it("a refused write is recorded too, as not ok, with the error", async () => {
    await callMcpTool("delete_entry", { entity: "food", id: "nope" });
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ tool: "delete_entry", ok: false, error: "Row not found" });
  });
  it("reads leave no row", async () => {
    await callMcpTool("query_data", { dataset: "recent_workouts" });
    await callMcpTool("list_recipes", {});
    expect(db.audit).toHaveLength(0);
  });
  it("the summary never carries long text verbatim", () => {
    const s = summarizeArgs({ body: "L".repeat(5000), nested: { deep: { deeper: { deepest: { gone: "x" } } } } });
    expect(s.length).toBeLessThanOrEqual(501);
    expect(s).not.toContain("L".repeat(100));
  });
});

describe("argument bounds (SEC-014)", () => {
  it("clamps strings, arrays and depth before a handler runs", () => {
    const clamped = clampArgs({ s: "y".repeat(30_000), a: new Array(600).fill(1), n: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } }) as Record<string, unknown>;
    expect((clamped.s as string).length).toBe(20_000);
    expect((clamped.a as unknown[]).length).toBe(500);
    expect(JSON.stringify(clamped.n)).not.toContain('"g"');
  });
  it("report_gap keeps its detail under 2,000 characters, log_water stays bounded", async () => {
    await callMcpTool("report_gap", { title: "t", detail: "d".repeat(50_000) });
    expect(String(db.todos[0].notes).length).toBe(2000);
    await callMcpTool("log_water", { glasses: 1_000_000 });
    expect(db.water).toBe(24);
  });
});
