import { beforeEach, describe, expect, it, vi } from "vitest";

// The MCP core under test: the stateless JSON-RPC dispatch and the tool
// table's shape + a few handlers over a mocked prisma. The route's bearer
// auth rides requireMobileSession (already covered by its own machinery).

vi.mock("@/lib/server-timezone", () => ({
  getUserTimeZone: vi.fn(async () => "America/Bogota"),
}));

vi.mock("@/lib/ai/data-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/data-access")>();
  return {
    ...actual,
    executeAppData: vi.fn(async (args: { dataset?: string }) => ({
      echo: args.dataset,
    })),
  };
});

vi.mock("@/lib/user-exercises", () => ({
  ensureUserExercisesLoaded: vi.fn(async () => {}),
}));

vi.mock("@/lib/prs", () => ({
  detectAndRecordPRs: vi.fn(async () => []),
  rebuildPersonalRecords: vi.fn(async () => null),
}));

const favorites: Array<Record<string, unknown> & { id: string }> = [];
const foodLogs: Array<Record<string, unknown> & { id: string }> = [];
let seq = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    favoriteFoods: {
      findMany: vi.fn(async () => favorites),
      findFirst: vi.fn(
        async ({ where }: { where: { foodDescription?: { equals?: string }; id?: { not?: string } } }) => {
          const name = where?.foodDescription?.equals?.toLowerCase();
          return (
            favorites.find(
              (f) =>
                String(f.foodDescription).toLowerCase() === name &&
                (!where.id?.not || f.id !== where.id.not)
            ) ?? null
          );
        }
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        favorites.find((f) => f.id === where.id) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `fav-${++seq}`, usageCount: 0, ...data };
        favorites.push(row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = favorites.find((f) => f.id === where.id)!;
          if (
            data.usageCount &&
            typeof data.usageCount === "object" &&
            "increment" in data.usageCount
          ) {
            row.usageCount = Number(row.usageCount ?? 0) + 1;
          } else {
            Object.assign(row, data);
          }
          return row;
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = favorites.findIndex((f) => f.id === where.id);
        if (i >= 0) favorites.splice(i, 1);
        return {};
      }),
    },
    foodLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `food-${++seq}`, loggedAt: new Date(), ...data };
        foodLogs.push(row);
        return row;
      }),
    },
  },
}));

import { handleMcpMessage, SERVER_INFO } from "@/lib/mcp/server";
import { MCP_TOOL_DEFS } from "@/lib/mcp/tools";

const rpc = (method: string, params?: object, id: number | null = 1) => ({
  jsonrpc: "2.0",
  ...(id === null ? {} : { id }),
  method,
  ...(params ? { params } : {}),
});

const callTool = async (name: string, args: object) => {
  const res = await handleMcpMessage(rpc("tools/call", { name, arguments: args }));
  const body = res.body as {
    result: { content: [{ text: string }]; isError: boolean };
  };
  return { parsed: JSON.parse(body.result.content[0].text), isError: body.result.isError };
};

beforeEach(() => {
  favorites.length = 0;
  foodLogs.length = 0;
});

describe("MCP protocol core", () => {
  it("initialize echoes a supported version and identifies the server", async () => {
    const res = await handleMcpMessage(
      rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {} })
    );
    const body = res.body as { result: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo).toEqual(SERVER_INFO);
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("unknown protocol versions get our latest instead of an error", async () => {
    const res = await handleMcpMessage(
      rpc("initialize", { protocolVersion: "1999-01-01" })
    );
    expect((res.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      "2025-06-18"
    );
  });

  it("notifications produce 202 with no body; batches are rejected", async () => {
    const note = await handleMcpMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(note.status).toBe(202);
    expect(note.body).toBeNull();

    const batch = await handleMcpMessage([rpc("ping")]);
    expect((batch.body as { error: { code: number } }).error.code).toBe(-32600);
  });

  it("ping pongs and unknown methods 32601", async () => {
    expect((await handleMcpMessage(rpc("ping"))).body).toMatchObject({ result: {} });
    const unknown = await handleMcpMessage(rpc("resources/list"));
    expect((unknown.body as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("tools/list exposes the full surface with schemas", async () => {
    const res = await handleMcpMessage(rpc("tools/list"));
    const tools = (res.body as { result: { tools: typeof MCP_TOOL_DEFS } }).result.tools;
    const names = tools.map((t) => t.name);
    for (const expected of [
      "query_data",
      "list_recipes",
      "save_recipe",
      "rename_recipe",
      "log_recipe",
      "delete_recipe",
      "log_food",
      "edit_food",
      "log_workout",
      "edit_workout",
      "delete_entry",
      "log_measurement",
      "log_water",
      "set_reminder",
      "create_routine",
      "update_routine",
      "plan_training",
      "get_training_week",
      "name_trail",
      "report_gap",
    ]) {
      expect(names).toContain(expected);
    }
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(10);
      expect((t.inputSchema as { type: string }).type).toBe("object");
    }
  });
});

describe("MCP tool handlers", () => {
  it("query_data rides the registry executor", async () => {
    const { parsed, isError } = await callTool("query_data", { dataset: "recent_workouts" });
    expect(isError).toBe(false);
    expect(parsed).toEqual({ echo: "recent_workouts" });
  });

  it("recipes: save → rename → fuzzy log → product scaling", async () => {
    const saved = await callTool("save_recipe", {
      name: "Egg wrap with pea protein",
      calories: 320,
      proteinG: 28,
      carbsG: 22,
      fatG: 12,
    });
    expect(saved.parsed.created).toBe(true);

    const renamed = await callTool("rename_recipe", {
      name: "Egg wrap with pea protein",
      newName: "Protein egg wrap",
    });
    expect(renamed.parsed.recipe.foodDescription).toBe("Protein egg wrap");

    // Fuzzy: spoken phrasing drift still finds it, exact macros logged.
    const logged = await callTool("log_recipe", { name: "the protein egg wrap again" });
    expect(logged.isError).toBe(false);
    expect(logged.parsed.logged.calories).toBe(320);
    expect(logged.parsed.logged.source).toBe("usual");
    expect(favorites[0].usageCount).toBe(1);

    // Product macros scale per serving.
    await callTool("save_recipe", {
      name: "Whey scoop",
      calories: 120,
      proteinG: 24,
      carbsG: 3,
      fatG: 2,
      kind: "product",
      servingLabel: "1 scoop (32 g)",
    });
    const two = await callTool("log_recipe", { name: "Whey scoop", servings: 2 });
    expect(two.parsed.logged.calories).toBe(240);
    expect(two.parsed.logged.foodDescription).toContain("(2×)");
  });

  it("log_food stamps mcp provenance and bounds the batch", async () => {
    const ok = await callTool("log_food", {
      items: [
        {
          mealType: "lunch",
          foodDescription: "bandeja paisa, half portion",
          calories: 700,
          proteinG: 35,
          carbsG: 60,
          fatG: 32,
        },
      ],
    });
    expect(ok.parsed.logged).toBe(1);
    expect(foodLogs[0].source).toBe("mcp");

    const empty = await callTool("log_food", { items: [] });
    expect(empty.isError).toBe(true);
  });

  it("unknown tool names return a recoverable error", async () => {
    const { parsed, isError } = await callTool("does_not_exist", {});
    expect(isError).toBe(true);
    expect(String(parsed.error)).toContain("Unknown tool");
  });
});
