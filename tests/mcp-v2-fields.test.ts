import { beforeEach, describe, expect, it, vi } from "vitest";

// MCP v2 Phase B (2026-11-12): fields Claude can add — define, validate,
// write through the log tools and patch_record, read back, describe, undo.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let seq = 0;
const clean = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v ?? null, (_k, x) =>
      x && typeof x === "object" && x.constructor && x.constructor !== Object && !Array.isArray(x) ? null : x
    )
  );
const revive = (row: Row) => {
  for (const k of ["measuredAt", "loggedAt", "startedAt", "createdAt"]) if (typeof row[k] === "string") row[k] = new Date(row[k] as string);
  return row;
};

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  const find = (where: Row) => {
    if (where.entity_key) {
      const { entity, key } = where.entity_key as Row;
      return rows().find((r) => r.entity === entity && r.key === key) ?? null;
    }
    return rows().find((r) => r.id === where.id) ?? null;
  };
  const matches = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (v === null || typeof v !== "object" ? r[k] === v : true));
  return {
    findUnique: vi.fn(async ({ where }: { where: Row }) => find(where)),
    findMany: vi.fn(async ({ where = {} }: { where?: Row } = {}) => rows().filter((r) => matches(r, where))),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = revive({ id: `${name}-${++seq}`, createdAt: new Date(Date.now() + seq), status: "active", ...clean(data) });
      rows().push(row);
      return row;
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) rows().push({ id: `chg-${++seq}`, createdAt: new Date(Date.now() + seq), undoneAt: null, ...clean(d) });
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = find(where);
      if (!row) throw new Error(`${name} not found`);
      Object.assign(row, revive(clean(data)));
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Row }) => {
      for (const r of rows()) if (where.id?.in?.includes(r.id as string)) Object.assign(r, data);
      return { count: 0 };
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const row = find(where);
      if (row) return Object.assign(row, clean(update));
      const fresh = { id: `${name}-${++seq}`, createdAt: new Date(), ...clean(create) };
      rows().push(fresh);
      return fresh;
    }),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => (target[prop] ??= model(prop)),
  }),
}));
vi.mock("@/lib/server-timezone", () => ({ getUserTimeZone: vi.fn(async () => "America/Bogota") }));
vi.mock("@/lib/mcp-settings", () => ({ mcpFinanceAllowed: vi.fn(async () => false) }));

import {
  checkFieldValue,
  defineField,
  fieldsBriefing,
  invalidateFieldDefinitions,
  mergeExtra,
  retireField,
  validateExtra,
} from "@/lib/field-definitions";
import { patchRecord } from "@/lib/patch-record";
import { undoChanges } from "@/lib/record-changes";
import { callMcpTool, listMcpToolDefs } from "@/lib/mcp/tools";

const seed = (entity: string, key: string, over: Row = {}) => ({
  id: `fd-${key}`,
  entity,
  key,
  label: key,
  type: "number",
  unit: "cm",
  min: 40,
  max: 200,
  options: null,
  description: "Abdomen at the navel line.",
  status: "active",
  createdAt: new Date(++seq),
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.fieldDefinition = [
    seed("measurement", "abdomenCm"),
    seed("food", "confidence", { type: "enum", unit: null, min: null, max: null, options: ["label", "weighed", "estimated", "photo-estimate"], description: "How the numbers were obtained." }),
  ];
  tables.bodyMeasurement = [{ id: "m1", measuredAt: new Date("2026-11-11T01:15:00Z"), waistCm: 97.4, extra: null, fieldSources: {} }];
  invalidateFieldDefinitions();
});

describe("define_field / retire_field", () => {
  it("defines a field, records it, and refuses a second active one", async () => {
    const out = (await defineField(
      { entity: "measurement", key: "armLeftCm", label: "Left arm", type: "number", unit: "cm", min: 15, max: 70, description: "Left upper arm at its widest point." },
      "Tape report has left/right"
    )) as Row;
    expect(out.field).toMatchObject({ entity: "measurement", key: "armLeftCm", status: "active" });
    expect(String(out.note)).toContain("extra.armLeftCm");
    expect(tables.recordChange[0]).toMatchObject({ entity: "field", recordId: "measurement.armLeftCm", field: "_row" });
    expect(await defineField({ entity: "measurement", key: "armLeftCm", label: "x", type: "number", description: "Left upper arm again." }, "x")).toHaveProperty("error");
  });

  it.each<[string, Row]>([
    ["a key that shadows a real column", { key: "waistCm" }],
    ["a key that isn't camelCase", { key: "Arm Left" }],
    ["an unknown type", { type: "colour" }],
    ["an enum without options", { type: "enum" }],
    ["no real description", { description: "arm" }],
    ["an unknown entity", { entity: "finance" }],
  ])("refuses %s", async (_label, over) => {
    const base = { entity: "measurement", key: "armRightCm", label: "Right arm", type: "number", description: "Right upper arm at its widest point." };
    expect(await defineField({ ...base, ...over }, "x")).toHaveProperty("error");
  });

  it("retires without losing values, and comes back when redefined", async () => {
    await retireField({ entity: "measurement", key: "abdomenCm" }, "not needed");
    invalidateFieldDefinitions();
    expect(await validateExtra("measurement", { abdomenCm: 88.4 })).toHaveProperty("error");
    const back = (await defineField(
      { entity: "measurement", key: "abdomenCm", label: "Abdomen", type: "number", unit: "cm", min: 40, max: 200, description: "Abdomen at the navel line." },
      "needed after all"
    )) as Row;
    expect(back.reactivated).toBe(true);
  });

  it("undoing a new definition retires it", async () => {
    const out = (await defineField(
      { entity: "workout", key: "rpe", label: "RPE", type: "integer", min: 1, max: 10, description: "How hard the session felt, 1–10." },
      "x"
    )) as { batchId: string };
    await undoChanges({ batchId: out.batchId });
    expect(tables.fieldDefinition.find((r) => r.key === "rpe")?.status).toBe("retired");
  });
});

