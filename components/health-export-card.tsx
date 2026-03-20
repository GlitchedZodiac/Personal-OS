"use client";

import { useMemo, useState } from "react";
import { Brain, Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function getTodayFileStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function HealthExportCard() {
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);

  const prompt = useMemo(
    () =>
      [
        "Review my Personal OS health export JSON.",
        "Use the summary for the big picture, dailyRollups for patterns over time, and rawData when you need specifics.",
        "Do not treat missing logs as proof that I did nothing; separate likely missing data from real behavior changes.",
        "Tell me the biggest positive patterns, the biggest bottlenecks, what the data suggests about nutrition/training/recovery/body composition, and the 3 highest-leverage next actions.",
      ].join("\n"),
    []
  );

  async function handleExport() {
    try {
      setExporting(true);
      const timeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
      const response = await fetch(
        `/api/health/export?range=all&timeZone=${encodeURIComponent(timeZone)}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      downloadJson(
        payload,
        `personal-os-health-export-${getTodayFileStamp()}.json`
      );
      toast.success("Health export downloaded");
    } catch (error) {
      console.error("Health export failed:", error);
      toast.error("Failed to export health JSON");
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyPrompt() {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(prompt);
      toast.success("AI prompt copied");
    } catch (error) {
      console.error("Prompt copy failed:", error);
      toast.error("Failed to copy AI prompt");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/8 to-blue-500/8">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2">
            <Brain className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">AI Health Export</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Download one AI-friendly JSON with food, workouts, calories,
              measurements, weigh-ins, hydration, progress photos, trends, and
              rollups.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={handleExport}
                disabled={exporting}
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export AI JSON
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyPrompt}
                disabled={copying}
              >
                {copying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy AI Prompt
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
