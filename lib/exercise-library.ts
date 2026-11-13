// The exercise library Claude curates (2026-11-12, MCP v2 Phase C; gaps #1,
// #4, and Michael's "explain it so the library gets built").
//
// Movements were matched silently and minted only as a side effect of
// creating a routine, so a mismatch ("Seated Dumbbell Shoulder Press" →
// barbell Overhead Press) poisoned PRs where nobody looked, and a new
// movement was a bare name with no context. Now:
//   - every log says what each name was matched to (mapForLog), and an
//     unknown name is minted as a new movement flagged needsProfile;
//   - upsert_exercise adds/renames a movement, its aliases, its load type
//     (bodyweight → handle bells don't count) and its profile — what the
//     movement is, which Claude writes from its own knowledge or a search;
//   - merge_exercises folds a duplicate into another, history and routines
//     included; renormalize_history re-matches old rows with today's rules.
// Every change is recorded in record_changes and can be undone.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  allExercises,
  getExerciseById,
  guessCategory,
  isBuiltInExercise,
  matchExerciseName,
  foldExerciseName,
  findExerciseByExactName,
  type ExerciseCategory,
  type ExerciseDef,
  type ExerciseLoad,
} from "@/lib/exercises";
import { readProfile, validateProfile, type ExerciseProfile } from "@/lib/exercise-profile";
import { createUserExercise, ensureUserExercisesLoaded, invalidateUserExercises } from "@/lib/user-exercises";
import { rebuildPersonalRecords } from "@/lib/prs";
import { recordChanges, registerUndoHandler, type ChangeInput } from "@/lib/record-changes";
import { stampExercisesEdited } from "@/lib/workout-resync";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const CATEGORIES: ExerciseCategory[] = ["kettlebell", "barbell", "dumbbell", "bodyweight", "machine", "cardio", "other"];

const brief = (d: ExerciseDef) => ({
  id: d.id,
  name: d.name,
  category: d.category,
  load: d.load ?? (d.category === "bodyweight" ? "bodyweight" : "external"),
});

// ── What a log was matched to ──────────────────────────────────────────────

export interface MappedEntry {
  input: string;
  to: ReturnType<typeof brief> | null;
  how: "exact" | "contains" | "minted" | "none";
  needsProfile?: true;
}

/**
 * Resolve one logged name: an existing movement, or a newly minted one
 * (category guessed from the equipment in the name). Never a silent guess —
 * the guarded matcher refuses look-alikes, and the receipt says which.
 */
export async function mapForLog(raw: string): Promise<{ def: ExerciseDef | null; mapped: MappedEntry }> {
  const hit = matchExerciseName(raw);
  if (hit) {
    return {
      def: hit.def,
      mapped: {
        input: raw,
        to: brief(hit.def),
        how: hit.how,
        ...(hit.def.isCustom && !hit.def.profile ? { needsProfile: true as const } : {}),
      },
    };
  }
  const minted = await createUserExercise({ name: raw, category: guessCategory(raw) });
  if (!minted.ok) return { def: null, mapped: { input: raw, to: null, how: "none" } };
  return {
    def: minted.def,
    mapped: {
      input: raw,
      to: brief(minted.def),
      how: minted.created ? "minted" : "exact",
      ...(minted.def.profile ? {} : { needsProfile: true as const }),
    },
  };
}

// ── Reading the library ────────────────────────────────────────────────────

export async function listExercises(args: { q?: string; id?: string; limit?: number }) {
  await ensureUserExercisesLoaded(true);
  const counts = await usageCounts();
  let defs = allExercises();
  if (args.id) defs = defs.filter((d) => d.id === args.id);
  if (args.q) {
    const q = foldExerciseName(args.q);
    defs = defs.filter((d) => [d.name, d.id, ...d.aliases].some((k) => foldExerciseName(k).includes(q)));
  }
  const rows = defs
    .map((d) => ({
      ...brief(d),
      aliases: d.aliases,
      builtin: isBuiltInExercise(d.id),
      timesLogged: counts.get(d.id) ?? 0,
      profileMissing: !d.profile,
      ...(args.id || args.q ? { profile: d.profile ?? null } : { pattern: d.profile?.pattern ?? null }),
    }))
    .sort((a, b) => b.timesLogged - a.timesLogged || a.name.localeCompare(b.name));
  const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 200);
  return {
    count: rows.length,
    exercises: rows.slice(0, limit),
    note: "profile is what the movement is (how it's done, pattern, muscles, equipment, variantOf, source). Ask by id or q to see it in full; profileMissing means nobody has explained it yet — upsert_exercise with a profile fills it.",
  };
}

