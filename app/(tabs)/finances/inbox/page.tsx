"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Bot,
  Check,
  Inbox,
  Loader2,
  MailSearch,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Account = {
  id: string;
  name: string;
  accountType: string;
};

type InboxItem = {
  id: string;
  status: "pending" | "approved" | "rejected";
  source: "gmail" | "manual";
  sender?: string | null;
  subject?: string | null;
  accountId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  parsed: {
    transactedAt: string;
    amount: number;
    currency: string;
    description: string;
    category: string;
    subcategory?: string | null;
    type: "income" | "expense" | "transfer";
  };
};

type InboxResponse = {
  items: InboxItem[];
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  gmail: {
    configured: boolean;
    user?: string | null;
  };
  meta: {
    lastFetchedAt?: string | null;
    lastFetchCount?: number | null;
    lastFetchQuery?: string | null;
  };
};

type ReviewDraft = {
  accountId: string;
  transactedAt: string;
  amount: string;
  description: string;
  category: string;
  subcategory: string;
  type: "income" | "expense" | "transfer";
};

const CATEGORIES = [
  "food",
  "transport",
  "housing",
  "entertainment",
  "health",
  "education",
  "shopping",
  "personal",
  "insurance",
  "debt_payment",
  "savings",
  "income",
  "transfer",
  "other",
] as const;

const DEFAULT_GMAIL_QUERY =
  "newer_than:14d (bancolombia OR compra OR pago OR transaccion OR debito OR credito)";

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function isoToDatetimeLocal(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    const fallback = new Date();
    return fallback.toISOString().slice(0, 16);
  }
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string, fallbackIso: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

function buildDraft(item: InboxItem, defaultAccountId: string): ReviewDraft {
  return {
    accountId: item.accountId || defaultAccountId,
    transactedAt: isoToDatetimeLocal(item.parsed.transactedAt),
    amount: String(item.parsed.amount),
    description: item.parsed.description,
    category: item.parsed.category,
    subcategory: item.parsed.subcategory || "",
    type: item.parsed.type,
  };
}

