import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FinanceTransactionType = "income" | "expense" | "transfer";
export type FinanceInboxStatus = "pending" | "approved" | "rejected";
export type FinanceInboxSource = "gmail" | "manual";

export interface FinanceInboxParsedTransaction {
  transactedAt: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  subcategory?: string | null;
  type: FinanceTransactionType;
  merchant?: string | null;
  reference?: string | null;
  confidence?: number | null;
}

export interface FinanceInboxItem {
  id: string;
  status: FinanceInboxStatus;
  source: FinanceInboxSource;
  sourceMessageId?: string | null;
  sender?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  accountId?: string | null;
  rawSnippet: string;
  fingerprint: string;
  parsed: FinanceInboxParsedTransaction;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  linkedTransactionId?: string | null;
}

export interface FinanceInboxMeta {
  lastFetchedAt?: string | null;
  lastFetchCount?: number | null;
  lastFetchQuery?: string | null;
}

export interface FinanceInboxState {
  items: FinanceInboxItem[];
  meta: FinanceInboxMeta;
}

type SettingsData = Record<string, unknown>;

const SETTINGS_ID = "default";
const MAX_ITEMS = 600;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIso(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeType(value: unknown): FinanceTransactionType {
  if (value === "income" || value === "expense" || value === "transfer") {
    return value;
  }
  return "expense";
}

function normalizeStatus(value: unknown): FinanceInboxStatus {
  if (value === "approved" || value === "rejected" || value === "pending") {
    return value;
  }
  return "pending";
}

function normalizeSource(value: unknown): FinanceInboxSource {
  if (value === "gmail" || value === "manual") return value;
  return "manual";
}

function normalizeParsed(value: unknown): FinanceInboxParsedTransaction | null {
  if (!isObject(value)) return null;

  const description =
    typeof value.description === "string" && value.description.trim().length > 0
      ? value.description.trim()
      : null;
  if (!description) return null;

  const amountValue =
    typeof value.amount === "number"
      ? value.amount
      : Number.parseFloat(String(value.amount ?? ""));
  if (!Number.isFinite(amountValue) || amountValue <= 0) return null;

  const category =
    typeof value.category === "string" && value.category.trim().length > 0
      ? value.category.trim().toLowerCase()
      : "other";

  return {
    transactedAt: toIso(value.transactedAt),
    amount: Math.abs(amountValue),
    currency:
      typeof value.currency === "string" && value.currency.trim().length > 0
        ? value.currency.trim().toUpperCase()
        : "COP",
    description,
    category,
    subcategory:
      typeof value.subcategory === "string" && value.subcategory.trim().length > 0
        ? value.subcategory.trim().toLowerCase()
        : null,
    type: normalizeType(value.type),
    merchant:
      typeof value.merchant === "string" && value.merchant.trim().length > 0
        ? value.merchant.trim()
        : null,
    reference:
      typeof value.reference === "string" && value.reference.trim().length > 0
        ? value.reference.trim()
        : null,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? value.confidence
        : null,
  };
}

function normalizeItem(value: unknown): FinanceInboxItem | null {
  if (!isObject(value)) return null;

  const id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id.trim() : null;
  const parsed = normalizeParsed(value.parsed);
  if (!id || !parsed) return null;

  const fingerprint =
    typeof value.fingerprint === "string" && value.fingerprint.trim().length > 0
      ? value.fingerprint.trim()
      : `${parsed.type}:${parsed.amount}:${parsed.description.toLowerCase()}:${parsed.transactedAt}`;

  return {
    id,
    status: normalizeStatus(value.status),
    source: normalizeSource(value.source),
    sourceMessageId:
      typeof value.sourceMessageId === "string" && value.sourceMessageId.trim().length > 0
        ? value.sourceMessageId.trim()
        : null,
    sender:
      typeof value.sender === "string" && value.sender.trim().length > 0
        ? value.sender.trim()
        : null,
    subject:
      typeof value.subject === "string" && value.subject.trim().length > 0
        ? value.subject.trim()
        : null,
    receivedAt:
      typeof value.receivedAt === "string" && value.receivedAt.trim().length > 0
        ? toIso(value.receivedAt)
        : null,
    accountId:
      typeof value.accountId === "string" && value.accountId.trim().length > 0
        ? value.accountId.trim()
        : null,
    rawSnippet:
      typeof value.rawSnippet === "string"
        ? value.rawSnippet.slice(0, 5000)
        : "",
    fingerprint,
    parsed,
    createdAt: toIso(value.createdAt),
    reviewedAt:
      typeof value.reviewedAt === "string" && value.reviewedAt.trim().length > 0
        ? toIso(value.reviewedAt)
        : null,
    reviewNotes:
      typeof value.reviewNotes === "string" && value.reviewNotes.trim().length > 0
        ? value.reviewNotes.trim()
        : null,
    linkedTransactionId:
      typeof value.linkedTransactionId === "string" && value.linkedTransactionId.trim().length > 0
        ? value.linkedTransactionId.trim()
        : null,
  };
}

function normalizeMeta(value: unknown): FinanceInboxMeta {
  if (!isObject(value)) return {};
  return {
    lastFetchedAt:
      typeof value.lastFetchedAt === "string" && value.lastFetchedAt.trim().length > 0
        ? toIso(value.lastFetchedAt)
        : null,
    lastFetchCount:
      typeof value.lastFetchCount === "number" && Number.isFinite(value.lastFetchCount)
        ? value.lastFetchCount
        : null,
    lastFetchQuery:
      typeof value.lastFetchQuery === "string" && value.lastFetchQuery.trim().length > 0
        ? value.lastFetchQuery.trim()
        : null,
  };
}

function sortItems(items: FinanceInboxItem[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

function trimItems(items: FinanceInboxItem[]) {
  return sortItems(items).slice(0, MAX_ITEMS);
}

export function normalizeQueueItems(items: unknown[]) {
  const normalized = items
    .map((item) => normalizeItem(item))
    .filter((item): item is FinanceInboxItem => Boolean(item));
  return trimItems(normalized);
}

export function buildFinanceInboxFingerprint(input: {
  source: FinanceInboxSource;
  sourceMessageId?: string | null;
  sender?: string | null;
  subject?: string | null;
  transactedAt?: string | null;
  amount?: number | null;
  description?: string | null;
}) {
  const material = [
    input.source,
    (input.sourceMessageId || "").toLowerCase(),
    (input.sender || "").toLowerCase(),
    (input.subject || "").toLowerCase(),
    (input.transactedAt || "").toLowerCase(),
    Number.isFinite(input.amount) ? String(input.amount) : "",
    (input.description || "").toLowerCase().replace(/\s+/g, " ").trim(),
  ]
    .join("|")
    .trim();
  return material;
}

export async function getFinanceInboxState(): Promise<{
  data: SettingsData;
  state: FinanceInboxState;
}> {
  const row = await prisma.userSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { data: true },
  });

  const data = (row?.data as SettingsData | null) ?? {};
  const financeInbox = isObject(data.financeInbox) ? data.financeInbox : {};
  const queue = Array.isArray(financeInbox.queue) ? financeInbox.queue : [];
  const meta = normalizeMeta(financeInbox.meta);

  return {
    data,
    state: {
      items: normalizeQueueItems(queue),
      meta,
    },
  };
}

export async function saveFinanceInboxState(
  data: SettingsData,
  state: FinanceInboxState
) {
  const nextData: SettingsData = {
    ...data,
    financeInbox: {
      queue: trimItems(state.items),
      meta: normalizeMeta(state.meta),
    },
  };

  await prisma.userSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      data: nextData as Prisma.InputJsonValue,
    },
    update: {
      data: nextData as Prisma.InputJsonValue,
    },
  });
}

