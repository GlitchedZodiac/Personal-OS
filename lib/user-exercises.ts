import { prisma } from "@/lib/prisma";
import {
  type ExerciseCategory,
  type ExerciseDef,
  findExerciseByExactName,
  foldExerciseName,
  setCustomExercises,
  slugifyExerciseName,
} from "@/lib/exercises";

// Server side of user-minted movements (user_exercises): loads them into the
// shared exercise index so normalization resolves them everywhere names are
// read (voice → chat, PRs, routines, Train display), and owns creation so the
// AI can mint new movements mid-chat. lib/exercises.ts stays client-safe;
// only this module touches Prisma.

const CATEGORY_SET = new Set<ExerciseCategory>([
  "kettlebell",
  "barbell",
  "dumbbell",
  "bodyweight",
  "machine",
  "cardio",
  "other",
]);

// Serverless instances each hold their own copy; a short TTL keeps a warm
// lambda honest without a query per normalize call. Writes invalidate.
const TTL_MS = 15_000;
let loadedAt = 0;

export async function ensureUserExercisesLoaded(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  const rows = await prisma.userExercise.findMany({ orderBy: { createdAt: "asc" } });
  setCustomExercises(
    rows.map((r) => ({
      id: r.slug,
      name: r.name,
      category: (CATEGORY_SET.has(r.category as ExerciseCategory)
        ? r.category
        : "other") as ExerciseCategory,
      aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    }))
  );
  loadedAt = Date.now();
}

export function invalidateUserExercises() {
  loadedAt = 0;
}

// "Kettlebell Snatch (each side)" mints the base movement, not a per-side
// variant — the per-side qualifier is display/volume semantics, not identity.
const PER_SIDE_RE = /\s*\(?(each side|per side|cada lado|por lado)\)?\s*$/i;

function baseName(raw: string): string {
  return raw.replace(PER_SIDE_RE, "").trim();
}

// Mint gate: exact-name match, tolerating a plural tail ("Kettlebell Cleans"
// must resolve to Kettlebell Clean, not mint a duplicate).
function knownByExactName(name: string): ExerciseDef | null {
  const hit = findExerciseByExactName(name);
  if (hit) return hit;
  const folded = foldExerciseName(name);
  if (folded.endsWith("s")) return findExerciseByExactName(folded.slice(0, -1));
  return null;
}

export interface CreateUserExerciseInput {
  name?: unknown;
  category?: unknown;
  aliases?: unknown;
}

export type CreateUserExerciseResult =
  | { ok: true; def: ExerciseDef; created: boolean }
  | { ok: false; error: string };

/**
 * Mint a user movement. Exact-name collisions (catalog or custom) return the
 * existing definition instead of a duplicate; aliases that collide with any
 * known key are dropped so a custom can never hijack an existing movement.
 */
export async function createUserExercise(
  input: CreateUserExerciseInput
): Promise<CreateUserExerciseResult> {
  const name = typeof input.name === "string" ? baseName(input.name.trim()) : "";
  if (!name) return { ok: false, error: "Exercise name is required" };
  if (name.length > 60) return { ok: false, error: "Exercise name too long (max 60)" };

  const category = CATEGORY_SET.has(input.category as ExerciseCategory)
    ? (input.category as ExerciseCategory)
    : "other";

  await ensureUserExercisesLoaded();
  const existing = knownByExactName(name);
  if (existing) return { ok: true, def: existing, created: false };

  const slug = slugifyExerciseName(name);
  if (!slug) return { ok: false, error: "Exercise name has no usable characters" };

  const rawAliases = Array.isArray(input.aliases) ? input.aliases : [];
  const aliases: string[] = [];
  for (const raw of rawAliases.slice(0, 12)) {
    if (typeof raw !== "string") continue;
    const alias = raw.trim();
    const folded = foldExerciseName(alias);
    if (!alias || !folded || folded === foldExerciseName(name)) continue;
    if (findExerciseByExactName(alias)) continue; // never shadow a known key
    if (aliases.some((a) => foldExerciseName(a) === folded)) continue;
    aliases.push(alias);
  }

  const row = await prisma.userExercise.upsert({
    where: { slug },
    create: { slug, name, category, aliases },
    update: { name, category, aliases },
  });

  await ensureUserExercisesLoaded(true);
  return {
    ok: true,
    created: true,
    def: {
      id: row.slug,
      name: row.name,
      category,
      aliases,
      isCustom: true,
    },
  };
}

/**
 * Routine steps may carry movements the vocabulary doesn't know yet — the AI
 * marks each step with a category, and anything without an exact-name match
 * is minted before validation so the saved steps reference real ids. Returns
 * the display names of newly created movements (for the confirm follow-up).
 */
export async function mintUnknownExercises(
  steps: unknown
): Promise<{ minted: string[] }> {
  const minted: string[] = [];
  if (!Array.isArray(steps)) return { minted };

  await ensureUserExercisesLoaded();
  for (const raw of steps) {
    if (!raw || typeof raw !== "object") continue;
    const step = raw as { exerciseName?: unknown; exercise?: unknown; category?: unknown };
    const rawName =
      typeof step.exerciseName === "string" && step.exerciseName.trim()
        ? step.exerciseName.trim()
        : typeof step.exercise === "string"
          ? step.exercise.trim()
          : "";
    if (!rawName || typeof step.category !== "string") continue;

    const name = baseName(rawName);
    if (!name || knownByExactName(name)) continue;

    const result = await createUserExercise({ name, category: step.category });
    if (result.ok && result.created) minted.push(result.def.name);
  }
  return { minted };
}
