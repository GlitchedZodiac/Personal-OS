import { subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  FINANCE_GMAIL_LOOKBACK_MONTHS,
  FINANCE_GMAIL_QUERY,
  FINANCE_GMAIL_SYNC_MINUTES,
} from "@/lib/finance/constants";
import { ingestFinanceCandidate } from "@/lib/finance/ingestion";
import { extractPdfText, isEncryptedPdf } from "@/lib/finance/pdf";
import { normalizeMerchantName } from "@/lib/finance/pipeline-utils";
import { getVaultSecret, upsertVaultSecret } from "@/lib/finance/vault";

const GOOGLE_TOKEN_SECRET_KEY = "gmail:default:oauth-token";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const FINANCE_GOOGLE_OAUTH_STATE_COOKIE = "finance_google_oauth_state";
export const FINANCE_GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

interface GoogleTokenPayload {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  tokenType?: string;
  scope?: string;
}

interface GmailMessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: { size?: number; data?: string; attachmentId?: string };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  snippet?: string;
}

interface FinanceServerSettingsShape {
  finance?: {
    syncIntervalMinutes?: unknown;
    gmailLookbackMonths?: unknown;
  };
}

interface FinanceGoogleSetupStatus {
  configured: boolean;
  oauthConfigured: boolean;
  vaultConfigured: boolean;
  setupMessage: string | null;
}

function coerceSettingNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readFinanceSettings(data: unknown): FinanceServerSettingsShape["finance"] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const finance = (data as Record<string, unknown>).finance;
  if (!finance || typeof finance !== "object" || Array.isArray(finance)) return null;
  return finance as FinanceServerSettingsShape["finance"];
}

export function getGoogleFinanceSetupStatus(): FinanceGoogleSetupStatus {
  const oauthConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
  const vaultConfigured = Boolean(process.env.FINANCE_VAULT_MASTER_KEY?.trim());

  let setupMessage: string | null = null;
  if (!oauthConfigured && !vaultConfigured) {
    setupMessage =
      "Google OAuth and finance vault encryption are not configured on the server yet.";
  } else if (!oauthConfigured) {
    setupMessage = "Google OAuth is not configured on the server yet.";
  } else if (!vaultConfigured) {
    setupMessage = "Finance vault encryption is not configured on the server yet.";
  }

  return {
    configured: oauthConfigured && vaultConfigured,
    oauthConfigured,
    vaultConfigured,
    setupMessage,
  };
}

async function getFinanceSyncPreferences() {
  const row = await prisma.userSettings.findUnique({
    where: { id: "default" },
    select: { data: true },
  });
  const finance = readFinanceSettings(row?.data);

  return {
    syncIntervalMinutes: coerceSettingNumber(
      finance?.syncIntervalMinutes,
      FINANCE_GMAIL_SYNC_MINUTES,
      5,
      1440
    ),
    syncLookbackMonths: coerceSettingNumber(
      finance?.gmailLookbackMonths,
      FINANCE_GMAIL_LOOKBACK_MONTHS,
      1,
      60
    ),
  };
}

