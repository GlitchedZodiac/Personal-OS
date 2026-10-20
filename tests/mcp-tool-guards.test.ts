import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The connector's tool layer (audit 2026-10; reworked after the review of
// 3b): finance is off until its switch is on, the switch lives in its own row,
// the dataset is normalised once, the `settings` dataset is narrowed, every
// call leaves an audit row whose summary carries no content, and over-limit
// input is refused with a named error — never cut silently.

vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: vi.fn(async () => "America/Bogota") }));
vi.mock("@/lib/user-exercises", () => ({ ensureUserExercisesLoaded: vi.fn(async () => {}) }));
vi.mock("@/lib/prs", () => ({ detectAndRecordPRs: vi.fn(async () => []), rebuildPersonalRecords: vi.fn(async () => null) }));

const { db } = vi.hoisted(() => {
  const db = {
    settingsRows: {} as Record<string, Record<string, unknown>>,
    audit: [] as Record<string, unknown>[],
    todos: [] as Record<string, unknown>[],
    hymns: [] as Record<string, unknown>[],
    water: 0,
    financeRows: [{ id: "acc-1", name: "Checking", balance: 1234 }],
    userSettings: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (db.settingsRows[where.id] ? { data: db.settingsRows[where.id] } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: { data: Record<string, unknown> } }) => {
        db.settingsRows[where.id] = create.data;
        return { data: create.data };
      }),
    },
    mcpAuditEvent: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.audit.push(data); return data; }) },
    todo: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "todo-1", ...data }; db.todos.push(row); return row; }) },
    waterLog: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => { db.water += data.length; return { count: data.length }; }) },
    foodLog: { delete: vi.fn(async () => { throw new Error("not found"); }) },
    favoriteFoods: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "fav-1" ? { id: "fav-1", foodDescription: "Arepa con queso" } : null)),
      delete: vi.fn(async () => ({})),
    },
    hymn: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "hymn-1", ...data }; db.hymns.push(row); return row; }),
    },
    financialAccount: { findMany: vi.fn(async () => db.financeRows) },
    reminder: { create: vi.fn(async () => { throw new TypeError("boom"); }) },
  };
  return { db };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { argsProblem, callMcpTool, FINANCE_DENIED_MESSAGE, MCP_SETTINGS_KEYS } from "@/lib/mcp/tools";
import { referencedId, summarizeArgs } from "@/lib/mcp/audit";
import { mcpFinanceAllowed, setMcpFinanceAllowed } from "@/lib/mcp-settings";
import { executeAppData } from "@/lib/ai/data-access";