export default function FinanceInboxPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [inboxData, setInboxData] = useState<InboxResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [manualRawText, setManualRawText] = useState("");
  const [manualSender, setManualSender] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [gmailQuery, setGmailQuery] = useState(DEFAULT_GMAIL_QUERY);
  const [maxMessages, setMaxMessages] = useState("10");
  const [showReviewed, setShowReviewed] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, inboxRes] = await Promise.all([
        fetch("/api/finance/accounts"),
        fetch("/api/finance/inbox"),
      ]);

      const accountsJson = await accountsRes.json();
      const accountList = (accountsJson.accounts || []) as Account[];
      setAccounts(accountList);

      const inboxJson = (await inboxRes.json()) as InboxResponse;
      setInboxData(inboxJson);

      const defaultAccountId =
        selectedAccountId || accountList[0]?.id || "";
      if (!selectedAccountId && defaultAccountId) {
        setSelectedAccountId(defaultAccountId);
      }

      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of inboxJson.items) {
          if (!next[item.id]) {
            next[item.id] = buildDraft(item, defaultAccountId);
          }
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load inbox data");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pendingItems = useMemo(
    () => (inboxData?.items || []).filter((item) => item.status === "pending"),
    [inboxData]
  );
  const reviewedItems = useMemo(
    () => (inboxData?.items || []).filter((item) => item.status !== "pending"),
    [inboxData]
  );

  const updateDraft = useCallback(
    (id: string, changes: Partial<ReviewDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {
            accountId: selectedAccountId,
            transactedAt: isoToDatetimeLocal(new Date().toISOString()),
            amount: "",
            description: "",
            category: "other",
            subcategory: "",
            type: "expense",
          }),
          ...changes,
        },
      }));
    },
    [selectedAccountId]
  );

  const handleManualParse = useCallback(async () => {
    if (!manualRawText.trim()) {
      toast.error("Paste an email alert or statement snippet first");
      return;
    }
    setManualLoading(true);
    try {
      const res = await fetch("/api/finance/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: manualRawText,
          sender: manualSender || undefined,
          subject: manualSubject || undefined,
          accountId: selectedAccountId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Manual parse failed");
      }
      toast.success(`Queued ${json.added} item(s) for review`);
      setManualRawText("");
      setManualSender("");
      setManualSubject("");
      await fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Manual parse failed");
    } finally {
      setManualLoading(false);
    }
  }, [fetchData, manualRawText, manualSender, manualSubject, selectedAccountId]);

  const handleGmailFetch = useCallback(async () => {
    setGmailLoading(true);
    try {
      const parsedMax = Number.parseInt(maxMessages, 10);
      const res = await fetch("/api/finance/inbox/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: gmailQuery,
          maxMessages: Number.isFinite(parsedMax) ? parsedMax : 10,
          accountId: selectedAccountId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gmail fetch failed");
      }
      toast.success(
        `Fetched ${json.fetchedMessages} emails, queued ${json.queued} item(s)`
      );
      await fetchData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Gmail fetch failed");
    } finally {
      setGmailLoading(false);
    }
  }, [fetchData, gmailQuery, maxMessages, selectedAccountId]);

  const handleReviewAction = useCallback(
    async (id: string, action: "approve" | "reject" | "reopen") => {
      const draft = drafts[id];
      const item = inboxData?.items.find((candidate) => candidate.id === id);
      if (!item) return;

      setReviewingId(id);
      try {
        const edits = draft
          ? {
              transactedAt: datetimeLocalToIso(
                draft.transactedAt,
                item.parsed.transactedAt
              ),
              amount: Number.parseFloat(draft.amount || "0"),
              description: draft.description,
              category: draft.category,
              subcategory: draft.subcategory || null,
              type: draft.type,
            }
          : undefined;

        const res = await fetch("/api/finance/inbox/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action,
            accountId: draft?.accountId || item.accountId || selectedAccountId || undefined,
            edits,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Review action failed");
        }
        toast.success(
          action === "approve"
            ? "Transaction approved and saved"
            : action === "reject"
            ? "Queue item rejected"
            : "Item reopened"
        );
        await fetchData();
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : "Review action failed"
        );
      } finally {
        setReviewingId(null);
      }
    },
    [drafts, fetchData, inboxData?.items, selectedAccountId]
  );

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/finances">
          <button className="p-2 -ml-2 rounded-xl hover:bg-secondary/50 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-emerald-400" />
            Finance Inbox
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Parse Gmail alerts and review before saving transactions
          </p>
        </div>
      </div>

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Queue Status</span>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : inboxData?.gmail.configured ? (
              <span className="text-[10px] text-emerald-400">
                Gmail ready ({inboxData.gmail.user})
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Gmail env not set
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-secondary/40 py-2">
              <p className="text-[10px] text-muted-foreground">Pending</p>
              <p className="text-sm font-semibold">{inboxData?.counts.pending || 0}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 py-2">
              <p className="text-[10px] text-muted-foreground">Approved</p>
              <p className="text-sm font-semibold">{inboxData?.counts.approved || 0}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 py-2">
              <p className="text-[10px] text-muted-foreground">Rejected</p>
              <p className="text-sm font-semibold">{inboxData?.counts.rejected || 0}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 py-2">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-sm font-semibold">{inboxData?.counts.total || 0}</p>
            </div>
          </div>
          {inboxData?.meta?.lastFetchedAt && (
            <p className="text-[10px] text-muted-foreground">
              Last fetch: {format(new Date(inboxData.meta.lastFetchedAt), "MMM d, p")} ·{" "}
              {inboxData.meta.lastFetchCount || 0} queued
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MailSearch className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-medium">Fetch from Gmail</span>
          </div>
          <Input
            value={gmailQuery}
            onChange={(event) => setGmailQuery(event.target.value)}
            className="text-xs"
            placeholder="Gmail query"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={maxMessages}
              onChange={(event) => setMaxMessages(event.target.value)}
              className="text-xs"
              placeholder="Max messages (1-25)"
              type="number"
              min={1}
              max={25}
            />
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-xs"
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleGmailFetch}
            disabled={gmailLoading}
            className="w-full text-xs"
            variant="outline"
          >
            {gmailLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching...
              </>
            ) : (
              <>Fetch Gmail Alerts</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-medium">Manual Email Parse</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={manualSender}
              onChange={(event) => setManualSender(event.target.value)}
              className="text-xs"
              placeholder="Sender (optional)"
            />
            <Input
              value={manualSubject}
              onChange={(event) => setManualSubject(event.target.value)}
              className="text-xs"
              placeholder="Subject (optional)"
            />
          </div>
          <Textarea
            value={manualRawText}
            onChange={(event) => setManualRawText(event.target.value)}
            className="text-xs min-h-[120px]"
            placeholder="Paste a bank email alert or statement text..."
          />
          <Button
            onClick={handleManualParse}
            disabled={manualLoading || !manualRawText.trim()}
            className="w-full text-xs"
          >
            {manualLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing...
              </>
            ) : (
              <>Parse to Review Queue</>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {showReviewed ? "Reviewed Items" : "Pending Review"}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setShowReviewed((prev) => !prev)}
        >
          {showReviewed ? "Show Pending" : "Show Reviewed"}
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading inbox...
          </CardContent>
        </Card>
      ) : (showReviewed ? reviewedItems : pendingItems).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            {showReviewed
              ? "No reviewed items yet."
              : "No pending items. Fetch Gmail or parse a manual email first."}
          </CardContent>
        </Card>
      ) : (
        (showReviewed ? reviewedItems : pendingItems).map((item) => {
          const draft = drafts[item.id] || buildDraft(item, selectedAccountId);
          const busy = reviewingId === item.id;
          return (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">
                      {item.subject || item.parsed.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.sender || "Unknown sender"} · {item.source.toUpperCase()} ·{" "}
                      {format(new Date(item.createdAt), "MMM d, p")}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-1 rounded-full ${
                      item.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : item.status === "rejected"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={draft.description}
                    onChange={(event) =>
                      updateDraft(item.id, { description: event.target.value })
                    }
                    className="text-xs"
                    placeholder="Description"
                  />
                  <Input
                    value={draft.amount}
                    onChange={(event) =>
                      updateDraft(item.id, { amount: event.target.value })
                    }
                    className="text-xs"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Amount"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        type: event.target.value as "income" | "expense" | "transfer",
                      })
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-xs"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft(item.id, { category: event.target.value })
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-xs"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={draft.transactedAt}
                    onChange={(event) =>
                      updateDraft(item.id, { transactedAt: event.target.value })
                    }
                    className="text-xs"
                    type="datetime-local"
                  />
                  <select
                    value={draft.accountId}
                    onChange={(event) =>
                      updateDraft(item.id, { accountId: event.target.value })
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-xs"
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-[10px] text-muted-foreground">
                  Preview:{" "}
                  {draft.type === "expense" ? "-" : "+"}
                  {formatCop(Number.parseFloat(draft.amount || "0") || 0)}
                </div>

                <div className="flex gap-2">
                  {item.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleReviewAction(item.id, "approve")}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => handleReviewAction(item.id, "reject")}
                        disabled={busy}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => handleReviewAction(item.id, "reopen")}
                      disabled={busy}
                    >
                      Reopen for edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