function decodeBase64Url(value?: string) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function getHeader(payload: GmailMessagePart | undefined, name: string) {
  return payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTextParts(part?: GmailMessagePart): string[] {
  if (!part) return [];
  const results: string[] = [];

  if (part.mimeType === "text/plain" && part.body?.data) {
    results.push(decodeBase64Url(part.body.data));
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    results.push(stripHtml(decodeBase64Url(part.body.data)));
  }

  for (const child of part.parts || []) {
    results.push(...collectTextParts(child));
  }

  return results;
}

function collectAttachments(part?: GmailMessagePart, collected: GmailMessagePart[] = []) {
  if (!part) return collected;

  if (part.filename && part.body?.attachmentId) {
    collected.push(part);
  }

  for (const child of part.parts || []) {
    collectAttachments(child, collected);
  }

  return collected;
}

function extractSenderName(value: string) {
  const match = value.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return value.split("@")[0]?.trim() || value;
}

function extractAmount(text: string) {
  const matches = text.match(/(?:COP|\$)?\s*-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/g) || [];
  const values = matches
    .map((value) => {
      const normalized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
      const amount = Number(normalized);
      return Number.isFinite(amount) ? amount : null;
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return Math.max(...values);
}

function extractDueDate(text: string) {
  const dateMatch =
    text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/) ||
    text.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);

  if (!dateMatch) return null;

  if (dateMatch[0].includes("-")) {
    return new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00`);
  }

  return new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T12:00:00`);
}

function looksFinancial(text: string) {
  return /receipt|invoice|payment|paid|purchase|statement|subscription|refund|bill|factura|recibo|pago|cobro|reembolso|transaction/i.test(
    text
  );
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gmail request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getStoredToken() {
  return getVaultSecret<GoogleTokenPayload>(GOOGLE_TOKEN_SECRET_KEY);
}

async function saveStoredToken(token: GoogleTokenPayload) {
  await upsertVaultSecret(GOOGLE_TOKEN_SECRET_KEY, "gmail_token", token, {
    label: "Gmail OAuth token",
    context: { provider: "google", scope: GMAIL_SCOPE },
  });
}

async function refreshAccessToken() {
  const existing = await getStoredToken();
  if (!existing?.refreshToken) {
    throw new Error("No Google refresh token stored");
  }

  if (existing.expiryDate > Date.now() + 60_000) {
    return existing.accessToken;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: existing.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  const updated: GoogleTokenPayload = {
    accessToken: data.access_token,
    refreshToken: existing.refreshToken,
    expiryDate: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };
  await saveStoredToken(updated);
  return updated.accessToken;
}

export function getGoogleFinanceAuthUrl(origin: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", `${origin}/api/finance/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleFinanceCode(code: string, origin: string) {
  const setup = getGoogleFinanceSetupStatus();
  if (!setup.configured) {
    throw new Error(setup.setupMessage || "Google finance setup is incomplete");
  }

  const syncPreferences = await getFinanceSyncPreferences();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origin}/api/finance/google/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  const token: GoogleTokenPayload = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };
  await saveStoredToken(token);

  const profile = await gmailFetch<{ emailAddress: string; historyId: string }>(
    token.accessToken,
    "profile"
  );

  return prisma.googleMailboxConnection.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      email: profile.emailAddress,
      grantedScopes: data.scope || GMAIL_SCOPE,
      historyId: profile.historyId,
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      syncStatus: "connected",
      syncLookbackMonths: syncPreferences.syncLookbackMonths,
      syncIntervalMinutes: syncPreferences.syncIntervalMinutes,
    },
    update: {
      email: profile.emailAddress,
      grantedScopes: data.scope || GMAIL_SCOPE,
      historyId: profile.historyId,
      syncStatus: "connected",
      lastError: null,
      connectedAt: new Date(),
      syncLookbackMonths: syncPreferences.syncLookbackMonths,
      syncIntervalMinutes: syncPreferences.syncIntervalMinutes,
    },
  });
}

export async function disconnectGoogleFinanceMailbox() {
  await prisma.googleMailboxConnection.deleteMany({ where: { id: "default" } });
  await prisma.financeVaultSecret.deleteMany({ where: { secretKey: GOOGLE_TOKEN_SECRET_KEY } });
}

export async function getGoogleMailboxStatus() {
  const setup = getGoogleFinanceSetupStatus();
  const connection = await prisma.googleMailboxConnection.findUnique({ where: { id: "default" } });
  if (!connection) {
    return { connected: false, ...setup };
  }

  return {
    connected: true,
    ...setup,
    email: connection.email,
    historyId: connection.historyId,
    syncStatus: connection.syncStatus,
    lastSyncAt: connection.lastSyncAt,
    lastBackfillAt: connection.lastBackfillAt,
    lastError: connection.lastError,
    syncIntervalMinutes: connection.syncIntervalMinutes,
    syncLookbackMonths: connection.syncLookbackMonths,
  };
}

