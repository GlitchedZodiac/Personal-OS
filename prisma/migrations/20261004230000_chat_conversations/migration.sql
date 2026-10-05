-- Chat history (2026-10-04): the endless thread becomes a shelf of chats.
--
-- ADDITIVE ONLY — dev and prod share one database, and the code deployed
-- before this migration must keep working against it: it neither reads nor
-- writes "conversationId", so its rows simply arrive with NULL and are
-- adopted into their calendar day on the next read (lib/chat-conversations.ts).
-- No data moves here; the day-split itself is that same idempotent adoption,
-- so there is exactly one code path for "which chat does this message belong
-- to" and it is the one under test.
--
-- Nothing is deleted, and nothing here can delete: the foreign key is
-- ON DELETE SET NULL, so removing a conversation un-files its messages
-- rather than removing them.

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "titleSource" TEXT NOT NULL DEFAULT 'auto',
    "legacyDay" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_legacyDay_key" ON "chat_conversations"("legacyDay");

-- CreateIndex
CREATE INDEX "chat_conversations_lastMessageAt_idx" ON "chat_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
