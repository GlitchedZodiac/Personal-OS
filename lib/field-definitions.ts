// Fields Claude can add (2026-11-12, MCP v2 Phase B; gaps #10, #11).
//
// A new thing to record — abdomen, left and right arm, how a food number
// was obtained — used to need a database migration and a release. Now Claude
// defines the field in conversation: entity, key, type, unit, range and what
// it means. Values live in that record's `extra` JSON, are checked against
// the definition on every write, come back on every read, and the active
// definitions are written into the tool descriptions and the connector's
// briefing so every later Claude session knows they exist.
//
// Retiring a field hides it from the descriptions but keeps every stored
// value. When the app ever needs to chart one, it is promoted to a real
// column — that needs a design first (docs/mcp-v2-spec.md §7.5).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordChanges, registerUndoHandler, type ChangeInput } from "@/lib/record-changes";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

export type FieldEntity = "food" | "measurement" | "workout";
export const FIELD_ENTITIES: FieldEntity[] = ["food", "measurement", "workout"];
export type FieldType = "number" | "integer" | "text" | "enum" | "boolean";
export const FIELD_TYPES: FieldType[] = ["number", "integer", "text", "enum", "boolean"];

const MODEL_OF: Record<FieldEntity, string> = { food: "FoodLog", measurement: "BodyMeasurement", workout: "WorkoutLog" };
const KEY_RE = /^[a-z][a-zA-Z0-9]{1,40}$/;
export const MAX_TEXT = 500;
export const MAX_FIELDS_PER_ENTITY = 40;

export interface FieldDef {
  entity: FieldEntity;
  key: string;
  label: string;
  type: FieldType;
  unit: string | null;
  min: number | null;
  max: number | null;
  options: string[] | null;
  description: string;
  status: "active" | "retired";
}

// ── Loading (short TTL, like the exercise index) ──────────────────────────

const TTL_MS = 15_000;
let cache: { at: number; defs: FieldDef[] } | null = null;

export function invalidateFieldDefinitions() {
  cache = null;
}

function toDef(r: Json): FieldDef {
  return {
    entity: r.entity as FieldEntity,
    key: r.key as string,
    label: r.label as string,
    type: r.type as FieldType,
    unit: (r.unit as string | null) ?? null,
    min: typeof r.min === "number" ? r.min : null,
    max: typeof r.max === "number" ? r.max : null,
    options: Array.isArray(r.options) ? (r.options as string[]) : null,
    description: r.description as string,
    status: r.status === "retired" ? "retired" : "active",
  };
}

export async function loadFieldDefinitions(force = false): Promise<FieldDef[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.defs;
  const rows = await prisma.fieldDefinition.findMany({ orderBy: [{ entity: "asc" }, { createdAt: "asc" }] });
  const defs = rows.map((r) => toDef(r as unknown as Json));
  cache = { at: Date.now(), defs };
  return defs;
}

export async function activeFields(entity: FieldEntity): Promise<FieldDef[]> {
  return (await loadFieldDefinitions()).filter((d) => d.entity === entity && d.status === "active");
}

/** Real columns of the entity's table — a field key may never shadow one. */
export function columnsOf(entity: FieldEntity): string[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === MODEL_OF[entity]);
  return model ? model.fields.map((f) => f.name) : [];
}

// ── Values ─────────────────────────────────────────────────────────────────

export function checkFieldValue(def: FieldDef, value: unknown): { value: unknown } | { error: string } {
  const label = `${def.entity}.${def.key}`;
  if (value === null) return { value: null };
  switch (def.type) {
    case "number":
    case "integer": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return { error: `${label} must be a number${def.unit ? ` in ${def.unit}` : ""}` };
      if ((def.min != null && n < def.min) || (def.max != null && n > def.max)) {
        return { error: `${label} must be between ${def.min ?? "−∞"} and ${def.max ?? "∞"}${def.unit ? ` ${def.unit}` : ""}` };
      }
      return { value: def.type === "integer" ? Math.round(n) : Math.round(n * 100) / 100 };
    }
    case "text":
      if (typeof value !== "string" || value.trim().length === 0) return { error: `${label} must be text` };
      if (value.length > MAX_TEXT) return { error: `${label} is longer than ${MAX_TEXT} characters` };
      return { value: value.trim() };
    case "enum":
      return typeof value === "string" && (def.options ?? []).includes(value)
        ? { value }
        : { error: `${label} must be one of ${(def.options ?? []).join(", ")}` };
    case "boolean":
      return typeof value === "boolean" ? { value } : { error: `${label} must be true or false` };
  }
}

