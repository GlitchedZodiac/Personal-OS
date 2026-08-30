// The MCP tool surface (2026-08-29): everything the in-app AI can do, plus
// the recipe/routine/measurement functions Michael named, exposed to his own
// Claude account. Handlers call the SAME libs the web routes call
// (normalizers, validators, PR detection) so an MCP write is
// indistinguishable from a web write except for its provenance stamp.
//
// Design rules:
// - Reads go through lib/ai/data-registry (field allowlists, clip budget) —
//   one tool, every dataset, identical to the in-app get_app_data.
// - Writes stamp source/externalSource "mcp" wherever the schema has a slot,
//   so anything surprising is traceable and deletable.
// - Handlers NEVER throw for user-level problems — they return
//   { error: "..." } so the calling model can recover (same contract as
//   executeAppData). Throws are reserved for genuine bugs.
// - report_gap exists because the connector doubles as a gap-finder: when
//   his Claude hits a missing capability, it files the gap as a todo.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { executeAppData, type AppDataArgs } from "@/lib/ai/data-access";
import { REGISTRY } from "@/lib/ai/data-registry";
import { routeDataAllowed } from "@/lib/activities";
import { matchUsual } from "@/lib/food-match";
import { findRecentDuplicate } from "@/lib/workout-dedupe";
import { normalizeExerciseName } from "@/lib/exercises";
import { ensureUserExercisesLoaded, mintUnknownExercises } from "@/lib/user-exercises";
import { validateSequence } from "@/lib/sequences";
import { detectAndRecordPRs, rebuildPersonalRecords } from "@/lib/prs";
import {
  applyEntryEdit,
  applyWeightAssignments,
  findEntryIndex,
  type WeightAssignment,
} from "@/lib/workout-edit";
import { createOrLinkTrail, TrailInputError } from "@/lib/trails";
import { getTrainingWeek, planWeek, type PlannedDayInput } from "@/lib/planner";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDateStringInTimeZone } from "@/lib/timezone";

type Json = Record<string, unknown>;

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Json;
}

type Handler = (args: Json) => Promise<unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const posNum = (v: unknown) => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};
const isoDate = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
};

// ── Reads ────────────────────────────────────────────────────────────────

const datasetCatalog = REGISTRY.map((s) => `${s.key} — ${s.summary}`).join("\n");
const datasetKeys = REGISTRY.map((s) => s.key);

async function appDataCtx() {
  const timeZone = await getUserTimeZone(null);
  return { timeZone, todayStr: getDateStringInTimeZone(new Date(), timeZone) };
}

// ── The tool table ───────────────────────────────────────────────────────

