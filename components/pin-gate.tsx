"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PitayaLogo } from "@/components/pitaya-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { demoText } from "@/lib/demo-client";
import { cn } from "@/lib/utils";

interface PinGateProps {
  children: React.ReactNode;
}

const OFFLINE_GRANT_KEY = "pitaya:offline-grant-at";
/** how long a device may let itself in offline after its last real, server-checked sign-in */
const OFFLINE_GRANT_MS = 30 * 24 * 60 * 60_000;

function offlineGrantValid() {
  try {
    const at = Number(localStorage.getItem(OFFLINE_GRANT_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < OFFLINE_GRANT_MS;
  } catch {
    return false;
  }
}

/** a one-line, dismissable truth: you are in, but nothing was checked with the server */
function OfflineEntryNotice() {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button
      type="button"
      onClick={() => setGone(true)}
      className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-semibold"
      style={{ background: "#F6E3EB", color: "#8C2F51" }}
    >
      Offline — opened from this device. Your work is saved here and syncs when you reconnect.
      <span style={{ opacity: 0.55 }}>tap to hide</span>
    </button>
  );
}

export function PinGate({ children }: PinGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pinConfigured, setPinConfigured] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  /** he got in without a server to check the PIN — say so rather than pretend */
  const [offlineEntry, setOfflineEntry] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 2026-08-29 (speed round): every navigation into the tabs serialized an
    // /api/auth round trip before ANY page could mount. A 10-minute
    // sessionStorage memo skips the hop; a real 401 on any API call still
    // lands the user back here, and the memo self-expires.
    try {
      const okUntil = Number(sessionStorage.getItem("pitaya:auth-ok-until"));
      if (Number.isFinite(okUntil) && okUntil > Date.now()) {
        setIsAuthenticated(true);
        setIsChecking(false);
        // A live memo chains back to a real server check minutes ago, so it renews the offline
        // grant too. Without this, a device that always hits the fast path never records one —
        // and would find itself locked out the first time it opened the app with no signal.
        try { localStorage.setItem(OFFLINE_GRANT_KEY, String(Date.now())); } catch {}
        return;
      }
    } catch {
      // storage unavailable — fall through to the network check
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberGrant = () => {
    try {
      sessionStorage.setItem("pitaya:auth-ok-until", String(Date.now() + 10 * 60_000));
      // sessionStorage dies with the tab, and a PWA relaunch is a new tab. The offline grant
      // has to outlive that, so it lives in localStorage.
      localStorage.setItem(OFFLINE_GRANT_KEY, String(Date.now()));
    } catch {
      // best effort
    }
  };

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        setIsAuthenticated(true);
        rememberGrant();
      } else if (res.status === 503) {
        setPinConfigured(false);
        setError(demoText("APP_PIN is not configured yet", "APP_PIN todavia no esta configurado"));
      } else {
        // The server SAID no. That is different from being unable to ask, and it revokes the
        // offline grant — otherwise a signed-out device would keep letting itself back in.
        try { localStorage.removeItem(OFFLINE_GRANT_KEY); } catch {}
      }
    } catch {
      // We could not ask. On a plane, in a basement, on church wifi that has given up, the PIN
      // is unverifiable — there is no server to check it against — so demanding one would lock
      // him out of a notebook that is sitting on this device. If this device authenticated for
      // real recently, let him in and keep working offline.
      //
      // What this does and does not grant: it unlocks the local UI only. Every API is still
      // gated server-side by the signed cookie, so offline he can reach exactly what is already
      // cached on this device and nothing more. It expires, and a real 401 clears it.
      if (offlineGrantValid()) {
        setIsAuthenticated(true);
        setOfflineEntry(true);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        setSuccess(true);
        rememberGrant();
        setTimeout(() => setIsAuthenticated(true), 400);
      } else if (res.status === 429) {
        setError(demoText("Too many attempts. Wait a few minutes.", "Demasiados intentos. Espera unos minutos."));
        setPin("");
        inputRef.current?.focus();
      } else if (res.status === 503) {
        setPinConfigured(false);
        setError(demoText("APP_PIN is not configured yet", "APP_PIN todavia no esta configurado"));
        setPin("");
      } else {
        setError(demoText("Invalid PIN", "PIN invalido"));
        setPin("");
        inputRef.current?.focus();
      }
    } catch {
      // The PIN is checked on the server. With no connection there is nothing to check it
      // against — say that, instead of blaming him for typing it wrong.
      setError(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? demoText("No connection — the PIN is checked on the server", "Sin conexion — el PIN se verifica en el servidor")
          : demoText("Something went wrong", "Algo salio mal"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 8);
    setPin(cleaned);
    setError("");
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">{demoText("Loading...", "Cargando...")}</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <>
        {offlineEntry && <OfflineEntryNotice />}
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card
        className={cn(
          "w-full max-w-xs transition-all duration-300",
          success && "scale-95 opacity-50",
          error && "animate-shake"
        )}
      >
        <CardHeader className="pb-4 text-center">
          <div
            className={cn(
              "mx-auto mb-4 transition-all duration-300",
              success && "scale-110"
            )}
          >
            <PitayaLogo size={76} />
          </div>
          <CardTitle
            className="text-xl font-bold tracking-[0.22em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            PITAYA
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {demoText("It's just you. Prove it.", "Solo eres tú. Demuéstralo.")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-all duration-200",
                    pin.length > index
                      ? error
                        ? "border-destructive bg-destructive"
                        : "border-primary bg-primary scale-110"
                      : "border-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(event) => handlePinChange(event.target.value)}
              className="sr-only"
              autoFocus
            />

            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="w-full py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {demoText("Tap to enter PIN", "Toca para ingresar el PIN")}
            </button>

            {error && <p className="text-center text-xs font-medium text-destructive">{error}</p>}

            <Button
              type="submit"
              className="h-11 w-full rounded-xl font-medium"
              disabled={isSubmitting || pin.length < 4 || !pinConfigured}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : demoText("Unlock", "Entrar")}
            </Button>

            {!pinConfigured && (
              <p className="text-center text-[10px] text-muted-foreground">
                Set <code>APP_PIN</code> in your environment to re-enable login.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
