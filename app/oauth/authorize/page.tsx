"use client";

// The OAuth sign-in screen (2026-08-29): claude.ai sends the browser here
// when connecting the Pitaya connector. If the PIN cookie is present it's
// one Approve tap; if not, the PIN field appears inline first. Deliberately
// bare — no tabs chrome, no dock — this page exists for ten seconds.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function AuthorizeInner() {
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const clientHost = (() => {
    try {
      return new URL(redirectUri).hostname;
    } catch {
      return "the client";
    }
  })();

  const badRequest =
    !clientId ||
    !redirectUri ||
    (params.get("response_type") ?? "code") !== "code" ||
    !params.get("code_challenge");

  useEffect(() => {
    // Cheap auth probe: any cookie-gated endpoint answers the question.
    fetch("/api/health/summary")
      .then((r) => setNeedsPin(r.status === 401))
      .catch(() => setNeedsPin(true));
  }, []);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      if (needsPin) {
        const login = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
        if (!login.ok) {
          const body = await login.json().catch(() => ({}));
          throw new Error(String(body.error ?? "Wrong PIN"));
        }
        setNeedsPin(false);
      }
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: params.get("code_challenge"),
          code_challenge_method: params.get("code_challenge_method") ?? "S256",
          state: params.get("state"),
          scope: params.get("scope"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body.error ?? "Approval failed"));
      window.location.href = body.redirectTo;
    } catch (e) {
      setError(String((e as Error).message ?? "Something went wrong"));
      setBusy(false);
    }
  };

  const deny = () => {
    try {
      const target = new URL(redirectUri);
      target.searchParams.set("error", "access_denied");
      const state = params.get("state");
      if (state) target.searchParams.set("state", state);
      window.location.href = target.toString();
    } catch {
      window.history.back();
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#1B1518] px-6">
      <div className="w-full max-w-sm rounded-[20px] bg-[#251C21] p-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-3.5 w-3.5 rotate-45 bg-[#CE5C86]" />
          <span
            className="text-[17px] font-bold text-[#F0E8EC]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pitaya
          </span>
        </div>

        {badRequest ? (
          <p className="mt-5 text-[13px] leading-[1.6] text-[#BFAEB7]">
            This authorization link is incomplete — start the connection from
            claude.ai again.
          </p>
        ) : (
          <>
            <p className="mt-5 text-[15px] font-semibold leading-[1.5] text-[#F0E8EC]">
              Claude wants to connect to your Pitaya.
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#BFAEB7]">
              It will be able to read your training, food, body and journal
              data, and log things for you. Every action is stamped as a
              connector entry, and you can revoke access anytime in Settings →
              Claude connector.
            </p>
            <p className="mt-2 text-[11px] text-[#7E6F77]">
              Returning to {clientHost}
            </p>

            {needsPin && (
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pin && !busy) approve();
                }}
                placeholder="Your PIN"
                autoFocus
                className="mt-4 w-full rounded-[12px] border border-[#4A3540] bg-[#1B1518] px-4 py-3 text-center text-[16px] tracking-[0.3em] text-[#F0E8EC] placeholder:tracking-normal placeholder:text-[#7E6F77]"
              />
            )}

            {error && (
              <p className="mt-3 text-[12px] font-semibold text-[#E795B4]">{error}</p>
            )}

            <button
              onClick={approve}
              disabled={busy || needsPin === null || (needsPin === true && !pin)}
              className="mt-5 w-full rounded-[12px] bg-[#CE5C86] py-3 text-[14px] font-bold text-[#1B1518] disabled:opacity-50"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {busy ? "Connecting…" : needsPin ? "Unlock & approve" : "Approve"}
            </button>
            <button
              onClick={deny}
              disabled={busy}
              className="mt-2 w-full py-2 text-[12.5px] font-semibold text-[#7E6F77]"
            >
              Deny
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeInner />
    </Suspense>
  );
}
