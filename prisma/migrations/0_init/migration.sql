-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "food_logs" (
    "id" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mealType" TEXT NOT NULL,
    "foodDescription" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_measurements" (
    "id" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightKg" DOUBLE PRECISION,
    "bodyFatPct" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "chestCm" DOUBLE PRECISION,
    "armsCm" DOUBLE PRECISION,
    "legsCm" DOUBLE PRECISION,
    "hipsCm" DOUBLE PRECISION,
    "shouldersCm" DOUBLE PRECISION,
    "neckCm" DOUBLE PRECISION,
    "forearmsCm" DOUBLE PRECISION,
    "calvesCm" DOUBLE PRECISION,
    "skinfoldData" JSONB,
    "notes" TEXT,
    "bmi" DOUBLE PRECISION,
    "fatFreeWeightKg" DOUBLE PRECISION,
    "subcutaneousFatPct" DOUBLE PRECISION,
    "visceralFat" INTEGER,
    "bodyWaterPct" DOUBLE PRECISION,
    "skeletalMusclePct" DOUBLE PRECISION,
    "muscleMassKg" DOUBLE PRECISION,
    "boneMassKg" DOUBLE PRECISION,
    "proteinPct" DOUBLE PRECISION,
    "bmrKcal" INTEGER,
    "metabolicAge" INTEGER,
    "heartRateBpm" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "workoutType" TEXT NOT NULL,
    "description" TEXT,
    "caloriesBurned" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "stepCount" INTEGER,
    "avgHeartRateBpm" INTEGER,
    "maxHeartRateBpm" INTEGER,
    "elevationGainM" DOUBLE PRECISION,
    "routeData" JSONB,
    "metricsData" JSONB,
    "deviceType" TEXT,
    "externalSource" TEXT,
    "externalId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'synced',
    "exercises" JSONB,
    "stravaActivityId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_logs" (
    "id" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountMl" INTEGER NOT NULL DEFAULT 250,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_foods" (
    "id" TEXT NOT NULL,
    "foodDescription" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorite_foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "fitnessLevel" TEXT NOT NULL,
    "daysPerWeek" INTEGER NOT NULL DEFAULT 4,
    "schedule" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_completions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "dayLabel" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "actualExercises" JSONB,
    "caloriesBurned" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "userNotes" TEXT,
    "aiSuggestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plan_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "icon" TEXT,
    "category" TEXT NOT NULL DEFAULT 'manual',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT,
    "recurrenceParentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "actionTaken" TEXT,
    "extractedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_photos" (
    "id" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageData" TEXT NOT NULL,
    "journalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insight_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insight_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_credentials" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pinHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "platform" TEXT,
    "deviceType" TEXT,
    "tokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_health_snapshots" (
    "id" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "restingHeartRateBpm" INTEGER,
    "activeEnergyKcal" DOUBLE PRECISION,
    "walkingRunningDistanceMeters" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'apple_health',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL DEFAULT '/todos',
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "todoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strava_tokens" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "athleteId" INTEGER NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'activity:read_all',
    "athleteName" TEXT,
    "athletePhoto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DOUBLE PRECISION,
    "interestRate" DOUBLE PRECISION,
    "institution" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "icon" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "merchantId" TEXT,
    "transactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "type" TEXT NOT NULL,
    "pocketId" TEXT,
    "needsCategorization" BOOLEAN NOT NULL DEFAULT false,
    "instrumentType" TEXT,
    "instrumentLast4" TEXT,
    "cashImpactType" TEXT NOT NULL DEFAULT 'non_cash',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "merchant" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "tags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "settlementStatus" TEXT NOT NULL DEFAULT 'settled',
    "reviewState" TEXT NOT NULL DEFAULT 'resolved',
    "confidence" DOUBLE PRECISION,
    "sourceAmount" DOUBLE PRECISION,
    "sourceCurrency" TEXT,
    "fxRate" DOUBLE PRECISION,
    "fxDate" TIMESTAMP(3),
    "amountConfidence" DOUBLE PRECISION,
    "amountExtractionLabel" TEXT,
    "requiresCurrencyReview" BOOLEAN NOT NULL DEFAULT false,
    "subtotalAmount" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "tipAmount" DOUBLE PRECISION,
    "deductible" BOOLEAN NOT NULL DEFAULT false,
    "excludedFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "refundOfId" TEXT,
    "duplicateOfId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceFingerprint" TEXT,
    "groupKey" TEXT,
    "orderRef" TEXT,
    "chargeRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "parentId" TEXT,
    "defaultPocketId" TEXT,
    "isTaxRelevant" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rolloverMode" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "planned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "currentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "deadline" TIMESTAMP(3),
    "icon" TEXT,
    "color" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_mailbox_connections" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "email" TEXT NOT NULL,
    "grantedScopes" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'connected',
    "historyId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastBackfillAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncLookbackMonths" INTEGER NOT NULL DEFAULT 12,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_mailbox_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_vault_secrets" (
    "id" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "context" JSONB,
    "cipherText" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_vault_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_documents" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "classification" TEXT NOT NULL DEFAULT 'unclassified',
    "messageSubtype" TEXT NOT NULL DEFAULT 'unknown',
    "processingStage" TEXT NOT NULL DEFAULT 'captured',
    "mailConnectionId" TEXT,
    "sourceId" TEXT,
    "sourceKey" TEXT,
    "groupKey" TEXT,
    "orderRef" TEXT,
    "chargeRef" TEXT,
    "messageId" TEXT,
    "threadId" TEXT,
    "attachmentId" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "sender" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3),
    "contentText" TEXT,
    "extractedData" JSONB,
    "parseError" TEXT,
    "requiresPassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordSecretKey" TEXT,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "promotedSignalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" JSONB,
    "categoryHint" TEXT,
    "subcategoryHint" TEXT,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTip" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_sources" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "senderEmail" TEXT,
    "senderDomain" TEXT,
    "trustLevel" TEXT NOT NULL DEFAULT 'new',
    "defaultDisposition" TEXT NOT NULL DEFAULT 'capture_only',
    "merchantId" TEXT,
    "categoryHint" TEXT,
    "subcategoryHint" TEXT,
    "countryHint" TEXT,
    "currencyHint" TEXT,
    "localeHint" TEXT,
    "isBiller" BOOLEAN NOT NULL DEFAULT false,
    "isIncomeSource" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "prioritySourceRole" TEXT,
    "priorityInstitution" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "ignoredCount" INTEGER NOT NULL DEFAULT 0,
    "autoPostCount" INTEGER NOT NULL DEFAULT 0,
    "provisionalCount" INTEGER NOT NULL DEFAULT 0,
    "settledCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lastLearningEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL DEFAULT 'merchant',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "learned" BOOLEAN NOT NULL DEFAULT false,
    "merchantId" TEXT,
    "sourceId" TEXT,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_signals" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceId" TEXT,
    "merchantId" TEXT,
    "matchedRuleId" TEXT,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "promotionState" TEXT NOT NULL DEFAULT 'pending_review',
    "messageSubtype" TEXT NOT NULL DEFAULT 'unknown',
    "settlementStatus" TEXT NOT NULL DEFAULT 'provisional',
    "confidence" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "sourceAmount" DOUBLE PRECISION,
    "sourceCurrency" TEXT,
    "fxRate" DOUBLE PRECISION,
    "fxDate" TIMESTAMP(3),
    "instrumentType" TEXT,
    "instrumentLast4" TEXT,
    "cashImpactType" TEXT NOT NULL DEFAULT 'non_cash',
    "amountConfidence" DOUBLE PRECISION,
    "amountExtractionLabel" TEXT,
    "requiresCurrencyReview" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "type" TEXT,
    "transactedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "subtotalAmount" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "tipAmount" DOUBLE PRECISION,
    "minimumDue" DOUBLE PRECISION,
    "statementBalance" DOUBLE PRECISION,
    "reference" TEXT,
    "groupKey" TEXT,
    "orderRef" TEXT,
    "chargeRef" TEXT,
    "notes" TEXT,
    "fingerprint" TEXT,
    "extractedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_review_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT,
    "documentId" TEXT,
    "sourceId" TEXT,
    "signalId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "suggestedData" JSONB,
    "resolution" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upcoming_payments" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "merchantId" TEXT,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "minimumDue" DOUBLE PRECISION,
    "statementBalance" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'detected',
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upcoming_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_change_logs" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_learning_events" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "ruleId" TEXT,
    "signalId" TEXT,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_priority_sources" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceRole" TEXT NOT NULL,
    "institution" TEXT,
    "provider" TEXT,
    "senderEmailPattern" TEXT,
    "senderDomainPattern" TEXT,
    "subjectPattern" TEXT,
    "defaultDisposition" TEXT NOT NULL DEFAULT 'capture_only',
    "parserPriority" INTEGER NOT NULL DEFAULT 100,
    "isPinned" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordSecretKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_priority_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_obligations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "frequency" TEXT NOT NULL,
    "dueDay" INTEGER,
    "nextOccurrenceAt" TIMESTAMP(3),
    "defaultAccountId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_obligation_occurrences" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    "paidAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "notes" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_obligation_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_pockets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetAmount" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_pockets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paycheck_allocation_rules" (
    "id" TEXT NOT NULL,
    "pocketId" TEXT NOT NULL,
    "name" TEXT,
    "percentOfIncome" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paycheck_allocation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paycheck_allocation_runs" (
    "id" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "runType" TEXT NOT NULL DEFAULT 'paycheck',
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "suggestedAllocations" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "promptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paycheck_allocation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pocket_entries" (
    "id" TEXT NOT NULL,
    "pocketId" TEXT NOT NULL,
    "allocationRunId" TEXT,
    "sourceTransactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'allocation',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pocket_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_snapshots" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rate_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_logs_loggedAt_idx" ON "food_logs"("loggedAt");

-- CreateIndex
CREATE INDEX "body_measurements_measuredAt_idx" ON "body_measurements"("measuredAt");

-- CreateIndex
CREATE INDEX "workout_logs_startedAt_idx" ON "workout_logs"("startedAt");

-- CreateIndex
CREATE INDEX "workout_logs_externalSource_externalId_idx" ON "workout_logs"("externalSource", "externalId");

-- CreateIndex
CREATE INDEX "workout_logs_syncStatus_idx" ON "workout_logs"("syncStatus");

-- CreateIndex
CREATE INDEX "water_logs_loggedAt_idx" ON "water_logs"("loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plan_completions_planId_scheduledDate_dayIndex_key" ON "workout_plan_completions"("planId", "scheduledDate", "dayIndex");

-- CreateIndex
CREATE INDEX "todos_completed_dueDate_idx" ON "todos"("completed", "dueDate");

-- CreateIndex
CREATE INDEX "todos_dueDate_idx" ON "todos"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insight_cache_cacheKey_key" ON "ai_insight_cache"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_tokenHash_key" ON "device_sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_refreshTokenHash_key" ON "device_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "device_sessions_expiresAt_idx" ON "device_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "device_sessions_refreshExpiresAt_idx" ON "device_sessions"("refreshExpiresAt");

-- CreateIndex
CREATE INDEX "device_sessions_revokedAt_idx" ON "device_sessions"("revokedAt");

-- CreateIndex
CREATE INDEX "daily_health_snapshots_localDate_timeZone_idx" ON "daily_health_snapshots"("localDate", "timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "daily_health_snapshots_localDate_timeZone_source_key" ON "daily_health_snapshots"("localDate", "timeZone", "source");

-- CreateIndex
CREATE INDEX "reminders_fired_remindAt_idx" ON "reminders"("fired", "remindAt");

-- CreateIndex
CREATE INDEX "financial_transactions_transactedAt_idx" ON "financial_transactions"("transactedAt");

-- CreateIndex
CREATE INDEX "financial_transactions_accountId_idx" ON "financial_transactions"("accountId");

-- CreateIndex
CREATE INDEX "financial_transactions_category_idx" ON "financial_transactions"("category");

-- CreateIndex
CREATE INDEX "financial_transactions_merchantId_idx" ON "financial_transactions"("merchantId");

-- CreateIndex
CREATE INDEX "financial_transactions_status_idx" ON "financial_transactions"("status");

-- CreateIndex
CREATE INDEX "financial_transactions_settlementStatus_idx" ON "financial_transactions"("settlementStatus");

-- CreateIndex
CREATE INDEX "financial_transactions_reviewState_idx" ON "financial_transactions"("reviewState");

-- CreateIndex
CREATE INDEX "financial_transactions_pocketId_idx" ON "financial_transactions"("pocketId");

-- CreateIndex
CREATE INDEX "financial_transactions_needsCategorization_transactedAt_idx" ON "financial_transactions"("needsCategorization", "transactedAt");

-- CreateIndex
CREATE INDEX "financial_transactions_sourceFingerprint_idx" ON "financial_transactions"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "financial_transactions_groupKey_idx" ON "financial_transactions"("groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_month_year_key" ON "budgets"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_items_budgetId_categoryId_key" ON "budget_items"("budgetId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_vault_secrets_secretKey_key" ON "finance_vault_secrets"("secretKey");

-- CreateIndex
CREATE INDEX "finance_vault_secrets_kind_idx" ON "finance_vault_secrets"("kind");

-- CreateIndex
CREATE INDEX "finance_documents_sourceId_idx" ON "finance_documents"("sourceId");

-- CreateIndex
CREATE INDEX "finance_documents_classification_processingStage_idx" ON "finance_documents"("classification", "processingStage");

-- CreateIndex
CREATE INDEX "finance_documents_messageSubtype_idx" ON "finance_documents"("messageSubtype");

-- CreateIndex
CREATE INDEX "finance_documents_sourceKey_idx" ON "finance_documents"("sourceKey");

-- CreateIndex
CREATE INDEX "finance_documents_groupKey_idx" ON "finance_documents"("groupKey");

-- CreateIndex
CREATE INDEX "finance_documents_messageId_idx" ON "finance_documents"("messageId");

-- CreateIndex
CREATE INDEX "finance_documents_threadId_idx" ON "finance_documents"("threadId");

-- CreateIndex
CREATE INDEX "finance_documents_status_idx" ON "finance_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_documents_source_externalId_key" ON "finance_documents"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_normalizedName_key" ON "merchants"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "finance_sources_sourceKey_key" ON "finance_sources"("sourceKey");

-- CreateIndex
CREATE INDEX "finance_sources_trustLevel_defaultDisposition_idx" ON "finance_sources"("trustLevel", "defaultDisposition");

-- CreateIndex
CREATE INDEX "finance_sources_senderDomain_idx" ON "finance_sources"("senderDomain");

-- CreateIndex
CREATE INDEX "finance_rules_isActive_priority_idx" ON "finance_rules"("isActive", "priority");

-- CreateIndex
CREATE INDEX "finance_rules_merchantId_idx" ON "finance_rules"("merchantId");

-- CreateIndex
CREATE INDEX "finance_rules_sourceId_idx" ON "finance_rules"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_signals_fingerprint_key" ON "finance_signals"("fingerprint");

-- CreateIndex
CREATE INDEX "finance_signals_documentId_idx" ON "finance_signals"("documentId");

-- CreateIndex
CREATE INDEX "finance_signals_sourceId_promotionState_idx" ON "finance_signals"("sourceId", "promotionState");

-- CreateIndex
CREATE INDEX "finance_signals_kind_status_idx" ON "finance_signals"("kind", "status");

-- CreateIndex
CREATE INDEX "finance_signals_messageSubtype_settlementStatus_idx" ON "finance_signals"("messageSubtype", "settlementStatus");

-- CreateIndex
CREATE INDEX "finance_signals_groupKey_idx" ON "finance_signals"("groupKey");

-- CreateIndex
CREATE INDEX "finance_signals_transactionId_idx" ON "finance_signals"("transactionId");

-- CreateIndex
CREATE INDEX "finance_review_items_status_kind_idx" ON "finance_review_items"("status", "kind");

-- CreateIndex
CREATE INDEX "finance_review_items_signalId_idx" ON "finance_review_items"("signalId");

-- CreateIndex
CREATE INDEX "finance_review_items_sourceId_idx" ON "finance_review_items"("sourceId");

-- CreateIndex
CREATE INDEX "upcoming_payments_dueDate_status_idx" ON "upcoming_payments"("dueDate", "status");

-- CreateIndex
CREATE INDEX "transaction_change_logs_transactionId_createdAt_idx" ON "transaction_change_logs"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_learning_events_sourceId_createdAt_idx" ON "finance_learning_events"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_learning_events_ruleId_createdAt_idx" ON "finance_learning_events"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_learning_events_signalId_createdAt_idx" ON "finance_learning_events"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_priority_sources_active_parserPriority_idx" ON "finance_priority_sources"("active", "parserPriority");

-- CreateIndex
CREATE INDEX "finance_priority_sources_sourceRole_idx" ON "finance_priority_sources"("sourceRole");

-- CreateIndex
CREATE INDEX "scheduled_obligations_active_nextOccurrenceAt_idx" ON "scheduled_obligations"("active", "nextOccurrenceAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_obligation_occurrences_transactionId_key" ON "scheduled_obligation_occurrences"("transactionId");

-- CreateIndex
CREATE INDEX "scheduled_obligation_occurrences_dueDate_status_idx" ON "scheduled_obligation_occurrences"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_obligation_occurrences_obligationId_dueDate_key" ON "scheduled_obligation_occurrences"("obligationId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "fund_pockets_slug_key" ON "fund_pockets"("slug");

-- CreateIndex
CREATE INDEX "fund_pockets_active_sortOrder_idx" ON "fund_pockets"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "paycheck_allocation_rules_active_priority_idx" ON "paycheck_allocation_rules"("active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "paycheck_allocation_runs_sourceTransactionId_key" ON "paycheck_allocation_runs"("sourceTransactionId");

-- CreateIndex
CREATE INDEX "paycheck_allocation_runs_status_promptedAt_idx" ON "paycheck_allocation_runs"("status", "promptedAt");

-- CreateIndex
CREATE INDEX "pocket_entries_pocketId_occurredAt_idx" ON "pocket_entries"("pocketId", "occurredAt");

-- CreateIndex
CREATE INDEX "exchange_rate_snapshots_rateDate_provider_idx" ON "exchange_rate_snapshots"("rateDate", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_snapshots_baseCurrency_quoteCurrency_rateDate_key" ON "exchange_rate_snapshots"("baseCurrency", "quoteCurrency", "rateDate", "provider");

-- AddForeignKey
ALTER TABLE "workout_plan_completions" ADD CONSTRAINT "workout_plan_completions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "finance_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_defaultPocketId_fkey" FOREIGN KEY ("defaultPocketId") REFERENCES "fund_pockets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_mailConnectionId_fkey" FOREIGN KEY ("mailConnectionId") REFERENCES "google_mailbox_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_sources" ADD CONSTRAINT "finance_sources_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "finance_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "finance_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upcoming_payments" ADD CONSTRAINT "upcoming_payments_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "finance_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upcoming_payments" ADD CONSTRAINT "upcoming_payments_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_change_logs" ADD CONSTRAINT "transaction_change_logs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "finance_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "finance_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_obligations" ADD CONSTRAINT "scheduled_obligations_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_obligation_occurrences" ADD CONSTRAINT "scheduled_obligation_occurrences_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "scheduled_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_obligation_occurrences" ADD CONSTRAINT "scheduled_obligation_occurrences_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paycheck_allocation_rules" ADD CONSTRAINT "paycheck_allocation_rules_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paycheck_allocation_runs" ADD CONSTRAINT "paycheck_allocation_runs_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_allocationRunId_fkey" FOREIGN KEY ("allocationRunId") REFERENCES "paycheck_allocation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

