import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DATASET_KEYS,
  EXCLUDED_MODELS,
  FORBIDDEN_FIELDS,
  REGISTRY,
  buildCatalog,
  getSpec,
  limitsFor,
} from "@/lib/ai/data-registry";
import { clip } from "@/lib/ai/data-access";

// The registry is the whole point of the 2026-08-26 change: adding a surface
// to the assistant should be one line. These tests are what make that safe —
// a typo'd model or column would otherwise fail at RUNTIME, inside a chat
// turn, invisibly.

function parseSchemaModels(): Map<string, Set<string>> {
  const schemaPath = fileURLToPath(
    new URL("../prisma/schema.prisma", import.meta.url)
  );
  const schema = readFileSync(schemaPath, "utf8");
  const models = new Map<string, Set<string>>();
  const re = /model (\w+) \{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    const fields = new Set<string>();
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const name = line.split(/\s+/)[0];
      if (name && /^\w+$/.test(name)) fields.add(name);
    }
    models.set(m[1], fields);
  }
  return models;
}

/** Prisma lowercases only the first character to make the delegate name. */
function delegateName(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const SCHEMA = parseSchemaModels();
const BY_DELEGATE = new Map(
  [...SCHEMA.entries()].map(([model, fields]) => [delegateName(model), fields])
);

describe("registry ↔ schema parity", () => {
  it("parses a believable schema", () => {
    expect(SCHEMA.size).toBeGreaterThan(60);
  });

  it("every table spec names a real Prisma model", () => {
    for (const spec of REGISTRY) {
      if (spec.kind !== "table") continue;
      expect(spec.model, `dataset "${spec.key}"`).toBeTruthy();
      expect(
        BY_DELEGATE.has(spec.model!),
        `dataset "${spec.key}" -> unknown model "${spec.model}"`
      ).toBe(true);
    }
  });

  it("every allowlisted column exists on its model", () => {
    for (const spec of REGISTRY) {
      if (spec.kind !== "table") continue;
      const columns = BY_DELEGATE.get(spec.model!)!;
      for (const field of [...(spec.fields ?? []), ...(spec.detailFields ?? [])]) {
        expect(
          columns.has(field),
          `dataset "${spec.key}": "${field}" is not a column on ${spec.model}`
        ).toBe(true);
      }
    }
  });

  it("every date/search/ref/orderBy column exists on its model", () => {
    for (const spec of REGISTRY) {
      if (spec.kind !== "table") continue;
      const columns = BY_DELEGATE.get(spec.model!)!;
      const referenced = [
        ...(spec.dateField ? [spec.dateField] : []),
        ...(spec.search ?? []),
        ...(spec.refFields ? [spec.refFields.start, spec.refFields.end] : []),
        ...Object.keys(spec.orderBy ?? {}),
        ...Object.keys(spec.baseWhere ?? {}),
      ];
      for (const field of referenced) {
        expect(
          columns.has(field),
          `dataset "${spec.key}": referenced column "${field}" missing on ${spec.model}`
        ).toBe(true);
      }
    }
  });

  it("table specs always carry a field allowlist", () => {
    // A missing `select` returns every column — including blobs and secrets.
    for (const spec of REGISTRY) {
      if (spec.kind !== "table") continue;
      expect(spec.fields?.length, `dataset "${spec.key}"`).toBeGreaterThan(0);
    }
  });
});

describe("exclusions", () => {
  it("no excluded model is reachable", () => {
    const registered = new Set(
      REGISTRY.filter((s) => s.model).map((s) => s.model!)
    );
    for (const model of EXCLUDED_MODELS) {
      expect(registered.has(model), `"${model}" must stay unreachable`).toBe(false);
    }
  });

  it("no allowlist contains a blob or secret column", () => {
    for (const spec of REGISTRY) {
      for (const field of [...(spec.fields ?? []), ...(spec.detailFields ?? [])]) {
        expect(
          FORBIDDEN_FIELDS.includes(field as never),
          `dataset "${spec.key}" exposes forbidden column "${field}"`
        ).toBe(false);
      }
    }
  });

  it("ink pages expose recognised text but never strokes", () => {
    const spec = getSpec("spirit_pages")!;
    const all = [...(spec.fields ?? []), ...(spec.detailFields ?? [])];
    expect(all).toContain("textLayer");
    expect(all).not.toContain("strokes");
    expect(all).not.toContain("objects");
    expect(all).not.toContain("thumbnail");
  });

  it("progress photos and journal never expose their base64", () => {
    for (const key of ["progress_photos", "journal"]) {
      const spec = getSpec(key)!;
      const all = [...(spec.fields ?? []), ...(spec.detailFields ?? [])];
      expect(all).not.toContain("imageData");
      expect(all).not.toContain("photoData");
    }
  });

  it("hymns expose their words but never the sheet photo", () => {
    const spec = REGISTRY.find((s) => s.key === "spirit_hymns")!;
    expect(spec).toBeTruthy();
    const all = [...(spec.fields ?? []), ...(spec.detailFields ?? [])];
    expect(all).toContain("body");
    expect(all).not.toContain("photoData");
  });
});

describe("catalog", () => {
  it("keys are unique", () => {
    expect(new Set(DATASET_KEYS).size).toBe(DATASET_KEYS.length);
  });

  it("every key appears in the catalog the model reads", () => {
    const catalog = buildCatalog();
    for (const key of DATASET_KEYS) {
      expect(catalog).toContain(key);
    }
    expect(catalog.split("\n")).toHaveLength(DATASET_KEYS.length);
  });

  it("covers the surfaces he asked for", () => {
    // "our AI should chat and have access to essentially everything"
    for (const key of [
      "body_measurements", "spirit_notes", "spirit_pages", "todos",
      "journal", "habits", "daily_health", "finance_transactions",
      "finance_summary",
    ]) {
      expect(DATASET_KEYS).toContain(key);
    }
  });

  it("gives every dataset a non-empty summary", () => {
    for (const spec of REGISTRY) {
      expect(spec.summary.length, `dataset "${spec.key}"`).toBeGreaterThan(5);
    }
  });
});

describe("limits", () => {
  it("every dataset has a bounded max", () => {
    for (const spec of REGISTRY) {
      const { defaultLimit, maxLimit } = limitsFor(spec);
      expect(defaultLimit).toBeGreaterThan(0);
      expect(maxLimit).toBeGreaterThanOrEqual(defaultLimit);
      expect(maxLimit).toBeLessThanOrEqual(500);
    }
  });
});

describe("clip", () => {
  it("replaces base64 payloads", () => {
    expect(clip("data:image/png;base64,AAAA")).toBe("[binary omitted]");
  });

  it("truncates a long string and says by how much", () => {
    const out = clip("x".repeat(5000)) as string;
    expect(out.length).toBeLessThan(700);
    expect(out).toContain("+4400 chars");
  });

  it("caps long arrays", () => {
    const out = clip(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(out).toHaveLength(41);
    expect(out[40]).toBe("…[+60 more]");
  });

  it("walks nested objects and arrays", () => {
    const out = clip({ a: { b: ["data:xyz", "ok"] } }) as {
      a: { b: string[] };
    };
    expect(out.a.b[0]).toBe("[binary omitted]");
    expect(out.a.b[1]).toBe("ok");
  });

  it("preserves zero, false and null rather than dropping them", () => {
    expect(clip({ n: 0, f: false, z: null })).toEqual({ n: 0, f: false, z: null });
  });

  it("serialises dates", () => {
    expect(clip(new Date("2026-08-26T00:00:00Z"))).toBe("2026-08-26T00:00:00.000Z");
  });
});
