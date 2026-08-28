// The single place that decides what the assistant can read.
//
// Michael's ask (2026-08-26): "our AI should chat and have access to
// essentially everything in our app... whatever I enable in our app, the AI is
// able to interpret." That last clause is the design constraint — adding a new
// surface to the AI must be ONE entry here, not a new tool, a new dispatch
// branch and a new prompt paragraph.
//
// One entry feeds three things at once: the `dataset` enum on the tool schema,
// the one-line catalog the model reads, and the executor's query plan.
//
// Two kinds:
//   - `table`   single-model, select-only, bounded. The long tail.
//   - `curated` a named handler, for anything needing a join or an aggregate.
// Hard rule that keeps the generic path dumb and safe: a table spec is
// single-model and select-only. Anything wanting `include`/`groupBy` is curated.

import { MEASURED_FIELDS } from "@/lib/body-measurements";

export type DatasetKind = "table" | "curated";

export interface DatasetSpec {
  key: string;
  kind: DatasetKind;
  /** One line for the model's catalog. Keep it under ~12 words. */
  summary: string;
  /** Prisma delegate name, e.g. "bodyMeasurement". Table specs only. */
  model?: string;
  /** Allowlisted columns — becomes the `select`. Never omit this. */
  fields?: readonly string[];
  /** Extra columns returned when the model asks for a single row by id. */
  detailFields?: readonly string[];
  /** Column that `from`/`to`/`days` filter on. */
  dateField?: string;
  orderBy?: Record<string, "asc" | "desc">;
  /** Columns `q` does a case-insensitive contains over. */
  search?: readonly string[];
  /** Canonical verse-int columns, so `ref: "Judges 4"` can narrow. */
  refFields?: { start: string; end: string };
  /** Baseline filter always ANDed in (e.g. hide soft-deleted rows). */
  baseWhere?: Record<string, unknown>;
  defaultLimit?: number;
  maxLimit?: number;
}

const DEFAULT_LIMIT = 25;
const DEFAULT_MAX = 200;

/**
 * Transactions the Finances screen counts as real. Mirrors
 * app/api/finance/summary/route.ts — if the AI used a bare findMany it would
 * quote totals including provisional and unreviewed rows, they would not match
 * the screen, and he would correctly read that as the AI being broken.
 */
export const ACTIVE_TRANSACTION_WHERE = {
  excludedFromBudget: false,
  status: "posted",
  reviewState: "resolved",
  settlementStatus: { notIn: ["provisional", "failed", "rejected", "ignored"] },
} as const;

