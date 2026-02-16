"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
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
      }
    } catch {
      // Not authenticated
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // Small delay for the success animation
        setTimeout(() => setIsAuthenticated(true), 400);
      } else {
        setError("Invalid PIN");
        setPin("");
        // Shake animation feedback
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong");
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
        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">Loading...</p>
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
        <CardHeader className="text-center pb-4">
          <div
            className={cn(
              "mx-auto mb-3 h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-300",
              success
                ? "bg-green-500/20"
                : "bg-primary/10"
            )}
          >
            <Lock
              className={cn(
                "h-7 w-7 transition-colors",
                success ? "text-green-500" : "text-primary"
              )}
            />
          </div>
          <CardTitle className="text-xl">Personal OS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your PIN to continue
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* PIN dots display */}
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 transition-all duration-200",
                    pin.length > i
                      ? error
                        ? "bg-destructive border-destructive"
                        : "bg-primary border-primary scale-110"
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
              onChange={(e) => handlePinChange(e.target.value)}
              className="sr-only"
              autoFocus
            />

            {/* Invisible clickable area to focus the input */}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Tap to enter PIN
            </button>

            {error && (
              <p className="text-xs text-destructive text-center font-medium">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium"
              disabled={isSubmitting || pin.length < 4}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Unlock"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