beforeEach(() => {
  db.settingsRows = {};
  db.audit.length = 0;
  db.todos.length = 0;
  db.hymns.length = 0;
  db.water = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const errorOf = (r: unknown) => (r as { error?: string }).error;

describe("finance over MCP (SEC-011, D3)", () => {
  it("is OFF by default and the refusal names the Settings switch — not an empty result", async () => {
    expect(await mcpFinanceAllowed()).toBe(false);
    const res = (await callMcpTool("query_data", { dataset: "finance_accounts" })) as Record<string, unknown>;
    expect(res.error).toBe(FINANCE_DENIED_MESSAGE);
    expect(String(res.error)).toContain('Settings → Claude connector → "Allow finance over MCP"');
    expect(res).not.toHaveProperty("rows");
    expect(db.financialAccount.findMany).not.toHaveBeenCalled();
  });
  it("a non-string dataset is refused, never stringified into a finance dataset (review of 3b)", async () => {
    for (const dataset of [["finance_accounts"], { toString: () => "finance_accounts" }, 7, "", "   "]) {
      expect(errorOf(await callMcpTool("query_data", { dataset }))).toMatch(/dataset must be one dataset name/);
    }
    expect(db.financialAccount.findMany).not.toHaveBeenCalled();
  });
  it("padding does not get around the gate either", async () => {
    expect(errorOf(await callMcpTool("query_data", { dataset: "  finance_accounts  " }))).toBe(FINANCE_DENIED_MESSAGE);
  });
  it("answers once the switch is on — and the switch lives in its OWN row, out of reach of blob writers", async () => {
    await setMcpFinanceAllowed(true);
    expect(db.settingsRows["mcp-connector"]).toEqual({ allowFinance: true });
    expect(db.settingsRows.default).toBeUndefined();
    const on = (await callMcpTool("query_data", { dataset: "finance_accounts" })) as { rows?: unknown[] };
    expect(on.rows?.length).toBe(1);
    // A stale write of the shared blob (what finance-inbox does) cannot flip it.
    db.settingsRows.default = { units: "metric", mcpAllowFinance: false };
    expect(await mcpFinanceAllowed()).toBe(true);
    await setMcpFinanceAllowed(false);
    expect(errorOf(await callMcpTool("query_data", { dataset: "finance_accounts" }))).toBe(FINANCE_DENIED_MESSAGE);
  });
});

describe("the settings dataset over MCP", () => {
  it("returns only health and presentation keys — not the Gmail queue, finance settings or finance instructions", async () => {
    db.settingsRows.default = {
      calorieTarget: 2200, units: "metric", timeZone: "America/Bogota",
      aiInstructions: { health: "kettlebell focus", finance: "my bank rules" },
      finance: { gmailLookbackMonths: 12 }, financeInbox: { queue: [{ subject: "statement" }] },
      notificationPrefs: { quietHours: true },
    };
    const res = (await callMcpTool("query_data", { dataset: "settings" })) as { settings: Record<string, unknown> };
    expect(res.settings).toEqual({ calorieTarget: 2200, units: "metric", timeZone: "America/Bogota", aiInstructions: { health: "kettlebell focus" } });
    expect(MCP_SETTINGS_KEYS).not.toContain("finance");
    // The in-app assistant (no allowlist) still sees the whole blob.
    const inApp = (await executeAppData({ dataset: "settings" }, { timeZone: "UTC", todayStr: "2026-10-20" })) as { settings: Record<string, unknown> };
    expect(inApp.settings).toHaveProperty("financeInbox");
  });
});

describe("the audit trail (SEC-013, review of 3b)", () => {
  it("a write leaves a row whose summary is SHAPE ONLY — no text, no health numbers", async () => {
    await callMcpTool("report_gap", { title: "Need sleep stages", detail: "I take melatonin at 22:00" }, { sessionId: "sess-1", deviceLabel: "Claude connector" });
    const row = db.audit[0];
    expect(row).toMatchObject({ tool: "report_gap", ok: true, refId: "todo-1", sessionId: "sess-1" });
    expect(row.summary).toBe("title:text(17) detail:text(25)");
    expect(String(row.summary)).not.toMatch(/melatonin|sleep/);
  });
  it("identifiers and fixed vocabulary are kept verbatim; numbers and words are not", () => {
    expect(summarizeArgs({ entity: "food", id: "abc", weightKg: 117.3, items: [1, 2, 3], body: "Coro: …" })).toBe("entity=food id=abc weightKg:num items:list(3) body:text(7)");
  });
  it("delete_recipe records the recipe's id, not its name", async () => {
    await callMcpTool("delete_recipe", { id: "fav-1" });
    expect(db.audit[0]).toMatchObject({ tool: "delete_recipe", ok: true, refId: "fav-1" });
    expect(referencedId({ deleted: "Arepa con queso", id: "fav-1" })).toBe("fav-1");
  });
  it("a tool that THROWS still leaves a row, marked as an error", async () => {
    await expect(callMcpTool("set_reminder", { title: "stretch", remindAt: "2026-10-21T08:00:00Z" })).rejects.toThrow("boom");
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ tool: "set_reminder", ok: false, error: "threw: TypeError" });
  });
  it("a refused call is recorded too, as not ok, with the error", async () => {
    await callMcpTool("delete_entry", { entity: "food", id: "nope" });
    expect(db.audit[0]).toMatchObject({ tool: "delete_entry", ok: false, error: "Row not found" });
  });
  it("reads leave a light row: dataset and count, no content", async () => {
    db.settingsRows["mcp-connector"] = { allowFinance: true };
    await callMcpTool("query_data", { dataset: "finance_accounts", q: "my private search" });
    expect(db.audit[0]).toMatchObject({ tool: "query_data", ok: true, refId: null });
    expect(db.audit[0].summary).toBe("read dataset=finance_accounts q:text(17) → 1 rows");
  });
});

describe("over-limit input is refused by name, never cut (SEC-014, review of 3b)", () => {
  it("argsProblem names the path and the limit", () => {
    expect(argsProblem({ body: "x".repeat(100_001) })).toBe("arguments.body is longer than 100,000 characters");
    expect(argsProblem({ items: new Array(501).fill(1) })).toBe("arguments.items has more than 500 items");
    expect(argsProblem({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toMatch(/nested deeper than 6 levels/);
    expect(argsProblem({ title: "fine", items: [1, 2] })).toBeNull();
  });
  it("a long hymn is stored WHOLE (27k is well inside the limit), and an over-limit one is refused, not halved", async () => {
    const res = (await callMcpTool("save_hymn", { title: "Long", body: "verse\n".repeat(4_500) })) as Record<string, unknown>;
    expect(res.created).toBe(true);
    expect(String(db.hymns[0].body).length).toBe(26_999); // trimmed of the final newline only
    const tooLong = await callMcpTool("save_hymn", { title: "Huge", body: "x".repeat(100_001) });
    expect(errorOf(tooLong)).toMatch(/arguments.body is longer than 100,000 characters/);
    expect(db.hymns).toHaveLength(1);
  });
  it("field limits are errors too: report_gap detail, food description", async () => {
    expect(errorOf(await callMcpTool("report_gap", { title: "t", detail: "d".repeat(5_001) }))).toBe("detail is longer than 5,000 characters — shorten it and try again");
    expect(db.todos).toHaveLength(0);
    const food = await callMcpTool("log_food", { items: [{ mealType: "lunch", foodDescription: "f".repeat(501), calories: 1, proteinG: 1, carbsG: 1, fatG: 1 }] });
    expect(errorOf(food)).toMatch(/items\[0\]\.foodDescription is longer than 500/);
  });
  it("log_water stays bounded", async () => {
    await callMcpTool("log_water", { glasses: 1_000_000 });
    expect(db.water).toBe(24);
  });
});