export const REGISTRY: readonly DatasetSpec[] = [
  // ---------------------------------------------------------------- curated
  {
    key: "today_summary",
    kind: "curated",
    summary: "Calories/macros eaten today, goals, week training volume.",
  },
  { key: "prs", kind: "curated", summary: "All personal records." },
  {
    key: "recent_food",
    kind: "curated",
    summary: "Recent food log rows with ids, for edits.",
  },
  {
    key: "recent_workouts",
    kind: "curated",
    summary: "Recent workouts with ids, exercises, routine-run metadata.",
  },
  {
    key: "weight_trend",
    kind: "curated",
    summary:
      "Body measurements (weight, tape, scale composition) + weekly weight series.",
  },
  { key: "routines", kind: "curated", summary: "Saved routines with ids." },
  {
    key: "trails",
    kind: "curated",
    summary: "Named GPS trails with run counts and last-run stats.",
  },
  {
    key: "training_week",
    kind: "curated",
    summary: "This + next week's planned training days with status.",
  },
  {
    key: "workout_history",
    kind: "curated",
    summary: "Full-history weekly training series for coaching.",
  },
  {
    key: "food_history",
    kind: "curated",
    summary: "Full-history weekly intake vs the calorie target.",
  },
  {
    key: "app_digest",
    kind: "curated",
    summary: "What data exists at all: row counts + last entry per area.",
  },
  {
    key: "finance_summary",
    kind: "curated",
    summary: "This month's income, spend, top merchants, budget status.",
  },
  {
    key: "settings",
    kind: "curated",
    summary: "His goals, macro targets, units, and standing AI instructions.",
  },

  // ----------------------------------------------------------- health/life
  {
    key: "body_measurements",
    kind: "table",
    summary: "Raw measurement check-ins — weight, tape, scale composition.",
    model: "bodyMeasurement",
    // All 23 measured columns, from the shared vocabulary — so a column added
    // to the schema cannot go missing here without failing the parity test.
    fields: ["id", "measuredAt", "notes", "source", "skinfoldData", ...MEASURED_FIELDS],
    dateField: "measuredAt",
    orderBy: { measuredAt: "desc" },
    search: ["notes"],
  },
  {
    key: "daily_health",
    kind: "table",
    summary: "Apple Health days: steps, sleep, resting HR, HRV, energy.",
    model: "dailyHealthSnapshot",
    fields: [
      "id", "localDate", "timeZone", "steps", "restingHeartRateBpm",
      "activeEnergyKcal", "walkingRunningDistanceMeters", "sleepMinutes",
      "sleepDeepMinutes", "sleepRemMinutes", "hrvMs", "source",
    ],
    orderBy: { localDate: "desc" },
  },
  {
    key: "water",
    kind: "table",
    summary: "Hydration entries.",
    model: "waterLog",
    fields: ["id", "loggedAt", "amountMl"],
    dateField: "loggedAt",
    orderBy: { loggedAt: "desc" },
  },
  {
    key: "favorite_foods",
    kind: "table",
    summary: "Saved usual meals and scanned label products.",
    model: "favoriteFoods",
    fields: [
      "id", "foodDescription", "mealType", "calories", "proteinG", "carbsG",
      "fatG", "usageCount", "kind", "servingLabel",
    ],
    orderBy: { usageCount: "desc" },
    search: ["foodDescription"],
  },
  {
    key: "user_exercises",
    kind: "table",
    summary: "Movements he added to the exercise vocabulary.",
    model: "userExercise",
    fields: ["id", "slug", "name", "category", "aliases"],
    orderBy: { name: "asc" },
    search: ["name", "slug"],
  },
  {
    key: "workout_plans",
    kind: "table",
    summary: "Multi-day training programs and whether they are active.",
    model: "workoutPlan",
    fields: ["id", "name", "goal", "fitnessLevel", "daysPerWeek", "isActive", "aiGenerated", "notes"],
    detailFields: ["schedule"],
    orderBy: { createdAt: "desc" },
  },
  {
    key: "progress_photos",
    kind: "table",
    // imageData is deliberately absent — base64 must never reach the model.
    summary: "Progress photo dates and notes (no image data).",
    model: "progressPhoto",
    fields: ["id", "takenAt", "journalNote"],
    dateField: "takenAt",
    orderBy: { takenAt: "desc" },
    search: ["journalNote"],
  },
  {
    key: "habits",
    kind: "table",
    summary: "Habit ticks by day.",
    model: "habitCheck",
    fields: ["id", "name", "localDate"],
    orderBy: { localDate: "desc" },
    search: ["name"],
  },
  {
    key: "journal",
    kind: "table",
    // photoData deliberately absent.
    summary: "Daily journal entries, text only.",
    model: "journalEntry",
    fields: ["id", "localDate", "text"],
    orderBy: { localDate: "desc" },
    search: ["text"],
  },
  {
    key: "todos",
    kind: "table",
    summary: "Tasks: title, due date, done state, priority, recurrence.",
    model: "todo",
    fields: [
      "id", "title", "notes", "dueDate", "completed", "completedAt",
      "priority", "category", "isRecurring", "recurrence",
    ],
    dateField: "dueDate",
    orderBy: { createdAt: "desc" },
    search: ["title", "notes"],
  },
  {
    key: "reminders",
    kind: "table",
    summary: "Scheduled reminders and whether they fired.",
    model: "reminder",
    fields: ["id", "title", "body", "remindAt", "fired", "url"],
    dateField: "remindAt",
    orderBy: { remindAt: "desc" },
    search: ["title"],
  },

  // ---------------------------------------------------------------- spirit
  {
    key: "spirit_notes",
    kind: "table",
    summary: "Study notes on passages: observation, question, conviction.",
    model: "spiritNote",
    fields: ["id", "refStart", "refEnd", "kind", "body", "spoken", "resolvedAt", "createdAt"],
    dateField: "createdAt",
    orderBy: { createdAt: "desc" },
    search: ["body"],
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_highlights",
    kind: "table",
    summary: "Highlighted verses by category (God, Promise, Command...).",
    model: "highlight",
    fields: ["id", "refStart", "refEnd", "category", "origin", "createdAt"],
    dateField: "createdAt",
    orderBy: { createdAt: "desc" },
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_verse_links",
    kind: "table",
    summary: "Cross-references he drew between passages, with reasons.",
    model: "verseLink",
    fields: ["id", "fromStart", "fromEnd", "toStart", "toEnd", "reason", "why", "createdAt"],
    dateField: "createdAt",
    orderBy: { createdAt: "desc" },
    search: ["why"],
    refFields: { start: "fromStart", end: "fromEnd" },
  },
  {
    key: "spirit_threads",
    kind: "table",
    summary: "Passage-anchored Ask conversations.",
    model: "studyThread",
    fields: ["id", "refStart", "refEnd", "createdAt", "updatedAt"],
    detailFields: ["messages"],
    dateField: "createdAt",
    orderBy: { updatedAt: "desc" },
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_reading_log",
    kind: "table",
    summary: "Chapters read, in app or on paper.",
    model: "readingLog",
    fields: ["id", "refStart", "refEnd", "label", "medium", "track", "dayId", "readAt"],
    dateField: "readAt",
    orderBy: { readAt: "desc" },
    search: ["label"],
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_memory",
    kind: "table",
    summary: "Memory verse deck with due dates and streaks.",
    model: "memoryVerse",
    fields: [
      "id", "refStart", "refEnd", "refLabel", "occasion", "prompt", "why",
      "intervalDays", "nextDueAt", "lastSeenAt", "timesGot",
    ],
    orderBy: { nextDueAt: "asc" },
    search: ["refLabel", "prompt", "why"],
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_days",
    kind: "table",
    summary: "Curriculum studies: teaching, doctrine, practice, question.",
    model: "devotionalDay",
    fields: [
      "id", "termId", "weekIndex", "dayIndex", "title", "pullRef", "pullText",
      "readingRef", "readingLabel", "estMinutes", "aim", "writtenPrompt",
    ],
    detailFields: ["body", "contextBlock", "doctrine", "practice", "question", "oneMoreTitle", "oneMoreBody", "homework"],
    orderBy: { weekIndex: "asc" },
    search: ["title", "readingLabel", "aim"],
  },
  {
    key: "spirit_terms",
    kind: "table",
    summary: "Curriculum terms (courses) and their status.",
    model: "term",
    fields: ["id", "orderIndex", "title", "kick", "rationale", "hardNote", "homeworkArc", "weeks", "status", "startedAt"],
    detailFields: ["objectives", "syllabus", "summary"],
    orderBy: { orderIndex: "asc" },
    search: ["title", "kick"],
  },
  {
    key: "spirit_church",
    kind: "table",
    summary: "Sunday sermon series and week-by-week passages.",
    model: "churchSeries",
    fields: ["id", "title", "expectedWeeks", "lengthNote", "themes", "currentWeek", "status"],
    detailFields: ["passages", "weeks"],
    orderBy: { createdAt: "desc" },
    search: ["title", "themes"],
  },
  {
    key: "spirit_notebooks",
    kind: "table",
    summary: "Notebook shelves holding handwritten pages.",
    model: "spiritNotebook",
    fields: ["id", "title", "kind", "termId", "sortOrder", "archivedAt", "updatedAt"],
    orderBy: { sortOrder: "asc" },
    search: ["title"],
  },
  {
    key: "spirit_pages",
    kind: "table",
    // strokes / objects / thumbnail deliberately absent — megabytes of vector
    // JSON and base64. `textLayer` is the recognised handwriting, which is the
    // part worth reading.
    summary: "Handwritten pages — titles, passages, recognised text.",
    model: "inkPage",
    fields: [
      "id", "notebookId", "kind", "title", "subtitle", "dayId", "seriesId",
      "weekIndex", "refStart", "refEnd", "status", "strokeCount", "refs",
      "transcribedAt", "updatedAt",
    ],
    detailFields: ["textLayer"],
    baseWhere: { deletedAt: null },
    dateField: "updatedAt",
    orderBy: { updatedAt: "desc" },
    search: ["title", "subtitle", "textLayer"],
    refFields: { start: "refStart", end: "refEnd" },
  },
  {
    key: "spirit_recordings",
    kind: "table",
    summary: "Sermon recordings with transcripts.",
    model: "recording",
    fields: ["id", "title", "label", "preacher", "passageRef", "startedAt", "durationSec", "status", "lang", "seriesId", "weekIndex"],
    detailFields: ["transcript"],
    dateField: "startedAt",
    orderBy: { startedAt: "desc" },
    search: ["title", "label", "preacher", "passageRef"],
  },

  // --------------------------------------------------------------- finance
  {
    key: "finance_accounts",
    kind: "table",
    summary: "Bank/card/cash accounts and balances.",
    model: "financialAccount",
    fields: ["id", "name", "accountType", "currency", "balance", "isPrimary", "creditLimit", "interestRate", "institution", "isActive"],
    orderBy: { isPrimary: "desc" },
    search: ["name", "institution"],
  },
  {
    key: "finance_transactions",
    kind: "table",
    summary: "The money ledger. Negative = expense. COP unless stated.",
    model: "financialTransaction",
    fields: [
      "id", "accountId", "transactedAt", "amount", "currency", "description",
      "category", "subcategory", "type", "merchant", "notes", "status",
      "settlementStatus", "reviewState", "pocketId", "deductible",
      "sourceAmount", "sourceCurrency", "fxRate",
    ],
    baseWhere: ACTIVE_TRANSACTION_WHERE,
    dateField: "transactedAt",
    orderBy: { transactedAt: "desc" },
    search: ["description", "merchant", "category", "notes"],
  },
  {
    key: "finance_budgets",
    kind: "table",
    summary: "Monthly budget plans with income and totals.",
    model: "budget",
    fields: ["id", "name", "month", "year", "totalIncome", "totalBudget", "rolloverMode", "notes"],
    orderBy: { year: "desc" },
  },
  {
    key: "finance_goals",
    kind: "table",
    summary: "Savings goals: target, progress, deadline.",
    model: "savingsGoal",
    fields: ["id", "name", "targetAmount", "currentAmount", "currency", "deadline", "isCompleted", "notes"],
    orderBy: { createdAt: "desc" },
    search: ["name"],
  },
  {
    key: "finance_pockets",
    kind: "table",
    summary: "Envelope pockets and their balances.",
    model: "fundPocket",
    fields: ["id", "name", "slug", "description", "isCanonical", "currentBalance", "targetAmount", "active", "sortOrder"],
    orderBy: { sortOrder: "asc" },
    search: ["name"],
  },
  {
    key: "finance_obligations",
    kind: "table",
    summary: "Recurring bills: amount, frequency, next due.",
    model: "scheduledObligation",
    fields: ["id", "name", "amount", "currency", "category", "subcategory", "frequency", "dueDay", "nextOccurrenceAt", "active", "notes"],
    orderBy: { nextOccurrenceAt: "asc" },
    search: ["name", "category"],
  },
  {
    key: "finance_recurring",
    kind: "table",
    summary: "Subscription/salary templates.",
    model: "recurringTransaction",
    fields: ["id", "description", "amount", "currency", "category", "type", "frequency", "dayOfMonth", "nextDueDate", "isActive"],
    orderBy: { nextDueDate: "asc" },
    search: ["description"],
  },
  {
    key: "finance_upcoming",
    kind: "table",
    summary: "Detected bills due, from statements and emails.",
    model: "upcomingPayment",
    fields: ["id", "description", "dueDate", "amount", "minimumDue", "statementBalance", "currency", "category", "status"],
    dateField: "dueDate",
    orderBy: { dueDate: "asc" },
    search: ["description"],
  },
  {
    key: "finance_merchants",
    kind: "table",
    summary: "Payees with transaction counts and lifetime spend.",
    model: "merchant",
    fields: ["id", "name", "normalizedName", "categoryHint", "transactionCount", "totalSpent"],
    orderBy: { totalSpent: "desc" },
    search: ["name", "normalizedName"],
  },
] as const;