/**
 * Check an `extra` object against the active definitions. Unknown or retired
 * keys are refused with the list of what exists — never stored silently.
 * `null` for a key clears it. Returns the cleaned object (keys with values).
 */
export async function validateExtra(
  entity: FieldEntity,
  extra: unknown
): Promise<{ extra: Json } | { error: string }> {
  if (extra === undefined) return { extra: {} };
  if (!isObj(extra)) return { error: "extra must be an object of field → value" };
  const defs = await activeFields(entity);
  const out: Json = {};
  for (const [key, value] of Object.entries(extra)) {
    const def = defs.find((d) => d.key === key);
    if (!def) {
      return {
        error: `"${key}" is not a ${entity} field. Defined: ${defs.map((d) => d.key).join(", ") || "none"} — define_field adds one.`,
      };
    }
    const checked = checkFieldValue(def, value);
    if ("error" in checked) return checked;
    out[key] = checked.value;
  }
  return { extra: out };
}

/** Merge validated values into a row's stored extra (null clears a key). */
export function mergeExtra(stored: unknown, patch: Json): Json | null {
  const next: Json = { ...(isObj(stored) ? stored : {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length ? next : null;
}

export const extraForDb = (extra: Json | null) =>
  extra == null ? Prisma.DbNull : (extra as Prisma.InputJsonValue);

// ── define_field / retire_field ────────────────────────────────────────────

export async function defineField(input: Json, reason: string) {
  const entity = input.entity as FieldEntity;
  if (!FIELD_ENTITIES.includes(entity)) return { error: `entity must be one of ${FIELD_ENTITIES.join(", ")}` };
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!KEY_RE.test(key)) return { error: "key must be camelCase letters and digits, 2–41 characters, e.g. abdomenCm" };
  if (columnsOf(entity).includes(key)) return { error: `${key} is already a built-in ${entity} column — use it directly` };
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > 60) return { error: "label is required (≤ 60 characters)" };
  const type = input.type as FieldType;
  if (!FIELD_TYPES.includes(type)) return { error: `type must be one of ${FIELD_TYPES.join(", ")}` };
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 10 || description.length > 400) {
    return { error: "description must say what the field means and how it's measured (10–400 characters)" };
  }
  const unit = typeof input.unit === "string" && input.unit.trim() ? input.unit.trim().slice(0, 20) : null;
  const min = typeof input.min === "number" && Number.isFinite(input.min) ? input.min : null;
  const max = typeof input.max === "number" && Number.isFinite(input.max) ? input.max : null;
  if (min != null && max != null && min > max) return { error: "min is above max" };
  let options: string[] | null = null;
  if (type === "enum") {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 20 ||
        !input.options.every((o) => typeof o === "string" && o.trim() && o.length <= 40)) {
      return { error: "an enum needs 2–20 options (short words)" };
    }
    options = [...new Set((input.options as string[]).map((o) => o.trim()))];
  }

  const existing = await prisma.fieldDefinition.findUnique({ where: { entity_key: { entity, key } } });
  if (existing && existing.status === "active") {
    return { error: `${entity}.${key} already exists — retire it first to redefine it` };
  }
  const active = (await loadFieldDefinitions(true)).filter((d) => d.entity === entity && d.status === "active");
  if (!existing && active.length >= MAX_FIELDS_PER_ENTITY) {
    return { error: `${entity} already has ${MAX_FIELDS_PER_ENTITY} custom fields — retire one first` };
  }

  const data = {
    label,
    type,
    unit,
    min,
    max,
    options: options ? (options as Prisma.InputJsonValue) : Prisma.DbNull,
    description,
    status: "active",
  };
  const before = existing ? toDef(existing as unknown as Json) : null;
  const row = existing
    ? await prisma.fieldDefinition.update({ where: { entity_key: { entity, key } }, data })
    : await prisma.fieldDefinition.create({ data: { entity, key, ...data, createdVia: "mcp" } });
  invalidateFieldDefinitions();
  const after = toDef(row as unknown as Json);
  const batchId = await recordChanges(
    [{ entity: "field", recordId: `${entity}.${key}`, field: "_row", before, after }],
    { reason, via: "mcp" }
  );
  return {
    field: after,
    reactivated: Boolean(existing),
    batchId,
    note: `Usable now: send it as extra.${key} on ${entity === "food" ? "log_food items" : entity === "measurement" ? "log_measurement" : "log_workout"} or patch_record { set: { "extra.${key}": … } }. Tool descriptions list it from the next session.`,
  };
}

