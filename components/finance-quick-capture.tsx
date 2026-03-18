"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhisperButton } from "@/components/whisper-button";
import { getSettings } from "@/lib/settings";

interface FinanceQuickCaptureProps {
  accountId?: string | null;
  onSaved?: () => void;
  compact?: boolean;
}

export function FinanceQuickCapture({
  accountId = null,
  onSaved,
  compact = false,
}: FinanceQuickCaptureProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (value?: string) => {
    const message = (value ?? text).trim();
    if (!message) return;

    setSubmitting(true);
    try {
      const settings = getSettings();
      const res = await fetch("/api/finance/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          accountId,
          aiLanguage: settings.aiLanguage,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save finance note");
      }

      toast.success(data.message || "Finance event captured");
      setText("");
      onSaved?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save finance note");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceipt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    setAnalyzingReceipt(true);
    try {
      const image = await fileToDataUrl(file);
      const settings = getSettings();
      const res = await fetch("/api/finance/receipts/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          accountId,
          aiLanguage: settings.aiLanguage,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze receipt");
      }

      toast.success(data.message || "Receipt captured");
      onSaved?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze receipt");
    } finally {
      setAnalyzingReceipt(false);
    }
  };

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">Quick Capture</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Type it, speak it, or scan a receipt.
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Spent 42,000 COP at Juan Valdez with a 4,000 tip"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <WhisperButton onTranscription={handleSubmit} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzingReceipt || submitting}
            >
              {analyzingReceipt ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
            <Button type="button" onClick={() => handleSubmit()} disabled={submitting || !text.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleReceipt}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
