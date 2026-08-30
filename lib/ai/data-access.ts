import { compactMeasurement } from "@/lib/body-measurements";
import { prisma } from "@/lib/prisma";
import { executeGetHealthData } from "@/lib/chat-tools";
import { getFinanceReportSummary } from "@/lib/finance/reports";
import { parseReadingRef, readingSpan } from "@/lib/spirit-refs";
import { getUtcDayBoundsForTimeZone } from "@/lib/timezone";
import {
  type DatasetSpec,
  DATASET_KEYS,
  getSpec,
  limitsFor,
} from "@/lib/ai/data-registry";

// Executes one `get_app_data` call. Everything the model can read passes
// through here, so this is where the bounding lives.

/** Tool results are echoed back into `input` on EVERY later turn, so a fat
 *  result is paid for four more times. These caps are about cost, not safety. */
const MAX_PAYLOAD_CHARS = 24_000;
const MAX_STRING_CHARS = 600;
const MAX_ARRAY_ITEMS = 40;

export interface AppDataArgs {
  dataset?: string;
  from?: string;
  to?: string;
  days?: number;
  limit?: number;
  q?: string;
  id?: string;
  ref?: string;
}

export interface AppDataContext {
  timeZone: string;
  todayStr: string;
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Belt-and-braces pass applied to EVERY result, allowlist or not. This is what
 * makes a future careless one-line registry entry safe: even if someone
 * allowlists a base64 column by accident, it never reaches the model.
 */
export function clip(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[binary omitted]";
    if (value.length > MAX_STRING_CHARS) {
      return `${value.slice(0, MAX_STRING_CHARS)}…[+${value.length - MAX_STRING_CHARS} chars]`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth > 4) return `[nested array of ${value.length}]`;
    const head = value.slice(0, MAX_ARRAY_ITEMS).map((v) => clip(v, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? [...head, `…[+${value.length - MAX_ARRAY_ITEMS} more]`]
      : head;
  }
  if (typeof value === "object") {
    if (depth > 4) return "[nested object]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clip(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Halve the row set until it serialises under the cap. */
function fitToBudget(rows: unknown[], extra: Record<string, unknown>) {
  let shown = rows;
  let truncated = false;
  while (
    shown.length > 1 &&
    JSON.stringify({ ...extra, rows: shown }).length > MAX_PAYLOAD_CHARS
  ) {
    shown = shown.slice(0, Math.floor(shown.length / 2));
    truncated = true;
  }
  return truncated
    ? {
        ...extra,
        rows: shown,
        truncated: true,
        note: `Showing ${shown.length} of ${rows.length} fetched rows — narrow with from/to or q, and tell the user the window was partial.`,
      }
    : { ...extra, rows: shown };
}

function buildSelect(spec: DatasetSpec, wantDetail: boolean) {
  const fields = new Set<string>(spec.fields ?? []);
  if (wantDetail) for (const f of spec.detailFields ?? []) fields.add(f);
  const select: Record<string, true> = {};
  for (const f of fields) select[f] = true;
  return select;
}

function buildWhere(
  spec: DatasetSpec,
  args: AppDataArgs,
  ctx: AppDataContext
): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (spec.baseWhere) and.push(spec.baseWhere as Record<string, unknown>);

  if (args.id) return { ...(spec.baseWhere ?? {}), id: args.id };

  // Date window. `dateField` may be a DateTime column or a "YYYY-MM-DD"
  // string column (localDate); both are handled.
  if (spec.dateField) {
    const isStringDay = spec.dateField === "localDate";
    let fromDay = isIsoDay(args.from) ? args.from : null;
    let toDay = isIsoDay(args.to) ? args.to : null;
    if (!fromDay && !toDay && args.days != null) {
      const days = clampInt(args.days, 30, 1, 3650);
      const start = new Date(`${ctx.todayStr}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - (days - 1));
      fromDay = start.toISOString().slice(0, 10);
      toDay = ctx.todayStr;
    }
    if (fromDay || toDay) {
      if (isStringDay) {
        and.push({
          [spec.dateField]: {
            ...(fromDay ? { gte: fromDay } : {}),
            ...(toDay ? { lte: toDay } : {}),
          },
        });
      } else {
        const lo = fromDay
          ? getUtcDayBoundsForTimeZone(fromDay, ctx.timeZone).dayStart
          : null;
        const hi = toDay
          ? getUtcDayBoundsForTimeZone(toDay, ctx.timeZone).dayEnd
          : null;
        and.push({
          [spec.dateField]: {
            ...(lo ? { gte: lo } : {}),
            ...(hi ? { lte: hi } : {}),
          },
        });
      }
    }
  }

  // Passage narrowing: "Judges 4" -> canonical int span.
  if (args.ref && spec.refFields) {
    const segments = parseReadingRef(args.ref);
    const span = segments.length > 0 ? readingSpan(segments) : null;
    if (span) {
      and.push({
        [spec.refFields.start]: { gte: span.refStart, lte: span.refEnd },
      });
    }
  }

  if (args.q && spec.search?.length) {
    and.push({
      OR: spec.search.map((field) => ({
        [field]: { contains: args.q, mode: "insensitive" },
      })),
    });
  }

  return and.length === 0 ? {} : and.length === 1 ? and[0] : { AND: and };
}

type Delegate = {
  findMany: (a: unknown) => Promise<unknown[]>;
  count: (a?: unknown) => Promise<number>;
};

function delegateFor(model: string): Delegate | null {
  const client = prisma as unknown as Record<string, Delegate | undefined>;
  const d = client[model];
  return d && typeof d.findMany === "function" ? d : null;
}

async function runCurated(
  key: string,
  args: AppDataArgs,
  ctx: AppDataContext
): Promise<unknown> {
  switch (key) {
    case "settings": {
      // lib/settings.ts getSettings() is a CLIENT localStorage helper — the
      // server-side source of truth is the singleton row.
      const row = await prisma.userSettings.findUnique({
        where: { id: "default" },
        select: { data: true },
      });
      return { settings: row?.data ?? {} };
    }
    case "finance_summary": {
      // Reuses the exact function the Finances screen calls, so the AI's
      // totals match the screen by construction rather than by luck.
      const summary = await getFinanceReportSummary(new Date());
      return { currency: "COP", note: "Negative amounts are expenses.", summary };
    }
    case "app_digest":
      return buildDigest();
    default:
      // The eight original health branches keep their exact behaviour.
      return executeGetHealthData(
        { query: key, days: args.days, from: args.from, to: args.to },
        ctx.timeZone,
        ctx.todayStr
      );
  }
}

/**
 * Cheap counts-and-latest per area. Exists because the failure mode that
 * started all this is the model concluding "you have no measurements" without
 * looking — one call tells it what exists before it decides nothing does.
 */
async function buildDigest() {
  const pairs: [string, string][] = [
    ["bodyMeasurement", "body_measurements"],
    ["foodLog", "recent_food"],
    ["workoutLog", "recent_workouts"],
    ["waterLog", "water"],
    ["dailyHealthSnapshot", "daily_health"],
    ["todo", "todos"],
    ["journalEntry", "journal"],
    ["habitCheck", "habits"],
    ["spiritNote", "spirit_notes"],
    ["highlight", "spirit_highlights"],
    ["inkPage", "spirit_pages"],
    ["readingLog", "spirit_reading_log"],
    ["memoryVerse", "spirit_memory"],
    ["financialTransaction", "finance_transactions"],
    ["scheduledObligation", "finance_obligations"],
    ["savingsGoal", "finance_goals"],
  ];
  const counts = await Promise.all(
    pairs.map(async ([model, dataset]) => {
      const d = delegateFor(model);
      if (!d) return null;
      try {
        return { dataset, rows: await d.count() };
      } catch {
        return null;
      }
    })
  );
  return {
    note: "Row counts per dataset. Use these to know what exists before saying something is missing.",
    datasets: counts.filter(Boolean),
  };
}

export async function executeAppData(
  args: AppDataArgs,
  ctx: AppDataContext
): Promise<unknown> {
  const key = String(args.dataset ?? "").trim();
  const spec = getSpec(key);

  // Never throw — a throw inside the streaming tool loop kills the whole
  // response. Return a structured error the model can recover from.
  if (!spec) {
    return {
      error: `Unknown dataset "${key}".`,
      availableDatasets: DATASET_KEYS,
    };
  }

  try {
    if (spec.kind === "curated") {
      return clip(await runCurated(spec.key, args, ctx));
    }

    const delegate = spec.model ? delegateFor(spec.model) : null;
    if (!delegate) {
      return { error: `Dataset "${key}" is not readable right now.` };
    }

    const { defaultLimit, maxLimit } = limitsFor(spec);
    const wantDetail = Boolean(args.id);
    const take = wantDetail ? 1 : clampInt(args.limit, defaultLimit, 1, maxLimit);

    const rows = await delegate.findMany({
      where: buildWhere(spec, args, ctx),
      select: buildSelect(spec, wantDetail),
      orderBy: spec.orderBy ?? undefined,
      take,
    });

    // Measurements get the null-dropping treatment so a 23-column row with
    // three readings costs three keys, not twenty-three nulls.
    const shaped =
      spec.model === "bodyMeasurement"
        ? rows.map((r) => compactMeasurement(r as never))
        : rows;

    return fitToBudget(clip(shaped) as unknown[], {
      dataset: spec.key,
      count: rows.length,
    });
  } catch (error) {
    console.error(`get_app_data(${key}) failed:`, error);
    return {
      error: `Could not read "${key}".`,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