export const MCP_TOOLS: { def: McpToolDef; handler: Handler }[] = [
  {
    def: {
      name: "query_data",
      description:
        "Read any Pitaya dataset — workouts, food, body measurements, trails, routines, spirit, journal, todos, finance summaries and more. Filter by days/from/to, search with q, fetch one row by id. Datasets:\n" +
        datasetCatalog,
      inputSchema: {
        type: "object",
        properties: {
          dataset: { type: "string", enum: datasetKeys },
          days: { type: "number", description: "Trailing window in days" },
          from: { type: "string", description: "YYYY-MM-DD start" },
          to: { type: "string", description: "YYYY-MM-DD end" },
          q: { type: "string", description: "Case-insensitive search" },
          id: { type: "string", description: "Single row by id (adds detail fields)" },
          limit: { type: "number" },
          ref: { type: "string", description: "Bible reference filter (spirit datasets)" },
        },
        required: ["dataset"],
      },
    },
    handler: async (args) => executeAppData(args as AppDataArgs, await appDataCtx()),
  },

  // ── Recipes (his word for saved usuals/products) ──────────────────────
  {
    def: {
      name: "list_recipes",
      description:
        "List saved recipes/usuals — reusable foods with fixed macros. kind 'meal' = a plated usual (macros as eaten); kind 'product' = a scanned label (macros PER SERVING, scaled by servings when logged).",
      inputSchema: { type: "object", properties: {} },
    },
    handler: async () => ({
      recipes: await prisma.favoriteFoods.findMany({
        orderBy: { usageCount: "desc" },
        select: {
          id: true,
          foodDescription: true,
          mealType: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
          kind: true,
          servingLabel: true,
          usageCount: true,
        },
      }),
    }),
  },
  {
    def: {
      name: "save_recipe",
      description:
        "Create a recipe/usual (or update the one with the same name). Macros for kind 'meal' are as-eaten; for kind 'product' they are per serving (give servingLabel like '1 scoop (32 g)').",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
          calories: { type: "number" },
          proteinG: { type: "number" },
          carbsG: { type: "number" },
          fatG: { type: "number" },
          kind: { type: "string", enum: ["meal", "product"] },
          servingLabel: { type: "string" },
        },
        required: ["name", "calories", "proteinG", "carbsG", "fatG"],
      },
    },
    handler: async (args) => {
      const name = str(args.name);
      if (!name) return { error: "name is required" };
      const data = {
        foodDescription: name,
        mealType: str(args.mealType) || "snack",
        calories: num(args.calories) ?? 0,
        proteinG: num(args.proteinG) ?? 0,
        carbsG: num(args.carbsG) ?? 0,
        fatG: num(args.fatG) ?? 0,
        kind: args.kind === "product" ? "product" : "meal",
        servingLabel: str(args.servingLabel) || null,
      };
      const existing = await prisma.favoriteFoods.findFirst({
        where: { foodDescription: { equals: name, mode: "insensitive" } },
      });
      const recipe = existing
        ? await prisma.favoriteFoods.update({ where: { id: existing.id }, data })
        : await prisma.favoriteFoods.create({ data });
      return { recipe, created: !existing };
    },
  },
  {
    def: {
      name: "rename_recipe",
      description: "Rename a saved recipe/usual (by id or current name).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Current name (when id unknown)" },
          newName: { type: "string" },
        },
        required: ["newName"],
      },
    },
    handler: async (args) => {
      const newName = str(args.newName);
      if (!newName) return { error: "newName is required" };
      const target = await findRecipe(args);
      if (!target) return { error: "Recipe not found" };
      const clash = await prisma.favoriteFoods.findFirst({
        where: {
          foodDescription: { equals: newName, mode: "insensitive" },
          id: { not: target.id },
        },
      });
      if (clash) return { error: `A recipe named "${clash.foodDescription}" already exists` };
      const recipe = await prisma.favoriteFoods.update({
        where: { id: target.id },
        data: { foodDescription: newName },
      });
      return { recipe, renamedFrom: target.foodDescription };
    },
  },
  {
    def: {
      name: "log_recipe",
      description:
        "Log a saved recipe/usual as eaten — its exact stored macros, zero estimation. Find it by id, exact name, or fuzzy match. Products scale by servings.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Recipe name — fuzzy matched" },
          servings: { type: "number", description: "Products only; default 1" },
          mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
          loggedAt: { type: "string", description: "ISO datetime; default now" },
        },
      },
    },
    handler: async (args) => {
      const recipe = await findRecipe(args);
      if (!recipe) return { error: "Recipe not found — list_recipes shows what exists" };
      const isProduct = recipe.kind === "product";
      const multiplier = isProduct ? (posNum(args.servings) ?? 1) : 1;
      const round = (n: number) => Math.round((n || 0) * multiplier * 10) / 10;
      const entry = await prisma.foodLog.create({
        data: {
          loggedAt: isoDate(args.loggedAt) ?? undefined,
          mealType: str(args.mealType) || recipe.mealType || "snack",
          foodDescription:
            isProduct && multiplier !== 1
              ? `${recipe.foodDescription} (${multiplier}×)`
              : recipe.foodDescription,
          calories: round(recipe.calories),
          proteinG: round(recipe.proteinG),
          carbsG: round(recipe.carbsG),
          fatG: round(recipe.fatG),
          // "usual" drives the timeline pill; the note carries provenance.
          source: "usual",
          notes: "via Claude connector",
        },
      });
      await prisma.favoriteFoods.update({
        where: { id: recipe.id },
        data: { usageCount: { increment: 1 } },
      });
      return { logged: entry };
    },
  },
  {
    def: {
      name: "delete_recipe",
      description: "Delete a saved recipe/usual (by id or name). Past food logs stay.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
      },
    },
    handler: async (args) => {
      const target = await findRecipe(args);
      if (!target) return { error: "Recipe not found" };
      await prisma.favoriteFoods.delete({ where: { id: target.id } });
      return { deleted: target.foodDescription };
    },
  },

  // ── Food ──────────────────────────────────────────────────────────────
  {
    def: {
      name: "log_food",
      description:
        "Log one or more eaten items with estimated macros (grams). For foods he eats repeatedly, prefer log_recipe / save_recipe so macros stay consistent.",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                mealType: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
                foodDescription: { type: "string" },
                calories: { type: "number" },
                proteinG: { type: "number" },
                carbsG: { type: "number" },
                fatG: { type: "number" },
                notes: { type: "string" },
                loggedAt: { type: "string", description: "ISO datetime; default now" },
              },
              required: ["mealType", "foodDescription", "calories", "proteinG", "carbsG", "fatG"],
            },
          },
        },
        required: ["items"],
      },
    },
    handler: async (args) => {
      const items = Array.isArray(args.items) ? (args.items as Json[]) : [];
      if (items.length === 0 || items.length > 20) {
        return { error: "1–20 items per call" };
      }
      const created = [];
      for (const it of items) {
        const desc = str(it.foodDescription);
        if (!desc) continue;
        created.push(
          await prisma.foodLog.create({
            data: {
              loggedAt: isoDate(it.loggedAt) ?? undefined,
              mealType: str(it.mealType) || "snack",
              foodDescription: desc,
              calories: num(it.calories) ?? 0,
              proteinG: num(it.proteinG) ?? 0,
              carbsG: num(it.carbsG) ?? 0,
              fatG: num(it.fatG) ?? 0,
              notes: str(it.notes) || null,
              source: "mcp",
            },
          })
        );
      }
      return { logged: created.length, entries: created };
    },
  },
  {
    def: {
      name: "edit_food",
      description: "Correct one food log row's fields (find ids via query_data recent_food).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          foodDescription: { type: "string" },
          mealType: { type: "string" },
          calories: { type: "number" },
          proteinG: { type: "number" },
          carbsG: { type: "number" },
          fatG: { type: "number" },
          notes: { type: "string" },
          loggedAt: { type: "string" },
        },
        required: ["id"],
      },
    },
    handler: async (args) => {
      const id = str(args.id);
      if (!id) return { error: "id is required" };
      const data: Record<string, unknown> = {};
      for (const k of ["foodDescription", "mealType", "notes"] as const) {
        if (typeof args[k] === "string") data[k] = args[k];
      }
      for (const k of ["calories", "proteinG", "carbsG", "fatG"] as const) {
        if (args[k] !== undefined && num(args[k]) != null) data[k] = num(args[k]);
      }
      if (args.loggedAt !== undefined) {
        const d = isoDate(args.loggedAt);
        if (!d) return { error: "loggedAt is not a valid datetime" };
        data.loggedAt = d;
      }
      if (Object.keys(data).length === 0) return { error: "Nothing to change" };
      try {
        return { entry: await prisma.foodLog.update({ where: { id }, data }) };
      } catch {
        return { error: "Food log row not found" };
      }
    },
  },

  // ── Workouts ──────────────────────────────────────────────────────────
  {
    def: {
      name: "log_workout",
      description:
        "Log a completed workout. exercises entries: {name, sets?, reps?, seconds?, weightKg?} — names normalize against the catalog; PRs detect automatically.",
      inputSchema: {
        type: "object",
        properties: {
          workoutType: {
            type: "string",
            description: "strength | freestyle | walk | run | hike | cycling | other…",
          },
          startedAt: { type: "string", description: "ISO datetime; default now" },
          durationMinutes: { type: "number" },
          description: { type: "string" },
          caloriesBurned: { type: "number" },
          distanceMeters: { type: "number" },
          avgHeartRateBpm: { type: "number" },
          maxHeartRateBpm: { type: "number" },
          elevationGainM: { type: "number" },
          packKg: { type: "number", description: "Carried load for hikes (0–60)" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sets: { type: "number" },
                reps: { type: "number" },
                seconds: { type: "number" },
                weightKg: { type: "number" },
              },
              required: ["name"],
            },
          },
        },
        required: ["workoutType", "durationMinutes"],
      },
    },
    handler: async (args) => {
      const workoutType = str(args.workoutType) || "other";
      const packKg = num(args.packKg);
      if (packKg != null && (packKg < 0 || packKg > 60)) {
        return { error: "packKg must be 0–60" };
      }
      await ensureUserExercisesLoaded();
      const exercises = Array.isArray(args.exercises)
        ? (args.exercises as Json[])
            .map((e) => {
              const raw = str(e.name);
              if (!raw) return null;
              const def = normalizeExerciseName(raw);
              const weight = num(e.weightKg);
              return {
                name: def?.name ?? raw,
                ...(def ? { exercise: def.id } : {}),
                ...(posNum(e.sets) != null ? { sets: posNum(e.sets) } : {}),
                ...(posNum(e.reps) != null ? { reps: posNum(e.reps) } : {}),
                ...(posNum(e.seconds) != null ? { seconds: posNum(e.seconds) } : {}),
                ...(weight != null && weight >= 0 ? { weightKg: weight } : {}),
              };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
        : undefined;
      // Double-submit guard (2026-08-29): a transport retry or a re-emitted
      // tool call must not write a twin row.
      const startedAt = isoDate(args.startedAt) ?? new Date();
      const durationMinutes = Math.max(0, num(args.durationMinutes) ?? 0);
      const dupe = await findRecentDuplicate({
        startedAt,
        workoutType,
        durationMinutes,
        description: str(args.description) || null,
        exercises,
      });
      if (dupe) {
        return { workout: dupe, newPRs: [], deduped: true };
      }
      const entry = await prisma.workoutLog.create({
        data: {
          startedAt,
          workoutType,
          durationMinutes,
          description: str(args.description) || null,
          caloriesBurned: posNum(args.caloriesBurned),
          distanceMeters: routeDataAllowed(workoutType) ? posNum(args.distanceMeters) : null,
          avgHeartRateBpm: posNum(args.avgHeartRateBpm) ? Math.round(posNum(args.avgHeartRateBpm)!) : null,
          maxHeartRateBpm: posNum(args.maxHeartRateBpm) ? Math.round(posNum(args.maxHeartRateBpm)!) : null,
          elevationGainM: posNum(args.elevationGainM),
          packKg,
          exercises: (exercises as Prisma.InputJsonValue) ?? undefined,
          source: "mcp",
          externalSource: "mcp",
        },
      });
      let newPRs: Awaited<ReturnType<typeof detectAndRecordPRs>> = [];
      try {
        newPRs = await detectAndRecordPRs({
          workoutLogId: entry.id,
          exercises: entry.exercises,
          achievedAt: entry.startedAt,
        });
      } catch {
        // PR detection must never break logging (same policy as the route).
      }
      return { workout: entry, newPRs };
    },
  },
  {
    def: {
      name: "edit_workout",
      description:
        "Correct a saved workout's movements or pack weight. Modes: exercises REPLACES the whole movement list; assignments bulk-sets weights ({match:'*'|'substring', weightKg}); match+set corrects one entry; packKg records carried load. PRs rebuild automatically.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sets: { type: "number" },
                reps: { type: "number" },
                seconds: { type: "number" },
                weightKg: { type: "number" },
              },
              required: ["name"],
            },
          },
          assignments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                match: { type: "string" },
                weightKg: { type: "number" },
              },
              required: ["match", "weightKg"],
            },
          },
          match: {
            type: "object",
            properties: { name: { type: "string" }, index: { type: "number" } },
          },
          set: {
            type: "object",
            properties: {
              name: { type: "string" },
              sets: { type: "number" },
              reps: { type: "number" },
              seconds: { type: "number" },
              weightKg: { type: "number" },
            },
          },
          packKg: { type: "number" },
        },
        required: ["id"],
      },
    },
    handler: async (args) => {
      const id = str(args.id);
      if (!id) return { error: "id is required" };
      const workout = await prisma.workoutLog.findUnique({ where: { id } });
      if (!workout) return { error: "Workout not found" };

      let packPatch: { packKg: number | null } | undefined;
      if ("packKg" in args) {
        const v = args.packKg;
        if (v === null) packPatch = { packKg: null };
        else {
          const n = num(v);
          if (n == null || n < 0 || n > 60) return { error: "packKg must be 0–60 or null" };
          packPatch = { packKg: n };
        }
      }

      await ensureUserExercisesLoaded();
      let nextExercises: object[] | null = null;
      let changed: string[] = [];
      if (Array.isArray(args.exercises) && args.exercises.length > 0) {
        const attached = (args.exercises as Json[])
          .map((e) => {
            const raw = str(e.name);
            if (!raw) return null;
            const def = normalizeExerciseName(raw);
            const weight = num(e.weightKg);
            return {
              name: def?.name ?? raw,
              ...(def ? { exercise: def.id } : {}),
              ...(posNum(e.sets) != null ? { sets: posNum(e.sets) } : {}),
              ...(posNum(e.reps) != null ? { reps: posNum(e.reps) } : {}),
              ...(posNum(e.seconds) != null ? { seconds: posNum(e.seconds) } : {}),
              ...(weight != null && weight >= 0 ? { weightKg: weight } : {}),
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);
        if (attached.length === 0) return { error: "No usable movements" };
        nextExercises = attached;
        changed = [`attached×${attached.length}`];
      } else if (Array.isArray(args.assignments) && args.assignments.length > 0) {
        const bulk = applyWeightAssignments(
          workout.exercises,
          args.assignments as WeightAssignment[]
        );
        if (!bulk.ok) return { error: bulk.error };
        nextExercises = bulk.exercises;
        changed = [`weightKg×${bulk.touched}`];
      } else if (args.match != null || args.set != null) {
        const index = findEntryIndex(workout.exercises, (args.match as object) ?? {});
        if (index < 0) return { error: "No matching exercise entry in that workout" };
        const edit = applyEntryEdit(workout.exercises, index, (args.set as object) ?? {});
        if (!edit.ok) return { error: edit.error };
        nextExercises = edit.exercises;
        changed = edit.changed;
      }

      if (nextExercises == null && !packPatch) return { error: "Nothing to change" };
      const updated = await prisma.workoutLog.update({
        where: { id },
        data: {
          ...(nextExercises != null
            ? { exercises: nextExercises as Prisma.InputJsonValue }
            : {}),
          ...(packPatch ?? {}),
        },
      });
      if (nextExercises != null) {
        try {
          await rebuildPersonalRecords();
        } catch {
          // Rebuild failure shouldn't lose the edit.
        }
      }
      return {
        workout: updated,
        changed: [...changed, ...(packPatch ? ["packKg"] : [])],
      };
    },
  },
  {
    def: {
      name: "delete_entry",
      description:
        "Delete one row he says is wrong: a food log, a workout, or a body measurement. Irreversible — confirm intent with the user first.",
      inputSchema: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["food", "workout", "measurement"] },
          id: { type: "string" },
        },
        required: ["entity", "id"],
      },
    },
    handler: async (args) => {
      const id = str(args.id);
      if (!id) return { error: "id is required" };
      try {
        if (args.entity === "food") {
          await prisma.foodLog.delete({ where: { id } });
        } else if (args.entity === "workout") {
          await prisma.workoutLog.delete({ where: { id } });
          try {
            await rebuildPersonalRecords();
          } catch {
            // best effort
          }
        } else if (args.entity === "measurement") {
          await prisma.bodyMeasurement.delete({ where: { id } });
        } else {
          return { error: "entity must be food | workout | measurement" };
        }
        return { deleted: id };
      } catch {
        return { error: "Row not found" };
      }
    },
  },

  // ── Body / water / reminders ──────────────────────────────────────────
  {
    def: {
      name: "log_measurement",
      description:
        "Record body size data: weight and/or tape measurements in cm (waist, chest, arms, legs, hips, shoulders, neck, forearms, calves), body-fat %. Omit anything not measured — never zero-fill.",
      inputSchema: {
        type: "object",
        properties: {
          measuredAt: { type: "string", description: "ISO datetime; default now" },
          weightKg: { type: "number" },
          bodyFatPct: { type: "number" },
          waistCm: { type: "number" },
          chestCm: { type: "number" },
          armsCm: { type: "number" },
          legsCm: { type: "number" },
          hipsCm: { type: "number" },
          shouldersCm: { type: "number" },
          neckCm: { type: "number" },
          forearmsCm: { type: "number" },
          calvesCm: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
    handler: async (args) => {
      const fields = [
        "weightKg",
        "bodyFatPct",
        "waistCm",
        "chestCm",
        "armsCm",
        "legsCm",
        "hipsCm",
        "shouldersCm",
        "neckCm",
        "forearmsCm",
        "calvesCm",
      ] as const;
      const data: Record<string, unknown> = {
        measuredAt: isoDate(args.measuredAt) ?? undefined,
        notes: str(args.notes) || null,
        source: "mcp",
      };
      let any = false;
      for (const f of fields) {
        const v = posNum(args[f]);
        if (v != null) {
          data[f] = v;
          any = true;
        }
      }
      if (!any) return { error: "Provide at least one measurement (positive number)" };
      return { measurement: await prisma.bodyMeasurement.create({ data }) };
    },
  },
  {
    def: {
      name: "log_water",
      description: "Log drinking water: glasses (default 1) at amountMl each (default 250).",
      inputSchema: {
        type: "object",
        properties: {
          glasses: { type: "number" },
          amountMl: { type: "number" },
        },
      },
    },
    handler: async (args) => {
      const glasses = Math.min(24, Math.max(1, Math.round(num(args.glasses) ?? 1)));
      const amountMl = posNum(args.amountMl) ?? 250;
      await prisma.waterLog.createMany({
        data: Array.from({ length: glasses }, () => ({ amountMl })),
      });
      return { logged: glasses, amountMl };
    },
  },
  {
    def: {
      name: "set_reminder",
      description: "Set a timed reminder that pushes a notification at the given time.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          remindAt: { type: "string", description: "ISO datetime" },
        },
        required: ["title", "remindAt"],
      },
    },
    handler: async (args) => {
      const title = str(args.title);
      const remindAt = isoDate(args.remindAt);
      if (!title || !remindAt) return { error: "title and a valid remindAt are required" };
      const reminder = await prisma.reminder.create({
        data: { title, body: title, remindAt, url: "/dashboard" },
      });
      return { reminder };
    },
  },

  // ── Routines + planning + trails ──────────────────────────────────────
  {
    def: {
      name: "create_routine",
      description:
        "Create a training routine. kind: straight (sets×reps), emom (minute-on-the-minute), tabata, circuit (rounds of steps). steps: [{exerciseName, category?, sets?, reps?, seconds?, weightKg?, restSeconds?, toFailure?}]. Unknown movements are minted into the catalog.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["straight", "emom", "tabata", "circuit"] },
          durationMinutes: { type: "number" },
          rounds: { type: "number" },
          restSecondsDefault: { type: "number" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                exerciseName: { type: "string" },
                category: { type: "string" },
                sets: { type: "number" },
                reps: { type: "number" },
                seconds: { type: "number" },
                weightKg: { type: "number" },
                restSeconds: { type: "number" },
                toFailure: { type: "boolean" },
              },
              required: ["exerciseName"],
            },
          },
        },
        required: ["name", "kind", "steps"],
      },
    },
    handler: async (args) => {
      await ensureUserExercisesLoaded();
      const { minted } = await mintUnknownExercises(args.steps as never);
      const parsed = validateSequence(args as never);
      if (!parsed.ok) return { error: parsed.error };
      const routine = await prisma.sequence.create({
        data: {
          name: parsed.name,
          kind: parsed.kind,
          restSecondsDefault: parsed.restSecondsDefault,
          durationMinutes: parsed.durationMinutes,
          rounds: parsed.rounds,
          steps: parsed.steps as object[],
        },
      });
      return { routine, mintedExercises: minted };
    },
  },
  {
    def: {
      name: "update_routine",
      description:
        "Replace a routine's full definition (find its id via query_data routines). Send the COMPLETE new shape — name, kind, steps — not a diff. Also renames.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["straight", "emom", "tabata", "circuit"] },
          durationMinutes: { type: "number" },
          rounds: { type: "number" },
          restSecondsDefault: { type: "number" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                exerciseName: { type: "string" },
                category: { type: "string" },
                sets: { type: "number" },
                reps: { type: "number" },
                seconds: { type: "number" },
                weightKg: { type: "number" },
                restSeconds: { type: "number" },
                toFailure: { type: "boolean" },
              },
              required: ["exerciseName"],
            },
          },
        },
        required: ["id", "name", "kind", "steps"],
      },
    },
    handler: async (args) => {
      const id = str(args.id);
      if (!id) return { error: "id is required" };
      const existing = await prisma.sequence.findUnique({ where: { id } });
      if (!existing) return { error: "Routine not found" };
      await ensureUserExercisesLoaded();
      const { minted } = await mintUnknownExercises(args.steps as never);
      const parsed = validateSequence(args as never);
      if (!parsed.ok) return { error: parsed.error };
      const routine = await prisma.sequence.update({
        where: { id },
        data: {
          name: parsed.name,
          kind: parsed.kind,
          restSecondsDefault: parsed.restSecondsDefault,
          durationMinutes: parsed.durationMinutes,
          rounds: parsed.rounds,
          steps: parsed.steps as object[],
        },
      });
      return { routine, mintedExercises: minted };
    },
  },
  {
    def: {
      name: "plan_training",
      description:
        "Plan training days: [{date: 'YYYY-MM-DD', title, notes?, routineName?, trailName?, targetWeightKg?, reminders?: [{atLocal: 'YYYY-MM-DDTHH:mm', title}]}]. Routine/trail names resolve case-insensitively. replaceWeek true clears the touched weeks first.",
      inputSchema: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "YYYY-MM-DD" },
                title: { type: "string" },
                notes: { type: "string" },
                routineName: { type: "string" },
                trailName: { type: "string" },
                targetWeightKg: { type: "number" },
                reminders: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      atLocal: {
                        type: "string",
                        description: "Local datetime YYYY-MM-DDTHH:mm",
                      },
                    },
                    required: ["title", "atLocal"],
                  },
                },
              },
              required: ["date", "title"],
            },
          },
          replaceWeek: { type: "boolean" },
        },
        required: ["days"],
      },
    },
    handler: async (args) => {
      if (!Array.isArray(args.days) || args.days.length === 0) {
        return { error: "days[] is required" };
      }
      const timeZone = await getUserTimeZone(null);
      return planWeek({
        days: args.days as PlannedDayInput[],
        replaceWeek: args.replaceWeek === true,
        timeZone,
      });
    },
  },
  {
    def: {
      name: "get_training_week",
      description:
        "Read the planned training week (default: current). weekStart: Monday YYYY-MM-DD.",
      inputSchema: {
        type: "object",
        properties: { weekStart: { type: "string" } },
      },
    },
    handler: async (args) => {
      const timeZone = await getUserTimeZone(null);
      return getTrainingWeek(timeZone, str(args.weekStart) || undefined);
    },
  },
  {
    def: {
      name: "name_trail",
      description:
        "Name the ground a GPS workout covered ('that hike was el Cerro de las Tres Cruces') — links repeat runs for comparison. workoutId optional: latest GPS workout when omitted.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          workoutId: { type: "string" },
        },
        required: ["name"],
      },
    },
    handler: async (args) => {
      const name = str(args.name);
      if (!name) return { error: "name is required" };
      let workoutId = str(args.workoutId) || undefined;
      if (!workoutId) {
        const latest = await prisma.workoutLog.findFirst({
          where: { routeData: { not: Prisma.DbNull } },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });
        workoutId = latest?.id;
      }
      try {
        return await createOrLinkTrail({ name, workoutId });
      } catch (error) {
        if (error instanceof TrailInputError) return { error: error.message };
        throw error;
      }
    },
  },

  // ── The gap-finder ────────────────────────────────────────────────────
  {
    def: {
      name: "report_gap",
      description:
        "File a product gap: when Pitaya is missing data, a tool, or a capability you needed to answer well, report it here. It lands on the owner's todo list tagged as a Pitaya gap.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "The gap in one line" },
          detail: { type: "string", description: "What you were trying to do and what was missing" },
        },
        required: ["title"],
      },
    },
    handler: async (args) => {
      const title = str(args.title);
      if (!title) return { error: "title is required" };
      const todo = await prisma.todo.create({
        data: {
          title: `[Pitaya gap] ${title}`.slice(0, 200),
          notes: str(args.detail) || null,
          icon: "🧩",
          category: "app",
          priority: "low",
        },
      });
      return { filed: todo.id, title: todo.title };
    },
  },
];

/// id wins; exact (case-insensitive) name next; fuzzy fold-match last.
async function findRecipe(args: Json) {
  const id = str(args.id);
  if (id) {
    return prisma.favoriteFoods.findUnique({ where: { id } });
  }
  const name = str(args.name);
  if (!name) return null;
  const exact = await prisma.favoriteFoods.findFirst({
    where: { foodDescription: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;
  const all = await prisma.favoriteFoods.findMany({
    select: { id: true, foodDescription: true },
    take: 100,
  });
  const match = matchUsual(name, all);
  return match ? prisma.favoriteFoods.findUnique({ where: { id: match.id } }) : null;
}

export const MCP_TOOL_DEFS: McpToolDef[] = MCP_TOOLS.map((t) => t.def);
const HANDLERS = new Map(MCP_TOOLS.map((t) => [t.def.name, t.handler]));

export async function callMcpTool(name: string, args: Json): Promise<unknown> {
  const handler = HANDLERS.get(name);
  if (!handler) return { error: `Unknown tool "${name}"` };
  return handler(args ?? {});
}
