import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildFinanceInboxFingerprint,
  getFinanceInboxState,
  saveFinanceInboxState,
  type FinanceInboxItem,
} from "@/lib/finance-inbox";
import { parseTransactionsFromEmail } from "@/lib/finance-email-parser";

const DEFAULT_QUERY =
  'newer_than:14d (bancolombia OR compra OR pago OR transaccion OR debito OR credito)';

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

type GmailMessageResponse = {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailPayloadPart[];
  };
};

type GmailPayloadPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
};

function getEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function getGmailConfig() {
  const clientId = getEnv("GMAIL_CLIENT_ID");
  const clientSecret = getEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = getEnv("GMAIL_REFRESH_TOKEN");
  const userEmail = getEnv("GMAIL_USER_EMAIL");
  if (!clientId || !clientSecret || !refreshToken || !userEmail) return null;
  return { clientId, clientSecret, refreshToken, userEmail };
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function readHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  key: string
) {
  if (!headers) return null;
  const match = headers.find(
    (header) => header.name.toLowerCase() === key.toLowerCase()
  );
  return match?.value || null;
}

function collectTextFromParts(parts: GmailPayloadPart[] | undefined): string {
  if (!parts || parts.length === 0) return "";
  let output = "";
  for (const part of parts) {
    if (part.mimeType?.startsWith("text/plain") && part.body?.data) {
      try {
        output += `\n${decodeBase64Url(part.body.data)}`;
      } catch {
        // Ignore malformed body chunks.
      }
    }
    if (part.parts?.length) {
      output += collectTextFromParts(part.parts);
    }
  }
  return output;
}

async function getGmailAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to refresh Gmail token: ${body.slice(0, 400)}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Gmail token refresh returned no access token");
  }
  return json.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const gmailConfig = getGmailConfig();
    if (!gmailConfig) {
      return NextResponse.json(
        {
          error:
            "Gmail is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER_EMAIL.",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const query =
      typeof body.query === "string" && body.query.trim().length > 0
        ? body.query.trim()
        : DEFAULT_QUERY;
    const maxMessagesRaw =
      typeof body.maxMessages === "number" ? body.maxMessages : Number.NaN;
    const maxMessages = Number.isFinite(maxMessagesRaw)
      ? Math.max(1, Math.min(25, Math.floor(maxMessagesRaw)))
      : 10;
    const accountId =
      typeof body.accountId === "string" && body.accountId.trim().length > 0
        ? body.accountId.trim()
        : null;

    const accessToken = await getGmailAccessToken(gmailConfig);
    const listParams = new URLSearchParams({
      q: query,
      maxResults: String(maxMessages),
    });

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
        gmailConfig.userEmail
      )}/messages?${listParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listRes.ok) {
      const bodyText = await listRes.text();
      return NextResponse.json(
        { error: `Failed to list Gmail messages: ${bodyText.slice(0, 400)}` },
        { status: 502 }
      );
    }

    const listJson = (await listRes.json()) as GmailMessageListResponse;
    const messages = listJson.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({
        fetchedMessages: 0,
        parsedCandidates: 0,
        queued: 0,
        skippedDuplicates: 0,
      });
    }

    const detailResponses = await Promise.all(
      messages.map((message) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
            gmailConfig.userEmail
          )}/messages/${message.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )
      )
    );

    const detailPayloads: GmailMessageResponse[] = [];
    for (const response of detailResponses) {
      if (!response.ok) continue;
      detailPayloads.push((await response.json()) as GmailMessageResponse);
    }

    const { data, state } = await getFinanceInboxState();
    const existingFingerprints = new Set(state.items.map((item) => item.fingerprint));
    const existingMessageIds = new Set(
      state.items
        .map((item) => item.sourceMessageId)
        .filter((value): value is string => Boolean(value))
    );

    const createdItems: FinanceInboxItem[] = [];
    let parsedCandidates = 0;

    for (const message of detailPayloads) {
      if (!message.id || existingMessageIds.has(message.id)) continue;

      const sender = readHeader(message.payload?.headers, "From");
      const subject = readHeader(message.payload?.headers, "Subject");
      const textBody =
        `${message.snippet || ""}\n${collectTextFromParts(message.payload?.parts)}`.trim();
      if (!textBody) continue;

      const parsedTransactions = await parseTransactionsFromEmail({
        sender,
        subject,
        bodyText: textBody,
      });
      parsedCandidates += parsedTransactions.length;

      for (const transaction of parsedTransactions) {
        const fingerprint = buildFinanceInboxFingerprint({
          source: "gmail",
          sourceMessageId: message.id,
          sender,
          subject,
          transactedAt: transaction.transactedAt,
          amount: transaction.amount,
          description: transaction.description,
        });
        if (existingFingerprints.has(fingerprint)) continue;
        existingFingerprints.add(fingerprint);

        createdItems.push({
          id: randomUUID(),
          status: "pending",
          source: "gmail",
          sourceMessageId: message.id,
          sender,
          subject,
          receivedAt:
            typeof message.internalDate === "string" && message.internalDate.length > 0
              ? new Date(Number.parseInt(message.internalDate, 10)).toISOString()
              : new Date().toISOString(),
          accountId,
          rawSnippet: textBody.slice(0, 5000),
          fingerprint,
          parsed: transaction,
          createdAt: new Date().toISOString(),
          reviewedAt: null,
          reviewNotes: null,
          linkedTransactionId: null,
        });
      }
    }

    const nextState = {
      ...state,
      items: [...createdItems, ...state.items],
      meta: {
        ...state.meta,
        lastFetchedAt: new Date().toISOString(),
        lastFetchCount: createdItems.length,
        lastFetchQuery: query,
      },
    };

    await saveFinanceInboxState(data, nextState);

    return NextResponse.json({
      fetchedMessages: detailPayloads.length,
      parsedCandidates,
      queued: createdItems.length,
      skippedDuplicates: parsedCandidates - createdItems.length,
      query,
    });
  } catch (error) {
    console.error("Finance inbox Gmail fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch and parse Gmail messages" },
      { status: 500 }
    );
  }
}

