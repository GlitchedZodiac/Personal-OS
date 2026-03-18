"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { demoText } from "@/lib/demo-client";
import { cn } from "@/lib/utils";

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pinConfigured, setPinConfigured] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        setIsAuthenticated(true);
      } else if (res.status === 503) {
        setPinConfigured(false);
        setError(demoText("APP_PIN is not configured yet", "APP_PIN todavia no esta configurado"));
      }
    } catch {
      // Not authenticated
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
      setError(demoText("Something went wrong", "Algo salio mal"));
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
    return <>{children}</>;
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
              "mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
              success ? "bg-green-500/20" : "bg-primary/10"
            )}
          >
            <Lock
              className={cn("h-7 w-7 transition-colors", success ? "text-green-500" : "text-primary")}
            />
          </div>
          <CardTitle className="text-xl">Personal OS</CardTitle>
          <p className="text-sm text-muted-foreground">
            {demoText("Enter your PIN to continue", "Ingresa tu PIN para continuar")}
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