async function fetchAttachmentData(accessToken: string, messageId: string, attachmentId: string) {
  const response = await gmailFetch<{ data?: string }>(
    accessToken,
    `messages/${messageId}/attachments/${attachmentId}`
  );
  return Buffer.from((response.data || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function upsertUpcomingPayment(params: {
  sourceDocumentId: string;
  merchantId?: string | null;
  description: string;
  dueDate?: Date | null;
  amount?: number | null;
}) {
  if (!params.dueDate) return;

  const existing = await prisma.upcomingPayment.findFirst({
    where: { sourceDocumentId: params.sourceDocumentId, description: params.description },
  });

  if (existing) {
    await prisma.upcomingPayment.update({
      where: { id: existing.id },
      data: {
        dueDate: params.dueDate,
        amount: params.amount ?? undefined,
        merchantId: params.merchantId ?? undefined,
        status: "detected",
      },
    });
    return;
  }

  await prisma.upcomingPayment.create({
    data: {
      sourceDocumentId: params.sourceDocumentId,
      merchantId: params.merchantId ?? null,
      description: params.description,
      dueDate: params.dueDate,
      amount: params.amount ?? null,
      source: "email",
      status: "detected",
      confidence: 0.72,
    },
  });
}

function buildFinanceCandidateFromText(params: {
  source: string;
  sender: string;
  subject: string;
  text: string;
  receivedAt: Date;
  document: {
    source: string;
    externalId: string;
    documentType: string;
    messageId?: string;
    threadId?: string;
    attachmentId?: string;
    filename?: string;
    mimeType?: string;
    sender?: string;
    subject?: string;
    receivedAt?: Date;
    contentText?: string;
    requiresPassword?: boolean;
    status?: string;
    passwordSecretKey?: string;
    mailConnectionId?: string;
  };
}) {
  const merchantName = extractSenderName(params.sender);
  const description = params.subject || params.text.split(".")[0] || merchantName;
  const amount = extractAmount(`${params.subject} ${params.text}`);
  const lower = `${params.subject} ${params.text}`.toLowerCase();
  const type = /refund|reembolso/.test(lower)
    ? "income"
    : /salary|nomina|salario|deposito|abono/.test(lower)
    ? "income"
    : /transfer|transferencia|pse/.test(lower)
    ? "transfer"
    : "expense";
  const signalKind = /refund|reembolso/.test(lower)
    ? "refund"
    : /salary|nomina|salario|deposito|abono/.test(lower)
    ? "income"
    : /minimum due|minimo a pagar|payment due|statement|estado de cuenta|saldo total/.test(lower)
    ? "bill_due"
    : /transfer|transferencia|pse/.test(lower)
    ? "transfer"
    : /subscription|suscripcion|renewal|renovacion/.test(lower)
    ? "subscription"
    : "purchase";

  return {
    amount,
    description: description.slice(0, 180),
    merchant: merchantName,
    source: params.source,
    transactedAt: params.receivedAt,
    type,
    signalKind,
    notes: `Imported from Gmail sender ${params.sender}`,
    isRecurring: /subscription|suscripcion|monthly|mensual/.test(lower),
    promotionPreference: "source_policy" as const,
    document: params.document,
  } as const;
}

async function processGmailMessage(accessToken: string, message: GmailMessage, connectionId: string) {
  const full = await gmailFetch<GmailMessage>(accessToken, `messages/${message.id}?format=full`);
  const sender = getHeader(full.payload, "From");
  const subject = getHeader(full.payload, "Subject");
  const receivedAt = full.internalDate ? new Date(Number(full.internalDate)) : new Date();
  const text = collectTextParts(full.payload).join(" ").trim() || full.snippet || "";
  const messageExternalId = `gmail:${full.id}`;

  if (!looksFinancial(`${subject} ${text}`)) {
    return { documents: 0, signals: 0, promotedTransactions: 0, reviews: 0, upcoming: 0 };
  }

  const baseCandidate = buildFinanceCandidateFromText({
    source: "email",
    sender,
    subject,
    text,
    receivedAt,
    document: {
      source: "gmail_email",
      externalId: messageExternalId,
      documentType: "email",
      messageId: full.id,
      threadId: full.threadId,
      sender,
      subject,
      receivedAt,
      contentText: text,
      status: "processed",
      mailConnectionId: connectionId,
    },
  });

  const messageResult = await ingestFinanceCandidate(baseCandidate);
  if (messageResult.signal?.documentId) {
    await upsertUpcomingPayment({
      sourceDocumentId: messageResult.signal.documentId,
      merchantId: messageResult.merchant?.id,
      description: baseCandidate.description,
      dueDate: extractDueDate(`${subject} ${text}`),
      amount: baseCandidate.amount,
    });
  }

  let attachmentSignalCount = 0;
  let attachmentPromotedCount = 0;
  let attachmentReviewCount = 0;
  let upcomingCount = 0;

  for (const part of collectAttachments(full.payload)) {
    const filename = part.filename || "attachment";
    const attachmentId = part.body?.attachmentId;
    if (!attachmentId) continue;

    const mimeType = part.mimeType || "application/octet-stream";
    const attachmentExternalId = `gmail:${full.id}:${attachmentId}`;
    const data = await fetchAttachmentData(accessToken, full.id, attachmentId);

    let extractedText = "";
    let requiresPassword = false;
    let status = "processed";
    let parseError: string | null = null;
    const passwordSecretKey = `pdf:${normalizeMerchantName(sender) || "unknown"}:${filename.toLowerCase()}`;

    if (mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
      requiresPassword = isEncryptedPdf(data);
      if (requiresPassword) {
        status = "password_required";
      } else {
        extractedText = extractPdfText(data);
        if (!extractedText) {
          status = "error";
          parseError = "Could not extract text from PDF";
        }
      }
    }

    const attachmentResult = await ingestFinanceCandidate({
      amount: extractedText ? extractAmount(extractedText) : null,
      description: `${subject || filename} attachment`,
      merchant: extractSenderName(sender),
      source: "email_attachment",
      transactedAt: receivedAt,
      type: /refund|reembolso/i.test(extractedText) ? "income" : "expense",
      signalKind: /minimum due|minimo a pagar|payment due|statement|estado de cuenta|saldo total/i.test(
        extractedText
      )
        ? "bill_due"
        : /refund|reembolso/i.test(extractedText)
        ? "refund"
        : /salary|nomina|salario|deposito|abono/i.test(extractedText)
        ? "income"
        : /transfer|transferencia|pse/i.test(extractedText)
        ? "transfer"
        : /subscription|suscripcion|renewal|renovacion/i.test(extractedText)
        ? "subscription"
        : "purchase",
      notes: `Attachment from ${sender}`,
      promotionPreference: "source_policy",
      document: {
        source: "gmail_attachment",
        externalId: attachmentExternalId,
        documentType: mimeType.includes("pdf") ? "pdf" : "image",
        messageId: full.id,
        threadId: full.threadId,
        attachmentId,
        filename,
        mimeType,
        sender,
        subject,
        receivedAt,
        contentText: extractedText,
        requiresPassword,
        parseError,
        passwordSecretKey,
        status,
        mailConnectionId: connectionId,
      },
    });

    attachmentSignalCount += attachmentResult.signal ? 1 : 0;
    attachmentPromotedCount += attachmentResult.transaction ? 1 : 0;
    attachmentReviewCount += attachmentResult.reviewItems.length;
    if (attachmentResult.signal?.documentId) {
      const dueDate = extractDueDate(extractedText);
      if (dueDate) {
        upcomingCount += 1;
        await upsertUpcomingPayment({
          sourceDocumentId: attachmentResult.signal.documentId,
          merchantId: attachmentResult.merchant?.id,
          description: filename,
          dueDate,
          amount: extractAmount(extractedText),
        });
      }
    }
  }

  return {
    documents: 1,
    signals: (messageResult.signal ? 1 : 0) + attachmentSignalCount,
    promotedTransactions: (messageResult.transaction ? 1 : 0) + attachmentPromotedCount,
    reviews: messageResult.reviewItems.length + attachmentReviewCount,
    upcoming: upcomingCount + (extractDueDate(`${subject} ${text}`) ? 1 : 0),
  };
}

export async function syncGoogleFinanceMailbox(options?: {
  fullRescan?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  mode?: "source_discovery" | "full";
}) {
  const setup = getGoogleFinanceSetupStatus();
  if (!setup.configured) {
    throw new Error(setup.setupMessage || "Google finance setup is incomplete");
  }

  const connection = await prisma.googleMailboxConnection.findUnique({ where: { id: "default" } });
  if (!connection) {
    throw new Error("Google mailbox is not connected");
  }

  const syncPreferences = await getFinanceSyncPreferences();
  const syncLookbackMonths = syncPreferences.syncLookbackMonths;
  const syncIntervalMinutes = syncPreferences.syncIntervalMinutes;

  if (
    connection.syncLookbackMonths !== syncLookbackMonths ||
    connection.syncIntervalMinutes !== syncIntervalMinutes
  ) {
    await prisma.googleMailboxConnection.update({
      where: { id: connection.id },
      data: {
        syncLookbackMonths,
        syncIntervalMinutes,
      },
    });
  }

  const accessToken = await refreshAccessToken();

  await prisma.googleMailboxConnection.update({
    where: { id: connection.id },
    data: { syncStatus: "syncing", lastError: null },
  });

  let messageIds: Array<{ id: string; threadId: string }> = [];
  let historyId = connection.historyId || null;
  let usedFallback = Boolean(options?.fullRescan);

  if (!options?.fullRescan && historyId) {
    try {
      const history = await gmailFetch<{
        history?: Array<{ messagesAdded?: Array<{ message?: { id: string; threadId: string } }> }>;
        historyId?: string;
      }>(accessToken, `history?startHistoryId=${historyId}&historyTypes=messageAdded&maxResults=100`);

      messageIds =
        history.history
          ?.flatMap((entry) => entry.messagesAdded || [])
          .map((entry) => entry.message)
          .filter((message): message is { id: string; threadId: string } => Boolean(message?.id)) || [];
      historyId = history.historyId || historyId;
    } catch {
      usedFallback = true;
    }
  }

  if (usedFallback || messageIds.length === 0) {
    const afterDate = options?.dateFrom
      ? new Date(`${options.dateFrom}T00:00:00`)
      : subMonths(new Date(), syncLookbackMonths);
    const beforeDate = options?.dateTo
      ? new Date(`${options.dateTo}T00:00:00`)
      : null;
    const q = [
      `after:${afterDate.toISOString().slice(0, 10)}`,
      beforeDate ? `before:${beforeDate.toISOString().slice(0, 10)}` : null,
      FINANCE_GMAIL_QUERY,
    ]
      .filter(Boolean)
      .join(" ");
    const list = await gmailFetch<GmailMessageListResponse>(
      accessToken,
      `messages?q=${encodeURIComponent(q)}&maxResults=75`
    );
    messageIds = list.messages || [];
  }

  let documents = 0;
  let signals = 0;
  let promotedTransactions = 0;
  let reviews = 0;
  let upcoming = 0;

  for (const message of messageIds) {
    const result = await processGmailMessage(accessToken, message as GmailMessage, connection.id);
    documents += result.documents;
    signals += result.signals;
    promotedTransactions += result.promotedTransactions;
    reviews += result.reviews;
    upcoming += result.upcoming;
  }

  const profile = await gmailFetch<{ historyId: string }>(accessToken, "profile");
  await prisma.googleMailboxConnection.update({
    where: { id: connection.id },
    data: {
      historyId: profile.historyId,
      syncStatus: "connected",
      lastSyncAt: new Date(),
      lastBackfillAt: usedFallback ? new Date() : connection.lastBackfillAt || null,
      lastError: null,
      syncLookbackMonths,
      syncIntervalMinutes,
    },
  });

  return {
    processedMessages: messageIds.length,
    documents,
    signals,
    promotedTransactions,
    reviews,
    upcoming,
    usedFallback,
  };
}

export async function ensureScheduledSyncMetadata() {
  const connection = await prisma.googleMailboxConnection.findUnique({ where: { id: "default" } });
  if (!connection) return null;
  const syncPreferences = await getFinanceSyncPreferences();
  const syncIntervalMinutes = syncPreferences.syncIntervalMinutes;
  const lastSyncAt = connection.lastSyncAt;
  const nextSyncAt = lastSyncAt
    ? new Date(lastSyncAt.getTime() + syncIntervalMinutes * 60_000)
    : new Date();

  return {
    syncIntervalMinutes,
    syncLookbackMonths: syncPreferences.syncLookbackMonths,
    lastSyncAt,
    nextSyncHint: nextSyncAt,
    shouldSync: !lastSyncAt || Date.now() >= nextSyncAt.getTime(),
  };
}