/** How many logged sets point at each movement id (stored id first, else the name). */
async function usageCounts(): Promise<Map<string, number>> {
  const rows = await prisma.workoutLog.findMany({
    where: { exercises: { not: Prisma.AnyNull } },
    select: { exercises: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!Array.isArray(r.exercises)) continue;
    for (const e of r.exercises as Json[]) {
      const id =
        typeof e?.exercise === "string"
          ? e.exercise
          : typeof e?.name === "string"
            ? matchExerciseName(e.name)?.def.id
            : undefined;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Custom movements nobody has explained yet, most-used first (for the briefing). */
export async function profileGaps(max = 10): Promise<{ count: number; names: string[] }> {
  await ensureUserExercisesLoaded();
  const missing = allExercises().filter((d) => d.isCustom && !d.profile);
  return { count: missing.length, names: missing.slice(0, max).map((d) => d.name) };
}

// ── upsert_exercise ────────────────────────────────────────────────────────

export interface UpsertInput {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  load?: unknown;
  aliases?: unknown;
  profile?: unknown;
  reason: string;
}

type RowSnapshot = { slug: string; name: string; category: string; aliases: string[]; load: string | null; profile: unknown };

async function snapshot(slug: string): Promise<RowSnapshot | null> {
  const r = await prisma.userExercise.findUnique({ where: { slug } });
  if (!r) return null;
  return {
    slug: r.slug,
    name: r.name,
    category: r.category,
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    load: r.load ?? null,
    profile: r.profile ?? null,
  };
}

export async function upsertExercise(input: UpsertInput) {
  await ensureUserExercisesLoaded(true);
  const changes: ChangeInput[] = [];
  const warnings: string[] = [];

  // 1. Which movement.
  let def: ExerciseDef | null = null;
  let created = false;
  const idArg = typeof input.id === "string" ? input.id.trim() : "";
  const nameArg = typeof input.name === "string" ? input.name.trim() : "";
  if (idArg) {
    def = getExerciseById(idArg);
    if (!def) return { error: `No movement with id "${idArg}" — query_data exercises lists them` };
  } else {
    if (!nameArg) return { error: "Give the id of an existing movement, or a name for a new one" };
    const existing = findExerciseByExactName(nameArg);
    if (existing) def = existing;
    else {
      const category = CATEGORIES.includes(input.category as ExerciseCategory)
        ? (input.category as ExerciseCategory)
        : guessCategory(nameArg);
      const minted = await createUserExercise({ name: nameArg, category });
      if (!minted.ok) return { error: minted.error };
      def = minted.def;
      created = minted.created;
      if (created) {
        changes.push({ entity: "exercise", recordId: def.id, field: "_row", before: null, after: await snapshot(def.id) });
      }
    }
  }
  const builtin = isBuiltInExercise(def.id);

  // 2. What changes.
  const before = await snapshot(def.id);
  // A copy — `before` must stay as it was for the diff below.
  const next: RowSnapshot = before
    ? { ...before, aliases: [...before.aliases] }
    : { slug: def.id, name: def.name, category: def.category, aliases: [], load: null, profile: null };

  if (nameArg && idArg && foldExerciseName(nameArg) !== foldExerciseName(def.name)) {
    if (builtin) return { error: `${def.name} is a built-in movement — its name stays; add the new name as an alias instead` };
    const clash = findExerciseByExactName(nameArg);
    if (clash && clash.id !== def.id) return { error: `"${nameArg}" is already ${clash.name} (${clash.id})` };
    // Old rows still say the old name; keep it resolving here.
    next.aliases = [...next.aliases, next.name];
    next.name = nameArg;
  }
  if (input.category !== undefined && idArg) {
    if (!CATEGORIES.includes(input.category as ExerciseCategory)) return { error: `category must be one of ${CATEGORIES.join(", ")}` };
    if (builtin && input.category !== def.category) return { error: `${def.name} is a built-in movement — its category stays ${def.category}` };
    next.category = input.category as string;
  }
  if (input.load !== undefined) {
    if (input.load !== null && input.load !== "bodyweight" && input.load !== "external") {
      return { error: 'load must be "bodyweight" (the body is the load; only a vest adds) or "external" (the implement is the load)' };
    }
    next.load = input.load as ExerciseLoad | null;
  }
  if (input.aliases !== undefined) {
    if (!isObj(input.aliases)) return { error: "aliases must be { add?: [...], remove?: [...] }" };
    const add = Array.isArray(input.aliases.add) ? input.aliases.add : [];
    const remove = Array.isArray(input.aliases.remove) ? input.aliases.remove : [];
    if (add.length + remove.length > 20) return { error: "At most 20 alias changes at once" };
    const removeKeys = new Set(remove.filter((a): a is string => typeof a === "string").map(foldExerciseName));
    let aliases = next.aliases.filter((a) => !removeKeys.has(foldExerciseName(a)));
    for (const raw of add) {
      if (typeof raw !== "string" || !raw.trim() || raw.length > 60) return { error: "Each alias must be a short name (≤ 60 characters)" };
      const key = foldExerciseName(raw);
      const owner = findExerciseByExactName(raw);
      if (owner && owner.id !== def.id) return { error: `"${raw}" already means ${owner.name} (${owner.id}) — merge_exercises if they are the same movement` };
      if (owner?.id === def.id && !aliases.some((a) => foldExerciseName(a) === key)) {
        // Already resolves here through the catalog itself — nothing to add.
        continue;
      }
      if (!aliases.some((a) => foldExerciseName(a) === key)) aliases.push(raw.trim());
    }
    aliases = aliases.filter((a) => foldExerciseName(a) !== foldExerciseName(next.name));
    next.aliases = aliases;
  }
  if (input.profile !== undefined) {
    if (input.profile === null) next.profile = null;
    else {
      const checked = validateProfile(input.profile, { exists: (id) => !!getExerciseById(id), selfId: def.id });
      if ("error" in checked) return checked;
      next.profile = checked.profile;
    }
  }

  // 3. Write.
  const fields: (keyof RowSnapshot)[] = ["name", "category", "aliases", "load", "profile"];
  const base = before ?? (builtin ? { ...next, aliases: [], load: null, profile: null } : next);
  for (const f of fields) {
    const a = JSON.stringify(base[f] ?? null);
    const b = JSON.stringify(next[f] ?? null);
    if (a !== b) {
      changes.push({ entity: "exercise", recordId: def.id, field: f, before: base[f] ?? null, after: next[f] ?? null });
    }
  }
  const fieldChanges = changes.filter((c) => c.field !== "_row");
  if (fieldChanges.length === 0 && !created) {
    return { exercise: { ...brief(def), aliases: def.aliases, profile: def.profile ?? null }, changes: [], note: "Nothing changed." };
  }
  if (fieldChanges.length) {
    const data = {
      name: next.name,
      category: next.category,
      aliases: next.aliases,
      load: next.load,
      profile: next.profile == null ? Prisma.DbNull : (next.profile as Prisma.InputJsonValue),
    };
    await prisma.userExercise.upsert({
      where: { slug: def.id },
      create: { slug: def.id, ...data },
      update: data,
    });
    if (!before && builtin) {
      changes.push({ entity: "exercise", recordId: def.id, field: "_row", before: null, after: { ...next } });
    }
  }
  invalidateUserExercises();
  await ensureUserExercisesLoaded(true);
  const batchId = await recordChanges(changes, { reason: input.reason, via: "mcp" });

  const rebuilt: string[] = [];
  if (changes.some((c) => c.field === "load" || c.field === "aliases" || c.field === "name")) {
    try {
      await rebuildPersonalRecords();
      rebuilt.push("personal_records");
    } catch {
      warnings.push("Saved, but the PR table could not be rebuilt just now.");
    }
  }
  const after = getExerciseById(def.id)!;
  return {
    exercise: { ...brief(after), aliases: after.aliases, builtin, profile: after.profile ?? null },
    created,
    changes: changes.filter((c) => c.field !== "_row").map((c) => ({ field: c.field, before: c.before, after: c.after })),
    batchId,
    ...(rebuilt.length ? { rebuilt } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(after.profile ? {} : { needsProfile: true }),
  };
}

// ── merge_exercises ────────────────────────────────────────────────────────

/**
 * Rewrite one movement list: every row of `from` becomes `into`. Routine
 * steps (`steps: true`) only change their `exercise` id (and `name` when the
 * step has one) — the watch reads that shape, so no keys are added there.
 */
export function remapExercises(
  exercises: unknown,
  from: string,
  into: ExerciseDef,
  opts: { steps?: boolean } = {}
): { list: Json[]; touched: number } | null {
  if (!Array.isArray(exercises)) return null;
  let touched = 0;
  const list = (exercises as Json[]).map((e) => {
    if (!isObj(e)) return e;
    const label = typeof e.name === "string" ? e.name : typeof e.exerciseName === "string" ? e.exerciseName : undefined;
    const id = typeof e.exercise === "string" ? e.exercise : label ? matchExerciseName(label)?.def.id : undefined;
    if (id !== from) return e;
    touched++;
    if (opts.steps) {
      return { ...e, exercise: into.id, ...("name" in e ? { name: into.name } : {}), ...("exerciseName" in e ? { exerciseName: into.name } : {}) };
    }
    const rawName = typeof e.rawName === "string" ? e.rawName : label;
    return { ...e, name: into.name, exercise: into.id, ...(rawName && rawName !== into.name ? { rawName } : {}) };
  });
  return touched ? { list, touched } : null;
}

export async function mergeExercises(input: { from?: unknown; into?: unknown; dryRun?: boolean; reason: string }) {
  await ensureUserExercisesLoaded(true);
  const fromId = typeof input.from === "string" ? input.from.trim() : "";
  const intoId = typeof input.into === "string" ? input.into.trim() : "";
  const from = fromId ? getExerciseById(fromId) : null;
  const into = intoId ? getExerciseById(intoId) : null;
  if (!from || !into) return { error: "from and into must both be movement ids — query_data exercises lists them" };
  if (from.id === into.id) return { error: "from and into are the same movement" };
  if (isBuiltInExercise(from.id)) {
    return { error: `${from.name} is built in and can't be merged away. Merge the other way, or add an alias.` };
  }

  const workouts = await prisma.workoutLog.findMany({
    where: { exercises: { not: Prisma.AnyNull } },
    select: { id: true, startedAt: true, exercises: true, metricsData: true },
  });
  const routineRows = await prisma.sequence.findMany({ select: { id: true, name: true, steps: true } });
  const workoutHits = workouts
    .map((w) => ({ w, remap: remapExercises(w.exercises, from.id, into) }))
    .filter((x) => x.remap);
  const routineHits = routineRows
    .map((r) => ({ r, remap: remapExercises(r.steps, from.id, into, { steps: true }) }))
    .filter((x) => x.remap);

  const summary = {
    from: brief(from),
    into: brief(into),
    workouts: workoutHits.map((x) => ({ id: x.w.id, date: x.w.startedAt.toISOString().slice(0, 10), rows: x.remap!.touched })),
    routines: routineHits.map((x) => ({ id: x.r.id, name: x.r.name, steps: x.remap!.touched })),
  };
  if (input.dryRun) return { dryRun: true, ...summary };

  const changes: ChangeInput[] = [];
  for (const { w, remap } of workoutHits) {
    const before = w.exercises; // captured before the write replaces it
    await prisma.workoutLog.update({
      where: { id: w.id },
      data: {
        exercises: remap!.list as Prisma.InputJsonValue,
        metricsData: stampExercisesEdited(w.metricsData) as Prisma.InputJsonValue,
      },
    });
    changes.push({ entity: "workout", recordId: w.id, field: "exercises", before, after: remap!.list });
  }
  for (const { r, remap } of routineHits) {
    const before = r.steps;
    await prisma.sequence.update({ where: { id: r.id }, data: { steps: remap!.list as Prisma.InputJsonValue } });
    changes.push({ entity: "routine", recordId: r.id, field: "steps", before, after: remap!.list });
  }

  // The merged-away names keep resolving — to `into` now.
  const fromRow = await snapshot(from.id);
  if (fromRow) {
    await prisma.userExercise.delete({ where: { slug: from.id } });
    changes.push({ entity: "exercise", recordId: from.id, field: "_row", before: fromRow, after: null });
  }
  invalidateUserExercises();
  await ensureUserExercisesLoaded(true);
  const intoBefore = await snapshot(into.id);
  const extra = [from.name, ...from.aliases].filter((a) => !findExerciseByExactName(a));
  if (extra.length) {
    const aliases = [...(intoBefore?.aliases ?? []), ...extra];
    await prisma.userExercise.upsert({
      where: { slug: into.id },
      create: { slug: into.id, name: into.name, category: into.category, aliases },
      update: { aliases },
    });
    if (intoBefore) {
      changes.push({ entity: "exercise", recordId: into.id, field: "aliases", before: intoBefore.aliases, after: aliases });
    } else {
      changes.push({ entity: "exercise", recordId: into.id, field: "_row", before: null, after: { slug: into.id, name: into.name, category: into.category, aliases, load: null, profile: null } });
    }
    invalidateUserExercises();
    await ensureUserExercisesLoaded(true);
  }
  const batchId = await recordChanges(changes, { reason: input.reason, via: "mcp" });
  await rebuildPersonalRecords().catch(() => null);
  return { dryRun: false, ...summary, batchId, rebuilt: ["personal_records"] };
}

// ── renormalize_history ────────────────────────────────────────────────────

export async function renormalizeHistory(input: { dryRun?: boolean; from?: unknown; to?: unknown; reason: string }) {
  await ensureUserExercisesLoaded(true);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
  const from = day(input.from);
  const to = day(input.to);
  const workouts = await prisma.workoutLog.findMany({
    where: {
      exercises: { not: Prisma.AnyNull },
      ...(from || to ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: new Date(to.getTime() + 86_400_000) } : {}) } } : {}),
    },
    select: { id: true, startedAt: true, exercises: true, metricsData: true },
  });

  const proposals: { workoutId: string; date: string; name: string; from: string | null; to: string | null }[] = [];
  const unmatched = new Set<string>();
  const rewrites: { id: string; before: unknown; after: Json[]; metricsData: unknown }[] = [];
  for (const w of workouts) {
    // Lists he fixed by hand are his, not the matcher's.
    if (isObj(w.metricsData) && typeof w.metricsData.exercisesEditedAt === "string") continue;
    if (!Array.isArray(w.exercises)) continue;
    let changed = false;
    const list = (w.exercises as Json[]).map((e) => {
      if (!isObj(e) || typeof e.name !== "string") return e;
      if (e.exercise === "jump-rope") return e;
      const raw = typeof e.rawName === "string" ? e.rawName : e.name;
      const now = matchExerciseName(raw)?.def.id ?? null;
      const was = typeof e.exercise === "string" ? e.exercise : null;
      if (now === was) return e;
      if (!now) unmatched.add(raw);
      proposals.push({ workoutId: w.id, date: w.startedAt.toISOString().slice(0, 10), name: raw, from: was, to: now });
      changed = true;
      const next: Json = { ...e };
      if (now) next.exercise = now;
      else delete next.exercise;
      return next;
    });
    if (changed) rewrites.push({ id: w.id, before: w.exercises, after: list, metricsData: w.metricsData });
  }
  const result = {
    proposals,
    unmatched: [...unmatched],
    note: unmatched.size
      ? "Names that match nothing now lose their id (no PRs) — create them with upsert_exercise, then run this again."
      : undefined,
  };
  if (input.dryRun !== false) return { dryRun: true, ...result };

  const changes: ChangeInput[] = [];
  for (const r of rewrites) {
    await prisma.workoutLog.update({ where: { id: r.id }, data: { exercises: r.after as Prisma.InputJsonValue } });
    changes.push({ entity: "workout", recordId: r.id, field: "exercises", before: r.before, after: r.after });
  }
  const batchId = await recordChanges(changes, { reason: input.reason, via: "mcp" });
  if (rewrites.length) await rebuildPersonalRecords().catch(() => null);
  return { dryRun: false, ...result, batchId, workoutsChanged: rewrites.length };
}

// ── Undo handlers ──────────────────────────────────────────────────────────

registerUndoHandler("exercise", {
  async read(slug, fields) {
    // Always an object: a deleted row reads as _row = null, which an undo of
    // its deletion compares against.
    const row = await snapshot(slug);
    return Object.fromEntries(fields.map((f) => [f, f === "_row" ? row : row ? (row as unknown as Json)[f] ?? null : null]));
  },
  async write(slug, values) {
    if ("_row" in values) {
      const v = values._row as RowSnapshot | null;
      if (v == null) await prisma.userExercise.delete({ where: { slug } }).catch(() => null);
      else {
        const data = {
          name: v.name,
          category: v.category,
          aliases: v.aliases,
          load: v.load,
          profile: v.profile == null ? Prisma.DbNull : (v.profile as Prisma.InputJsonValue),
        };
        await prisma.userExercise.upsert({ where: { slug }, create: { slug, ...data }, update: data });
      }
    }
    const rest = Object.fromEntries(Object.entries(values).filter(([k]) => k !== "_row"));
    if (Object.keys(rest).length) {
      const data: Json = {};
      for (const [k, v] of Object.entries(rest)) data[k] = k === "profile" && v == null ? Prisma.DbNull : v;
      await prisma.userExercise.update({ where: { slug }, data }).catch(() => null);
    }
    invalidateUserExercises();
    await ensureUserExercisesLoaded(true);
    await rebuildPersonalRecords().catch(() => null);
  },
});

registerUndoHandler("routine", {
  async read(id, fields) {
    const r = await prisma.sequence.findUnique({ where: { id } });
    if (!r) return null;
    return Object.fromEntries(fields.map((f) => [f, (r as unknown as Json)[f] ?? null]));
  },
  async write(id, values) {
    if ("steps" in values) {
      await prisma.sequence.update({ where: { id }, data: { steps: values.steps as Prisma.InputJsonValue } });
    }
  },
});

export type { ExerciseProfile };
export { readProfile };