describe("values", () => {
  it("are checked against the definition", async () => {
    expect(await validateExtra("measurement", { abdomenCm: 88.4 })).toEqual({ extra: { abdomenCm: 88.4 } });
    expect(await validateExtra("measurement", { abdomenCm: 8 })).toHaveProperty("error");
    expect(await validateExtra("food", { confidence: "label" })).toEqual({ extra: { confidence: "label" } });
    expect(await validateExtra("food", { confidence: "vibes" })).toHaveProperty("error");
    const unknown = (await validateExtra("measurement", { bicepsCm: 37 })) as { error: string };
    expect(unknown.error).toContain("Defined: abdomenCm");
    expect(await validateExtra("measurement", "x")).toHaveProperty("error");
  });

  it("merge, and null clears a key", () => {
    expect(mergeExtra({ a: 1, b: 2 }, { b: null, c: 3 })).toEqual({ a: 1, c: 3 });
    expect(mergeExtra(null, {})).toBeNull();
    expect(checkFieldValue({ entity: "workout", key: "done", label: "x", type: "boolean", unit: null, min: null, max: null, options: null, description: "x", status: "active" }, "yes")).toHaveProperty("error");
  });
});

describe("through the tools", () => {
  it("log_measurement takes a custom field alone, and the read returns it", async () => {
    const out = (await callMcpTool("log_measurement", { measuredAt: "2026-11-12T13:00:00Z", extra: { abdomenCm: 88.4 } })) as Row;
    expect(out).not.toHaveProperty("error");
    const row = tables.bodyMeasurement.find((r) => r.id !== "m1")!;
    expect(row.extra).toEqual({ abdomenCm: 88.4 });
    expect(await callMcpTool("log_measurement", { extra: { bicepsCm: 1 } })).toHaveProperty("error");
  });

  it("log_food refuses the whole meal when one item's field is wrong", async () => {
    const out = await callMcpTool("log_food", {
      items: [
        { mealType: "lunch", foodDescription: "Rice", calories: 260, proteinG: 5, carbsG: 56, fatG: 1, extra: { confidence: "weighed" } },
        { mealType: "lunch", foodDescription: "Beef", calories: 300, proteinG: 40, carbsG: 0, fatG: 12, extra: { confidence: "guess" } },
      ],
    });
    expect(out).toHaveProperty("error");
    expect(tables.foodLog ?? []).toHaveLength(0);
  });

  it("patch_record sets and undoes a custom field", async () => {
    const out = await patchRecord({ entity: "measurement", id: "m1", set: { "extra.abdomenCm": 88.4 }, reason: "From the tape report" });
    if ("error" in out) throw new Error(out.error);
    expect(out.changes).toEqual([{ field: "extra.abdomenCm", before: null, after: 88.4 }]);
    expect(tables.bodyMeasurement[0].extra).toEqual({ abdomenCm: 88.4 });
    await undoChanges({ batchId: out.batchId! });
    expect(tables.bodyMeasurement[0].extra).toBeNull();
    expect(await patchRecord({ entity: "measurement", id: "m1", set: { "extra.nope": 1 }, reason: "x" })).toHaveProperty("error");
  });

  it("the tool list and the briefing describe the fields that exist", async () => {
    const defs = await listMcpToolDefs();
    const meas = defs.find((d) => d.name === "log_measurement")!;
    const extra = (meas.inputSchema as { properties: { extra: { description: string } } }).properties.extra;
    expect(extra.description).toContain("abdomenCm (number cm 40–200): Abdomen at the navel line.");
    const food = defs.find((d) => d.name === "log_food")!;
    expect(JSON.stringify(food.inputSchema)).toContain("confidence (label|weighed|estimated|photo-estimate)");
    expect(await fieldsBriefing()).toContain("food: confidence; measurement: abdomenCm");
  });
});
