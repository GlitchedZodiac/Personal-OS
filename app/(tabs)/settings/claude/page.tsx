"use client";

// Claude connector (2026-08-29): mint the MCP bearer token and hand over the
// two strings claude.ai needs. The token renders ONCE — after this screen
// it exists only as a hash. Revocation reuses the device-session machinery.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

interface ConnectorSession {
  id: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
}

export default function ClaudeConnectorPage() {
  const [sessions, setSessions] = useState<ConnectorSession[]>([]);
  const [minted, setMinted] = useState<{ accessToken: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/health/mcp-token");
      const body = await res.json();
      if (res.ok) setSessions(body.sessions ?? []);
    } catch {
      // list is cosmetic; minting still works
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mint = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/health/mcp-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Claude connector" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Mint failed");
      setMinted({ accessToken: body.accessToken, url: body.url });
      refresh();
    } catch (e) {
      toast.error(String((e as Error).message ?? "Couldn't mint a token"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this connector? Claude loses access immediately.")) return;
    const res = await fetch("/api/health/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      toast.success("Revoked");
      refresh();
    } else {
      toast.error("Couldn't revoke");
    }
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Copy failed — select it manually"));
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-12">
      <Link href="/settings" className="text-[12.5px] font-semibold text-muted-foreground">
        ‹ Settings
      </Link>
      <h1
        className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Claude connector
      </h1>
      <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted-foreground">
        Connect your Claude account to Pitaya as a custom connector. Claude can
        then read your training, food, body and spirit data and log things for
        you — recipes, workouts, measurements, plans — from any Claude surface.
        Every action uses your own Claude subscription; Pitaya spends nothing.
      </p>

      {/* The easy path: claude.ai detects the OAuth flow from the URL alone
          and walks through /oauth/authorize — one Approve tap, no pasting. */}
      <div className="mt-5 rounded-[16px] bg-card p-4">
        <p className="text-[10.5px] font-bold tracking-[0.14em] text-[#3E7A54]">
          THE EASY WAY — SIGN IN, NOTHING TO PASTE
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] leading-[1.6] text-muted-foreground">
          <li>claude.ai → Settings → Connectors → Add custom connector</li>
          <li>
            Paste only the URL:{" "}
            <button
              onClick={() =>
                copy(`${window.location.origin}/api/mcp`, "Connector URL")
              }
              className="font-mono text-[11.5px] font-semibold text-foreground underline decoration-dotted"
            >
              {typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp"}
            </button>
          </li>
          <li>Leave Authentication on “Always required (Detected)” and the OAuth client on Anthropic’s hosted metadata</li>
          <li>Claude opens Pitaya’s approve screen — unlock with your PIN, tap Approve, done</li>
        </ol>
      </div>

      <p className="mt-6 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
        FALLBACK — MANUAL TOKEN (NO SIGN-IN)
      </p>
      {!minted ? (
        <button
          onClick={mint}
          disabled={busy}
          className="mt-2 w-full rounded-[12px] bg-[#232227] py-3 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {busy ? "Minting…" : "Mint a connector token"}
        </button>
      ) : (
        <div className="mt-5 rounded-[16px] border-[1.5px] border-[#E9CFDC] bg-card p-4">
          <p className="text-[10.5px] font-bold tracking-[0.14em] text-[#8C2F51]">
            SHOWN ONCE — COPY BOTH NOW
          </p>
          <div className="mt-3">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground">
              SERVER URL
            </p>
            <button
              onClick={() => copy(minted.url, "URL")}
              className="mt-1 w-full break-all rounded-[10px] bg-background px-3 py-2 text-left font-mono text-[12px] text-foreground"
            >
              {minted.url}
            </button>
          </div>
          <div className="mt-3">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground">
              BEARER TOKEN
            </p>
            <button
              onClick={() => copy(minted.accessToken, "Token")}
              className="mt-1 w-full break-all rounded-[10px] bg-background px-3 py-2 text-left font-mono text-[12px] text-foreground"
            >
              {minted.accessToken}
            </button>
          </div>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[12px] leading-[1.6] text-muted-foreground">
            <li>claude.ai → Settings → Connectors → Add custom connector</li>
            <li>Paste the server URL</li>
            <li>
              Set Authentication to <b>None</b> (“servers that use an API key”)
            </li>
            <li>
              Under Additional request headers, add header{" "}
              <span className="font-mono">api-token</span> with the token as
              its value
            </li>
            <li>Ask Claude: “what did I train this week?”</li>
          </ol>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          ACTIVE CONNECTORS
        </p>
        {sessions.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">None yet.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-[14px] bg-card">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between border-b border-muted px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-[12.5px] font-semibold text-foreground">{s.deviceLabel}</p>
                  <p className="mt-px text-[10.5px] text-muted-foreground">
                    minted {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                    {s.lastSeenAt
                      ? `last used ${new Date(s.lastSeenAt).toLocaleDateString()}`
                      : "never used"}
                  </p>
                </div>
                <button
                  onClick={() => revoke(s.id)}
                  className="text-[12px] font-semibold text-[#B4536F]"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-5 text-[10.5px] leading-[1.6] text-muted-foreground">
        The token is stored hashed and works for a year; revoking kills it
        instantly. Writes made through Claude are stamped as connector entries.
        If Claude ever needs something Pitaya can&apos;t do, it files the gap on
        your todo list — that&apos;s the point.
      </p>
    </div>
  );
}