export async function retireField(input: Json, reason: string) {
  const entity = input.entity as FieldEntity;
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const row = FIELD_ENTITIES.includes(entity) && key
    ? await prisma.fieldDefinition.findUnique({ where: { entity_key: { entity, key } } })
    : null;
  if (!row) return { error: `No ${entity ?? ""} field "${key}" — query_data field_definitions lists them` };
  if (row.status === "retired") return { field: toDef(row as unknown as Json), note: "Already retired." };
  const before = toDef(row as unknown as Json);
  const updated = await prisma.fieldDefinition.update({ where: { entity_key: { entity, key } }, data: { status: "retired" } });
  invalidateFieldDefinitions();
  const after = toDef(updated as unknown as Json);
  const batchId = await recordChanges(
    [{ entity: "field", recordId: `${entity}.${key}`, field: "_row", before, after }],
    { reason, via: "mcp" }
  );
  return { field: after, batchId, note: "Hidden from the tools; every stored value is kept. define_field with the same key brings it back." };
}

// ── For tool descriptions and the briefing ────────────────────────────────

function describe(d: FieldDef): string {
  const shape =
    d.type === "enum"
      ? (d.options ?? []).join("|")
      : `${d.type}${d.unit ? ` ${d.unit}` : ""}${d.min != null || d.max != null ? ` ${d.min ?? ""}–${d.max ?? ""}` : ""}`;
  return `${d.key} (${shape}): ${d.description}`;
}

/** One paragraph per entity, for the `extra` property of a write tool. */
export async function extraDescription(entity: FieldEntity): Promise<string> {
  const defs = await activeFields(entity);
  if (defs.length === 0) return "Custom fields Claude defined (define_field). None yet for this kind of record.";
  return `Custom fields — send only what was measured, never zero-fill: ${defs.map(describe).join(" · ")}`;
}

export async function fieldsBriefing(): Promise<string | null> {
  const defs = (await loadFieldDefinitions()).filter((d) => d.status === "active");
  if (defs.length === 0) return null;
  const by = (e: FieldEntity) => defs.filter((d) => d.entity === e).map((d) => d.key);
  const parts = FIELD_ENTITIES.map((e) => (by(e).length ? `${e}: ${by(e).join(", ")}` : null)).filter(Boolean);
  return `Custom fields he records through extra (define_field adds more, each with its meaning and unit) — ${parts.join("; ")}.`;
}

// ── Undo of define/retire ──────────────────────────────────────────────────

registerUndoHandler("field", {
  async read(recordId) {
    const [entity, key] = recordId.split(".");
    const row = await prisma.fieldDefinition.findUnique({ where: { entity_key: { entity, key } } });
    return { _row: row ? toDef(row as unknown as Json) : null };
  },
  async write(recordId, values) {
    const [entity, key] = recordId.split(".");
    const v = values._row as FieldDef | null;
    if (v == null) {
      // Undoing a brand-new definition retires it rather than deleting, so
      // any values written in between keep their meaning.
      await prisma.fieldDefinition.update({ where: { entity_key: { entity, key } }, data: { status: "retired" } }).catch(() => null);
    } else {
      const data = {
        label: v.label,
        type: v.type,
        unit: v.unit,
        min: v.min,
        max: v.max,
        options: v.options ? (v.options as Prisma.InputJsonValue) : Prisma.DbNull,
        description: v.description,
        status: v.status,
      };
      await prisma.fieldDefinition.upsert({
        where: { entity_key: { entity, key } },
        create: { entity, key, ...data },
        update: data,
      });
    }
    invalidateFieldDefinitions();
  },
});

export type { ChangeInput };
