// Chat history, the database half. Rules and naming live in
// lib/chat-history.ts (pure, tested); this file only reads and writes.

import { Prisma } from "@prisma/client";
import {
  LEGACY_SPLIT_TIME_ZONE,
  type ConversationSummary,
  deriveTitle,
  itemNamesFromMeta,
  likePattern,
  planLegacySplit,
  sanitizeTitle,
} from "@/lib/chat-history";
import { CHAT_MODEL } from "@/lib/openai";
import { generateChatText } from "@/lib/openai-text";
import { prisma } from "@/lib/prisma";
import { getUtcDateRangeForTimeZone, normalizeTimeZone } from "@/lib/timezone";

export type { ConversationSummary };

type ConversationRow = {
  id: string;
  title: string;
  titleSource: string;
  createdAt: Date;
  lastMessageAt: Date;
  _count?: { messages: number };
};

function toSummary(row: ConversationRow, snippet?: string | null): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    titleSource: row.titleSource,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    messageCount: row._count?.messages ?? 0,
    ...(snippet !== undefined ? { snippet } : {}),
  };
}

// ————— The split: every unfiled message joins its calendar day —————
//
// This IS the migration. It is not a one-off script because it cannot be
// one: dev and prod share a database, so between the schema landing and the
// new code deploying, the old deploy keeps writing rows with no
// conversation. Running the same idempotent adoption on every history read
// means there is nothing to remember to run, no window in which a message
// can fall between chats, and a single code path under test.
//
// It only ever fills in a NULL. It never moves a message between chats,
// never deletes one, and never touches a title he has set.

export async function adoptUnfiledMessages(): Promise<{ adopted: number; days: number }> {
  const any = await prisma.chatMessage.findFirst({
    where: { conversationId: null },
    select: { id: true },
  });
  if (!any) return { adopted: 0, days: 0 };

  const unfiled = await prisma.chatMessage.findMany({
    where: { conversationId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true, meta: true },
  });
  const plans = planLegacySplit(unfiled, LEGACY_SPLIT_TIME_ZONE);

  let adopted = 0;
  for (const plan of plans) {
    let conversation = await prisma.chatConversation.findUnique({
      where: { legacyDay: plan.day },
    });
    if (!conversation) {
      try {
        conversation = await prisma.chatConversation.create({
          data: {
            legacyDay: plan.day,
            title: plan.title,
            titleSource: "auto",
            createdAt: plan.firstAt,
            lastMessageAt: plan.lastAt,
          },
        });
      } catch {
        // two requests raced on the same day; the unique index picked one
        conversation = await prisma.chatConversation.findUnique({
          where: { legacyDay: plan.day },
        });
      }
    }
    if (!conversation) continue;

    const filed = await prisma.chatMessage.updateMany({
      where: { id: { in: plan.messageIds }, conversationId: null },
      data: { conversationId: conversation.id },
    });
    adopted += filed.count;

    if (plan.lastAt > conversation.lastMessageAt) {
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: plan.lastAt },
      });
    }
  }
  return { adopted, days: plans.length };
}

// ————— Reading —————