export const REGISTRY_BY_KEY = new Map(REGISTRY.map((spec) => [spec.key, spec]));
export const DATASET_KEYS = REGISTRY.map((spec) => spec.key);

export function getSpec(key: string): DatasetSpec | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function limitsFor(spec: DatasetSpec) {
  return {
    defaultLimit: spec.defaultLimit ?? DEFAULT_LIMIT,
    maxLimit: spec.maxLimit ?? DEFAULT_MAX,
  };
}

/** The catalog block injected into the tool description. */
export function buildCatalog(): string {
  return REGISTRY.map((spec) => `${spec.key} = ${spec.summary}`).join("\n");
}

/**
 * Models deliberately unreachable. Michael approved excluding these on
 * 2026-08-26 — "everything you have" does not mean "your OAuth refresh
 * tokens". Kept as a list (not a comment) so a test can assert it.
 *
 *   credentials  : finance vault, integration secrets, Strava/Google tokens,
 *                  PIN hash, device sessions, push tokens
 *   blobs        : recording audio bytes
 *   licensing    : EsvPassage — Crossway forbids a substantially complete copy,
 *                  so scripture reaches the model per-passage, never in bulk
 *   recursion    : ChatMessage IS the history; re-reading it is a footgun
 *   pipeline     : finance ingest internals, replaced by finance_summary
 *   injection    : FinanceDocument.contentText is attacker-influenced (it comes
 *                  from email) and the model can emit proposal tools — held
 *                  back in v1
 */
export const EXCLUDED_MODELS = [
  "financeVaultSecret", "integrationSecret", "stravaToken", "authCredential",
  "deviceSession", "pushSubscription", "pushDevice", "googleMailboxConnection",
  "recordingSegment", "esvPassage", "chatMessage", "aIConversation",
  "aIInsightCache", "aIUsageEvent", "financeSignal", "financeRule",
  "financeLearningEvent", "transactionChangeLog", "financeReviewItem",
  "financeSource", "financePrioritySource", "financeDocument",
] as const;

/**
 * Column names that must never appear in a `fields` allowlist, whatever the
 * model. Enforced by a test so a careless one-line registry addition fails at
 * CI rather than dumping a megabyte of base64 into a chat turn.
 */
export const FORBIDDEN_FIELDS = [
  "strokes", "objects", "thumbnail", "imageData", "photoData", "bytes",
  "html", "rawData", "routeData", "cipherText", "pinHash", "tokenHash",
  "refreshTokenHash", "authTag", "iv", "value", "pinnedAt", "accessToken",
  "refreshToken", "contentText", "extractedData",
] as const;
