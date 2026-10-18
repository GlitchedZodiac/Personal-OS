-- The Claude connector's paper trail (audit 2026-10, SEC-013). Additive only.
-- One row per MCP tool call that can add, change or remove a row: which tool,
-- when, a short redacted summary of the arguments, whether it succeeded, and
-- the id it touched when the result says so.
CREATE TABLE "mcp_audit_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tool" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL,
    "error" TEXT,
    "refId" TEXT,
    "sessionId" TEXT,
    "deviceLabel" TEXT,

    CONSTRAINT "mcp_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_audit_events_createdAt_idx" ON "mcp_audit_events"("createdAt");