export async function latestConversation(): Promise<ConversationSummary | null> {
  const row = await prisma.chatConversation.findFirst({
    orderBy: { lastMessageAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return row ? toSummary(row) : null;
}

export async function getConversation(id: string): Promise<ConversationSummary | null> {
  const row = await prisma.chatConversation.findUnique({
    where: { id },
    include: { _count: { select: { messages: true } } },
  });
  return row ? toSummary(row) : null;
}

/** The newest `limit` messages of one chat, oldest first. */
export async function getConversationMessages(conversationId: string, limit = 400) {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export interface ListOptions {
  /** free text: titles, anything said, and the food named on a card */
  q?: string | null;
  /** YYYY-MM-DD, in `timeZone` */
  from?: string | null;
  to?: string | null;
  timeZone?: string | null;
  limit?: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function listConversations(opts: ListOptions = {}): Promise<ConversationSummary[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 300));
  const timeZone = normalizeTimeZone(opts.timeZone);
  const q = (opts.q ?? "").trim();

  // A chat is "in" a date range when it was active at any point inside it.
  const where: Prisma.ChatConversationWhereInput = {};
  const from = opts.from && DAY_RE.test(opts.from) ? opts.from : null;
  const to = opts.to && DAY_RE.test(opts.to) ? opts.to : null;
  if (from || to) {
    const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
      from ?? to ?? "",
      to ?? from ?? "",
      timeZone
    );
    where.lastMessageAt = { gte: rangeStart };
    where.createdAt = { lte: rangeEnd };
  }

  const snippets = new Map<string, string | null>();
  if (q) {
    const pattern = likePattern(q);
    // The newest matching line per chat. Food names live inside the card's
    // JSON, not in `content` — a photo logged with no words would otherwise
    // be unfindable by what was on the plate. The CASE keeps
    // jsonb_array_elements away from anything that is not an array.
    const hits = await prisma.$queryRaw<Array<{ id: string; snippet: string | null }>>(Prisma.sql`
      SELECT DISTINCT ON (m."conversationId")
        m."conversationId" AS id,
        CASE
          WHEN m.content ILIKE ${pattern} ESCAPE '\\' THEN m.content
          ELSE (
            SELECT it->>'foodDescription'
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(m.meta->'data'->'items') = 'array'
                   THEN m.meta->'data'->'items' ELSE '[]'::jsonb END
            ) AS it
            WHERE it->>'foodDescription' ILIKE ${pattern} ESCAPE '\\'
            LIMIT 1
          )
        END AS snippet
      FROM chat_messages m
      WHERE m."conversationId" IS NOT NULL
        AND (
          m.content ILIKE ${pattern} ESCAPE '\\'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(m.meta->'data'->'items') = 'array'
                   THEN m.meta->'data'->'items' ELSE '[]'::jsonb END
            ) AS it
            WHERE it->>'foodDescription' ILIKE ${pattern} ESCAPE '\\'
          )
        )
      ORDER BY m."conversationId", m."createdAt" DESC
    `);
    for (const hit of hits) snippets.set(hit.id, hit.snippet);

    where.OR = [
      { id: { in: [...snippets.keys()] } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.chatConversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    include: { _count: { select: { messages: true } } },
  });
  return rows.map((row) => toSummary(row, q ? (snippets.get(row.id) ?? null) : undefined));
}

// ————— Writing —————

/**
 * The chat a message is about to join. A known id continues that chat;
 * anything else (no id — "New chat", or the quiet-gap rule on the client —
 * or an id that no longer exists) starts one, already carrying a name from
 * its first words so the shelf never shows a blank row.
 */
export async function createConversation(seed: {
  firstUserText: string;
  at: Date;
  timeZone: string;
}): Promise<ConversationSummary> {
  const row = await prisma.chatConversation.create({
    data: {
      title: deriveTitle({
        firstUserText: seed.firstUserText,
        at: seed.at,
        timeZone: seed.timeZone,
      }),
      titleSource: "auto",
      createdAt: seed.at,
      lastMessageAt: seed.at,
    },
  });
  return toSummary(row);
}

export async function touchConversation(id: string, at: Date = new Date()) {
  await prisma.chatConversation
    .update({ where: { id }, data: { lastMessageAt: at } })
    .catch(() => {});
}

/** His own name for a chat. An empty name hands naming back to the app. */
export async function renameConversation(
  id: string,
  rawTitle: string
): Promise<ConversationSummary | null> {
  const existing = await prisma.chatConversation.findUnique({ where: { id } });
  if (!existing) return null;

  const title = sanitizeTitle(rawTitle);
  if (title) {
    const row = await prisma.chatConversation.update({
      where: { id },
      data: { title, titleSource: "user" },
      include: { _count: { select: { messages: true } } },
    });
    return toSummary(row);
  }

  const first = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 12,
    select: { role: true, content: true, meta: true },
  });
  const firstCard = first.find((m) => itemNamesFromMeta(m.meta).length > 0);
  const row = await prisma.chatConversation.update({
    where: { id },
    data: {
      title: deriveTitle({
        firstUserText: first.find((m) => m.role === "user")?.content,
        itemNames: firstCard ? itemNamesFromMeta(firstCard.meta) : [],
        at: existing.createdAt,
        timeZone: LEGACY_SPLIT_TIME_ZONE,
      }),
      titleSource: "auto",
    },
    include: { _count: { select: { messages: true } } },
  });
  return toSummary(row);
}

// Wording settled against six real first exchanges (2026-10-04). The
// LANGUAGE line is there because an earlier draft ("in the language the user
// wrote in") named an English chat "Prueba de humo".
const TITLE_SYSTEM = `You name chats in one person's private health log (food, training, body measurements, and questions about his own data).
Reply with ONLY the title: 2 to 6 words, plain text, no quotes, no emoji, no trailing punctuation.
LANGUAGE: use the language of the "User:" line. English in, English out. Spanish in, Spanish out. Never translate. If the User line has no real words (a photo), use English.
CASE: sentence case — capitalise the first word and proper nouns only.
Name the substance — the meal, the workout, the question. Never "Chat about…", "Log request", "Food log" or anything that would fit every chat.`;

/**
 * Names a chat from its first exchange. One small call, once per chat, and
 * only while the name is still the automatic first-words one — a title he
 * typed is never overwritten (the WHERE guards the race, not just the read).
 */
export async function writeAiTitle(conversationId: string): Promise<string | null> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { titleSource: true },
  });
  if (!conversation || conversation.titleSource !== "auto") return null;

  const first = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 6,
    select: { role: true, content: true, meta: true },
  });
  if (!first.some((m) => m.role === "user")) return null;

  const transcript = first
    .map((m) => {
      if (m.role === "proposal") {
        const kind = (m.meta as { kind?: string } | null)?.kind ?? "log";
        const items = itemNamesFromMeta(m.meta);
        const what = items.length > 0 ? items.join("; ") : m.content;
        return `Proposed ${kind}: ${what}`.slice(0, 400);
      }
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`.slice(0, 400);
    })
    .join("\n");

  try {
    const { text } = await generateChatText({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: TITLE_SYSTEM },
        { role: "user", content: transcript },
      ],
      maxCompletionTokens: 40,
      retryMaxCompletionTokens: 160,
      surface: "chat-title",
    });
    const title = sanitizeTitle(text);
    if (!title) return null;
    const updated = await prisma.chatConversation.updateMany({
      where: { id: conversationId, titleSource: "auto" },
      data: { title, titleSource: "ai" },
    });
    return updated.count > 0 ? title : null;
  } catch (error) {
    console.error("Chat title generation failed:", error);
    return null; // the first-words title stands
  }
}
