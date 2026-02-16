"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  Copy,
  FileJson,
  Utensils,
  Dumbbell,
  Scale,
  Droplet,
  FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { invalidateHealthCache } from "@/lib/cache";

interface ImportResult {
  success: boolean;
  totalImported: number;
  totalErrors: number;
  details: Record<string, { imported: number; errors: number }>;
  errorMessages?: string[];
}

interface VeSyncResult {
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: number;
  errorMessages?: string[];
  dateRange?: { from: string; to: string };
}

const FOOD_LOG_EXAMPLE = `{
  "foodLogs": [
    {
      "loggedAt": "2025-12-15T08:30:00Z",
      "mealType": "breakfast",
      "foodDescription": "Scrambled eggs with toast",
      "calories": 350,
      "proteinG": 22,
      "carbsG": 30,
      "fatG": 15
    },
    {
      "loggedAt": "2025-12-15T12:30:00Z",
      "mealType": "lunch",
      "foodDescription": "Grilled chicken salad",
      "calories": 480,
      "proteinG": 42,
      "carbsG": 18,
      "fatG": 22,
      "notes": "From the cafeteria"
    }
  ]
}`;

const WORKOUT_EXAMPLE = `{
  "workouts": [
    {
      "startedAt": "2025-12-15T07:00:00Z",
      "durationMinutes": 60,
      "workoutType": "strength",
      "description": "Upper body push day",
      "caloriesBurned": 350,
      "exercises": [
        { "name": "Bench Press", "sets": 4, "reps": "8", "weight": 80 },
        { "name": "OHP", "sets": 3, "reps": "10", "weight": 40 }
      ]
    }
  ]
}`;

const MEASUREMENT_EXAMPLE = `{
  "measurements": [
    {
      "measuredAt": "2025-12-15",
      "weightKg": 82.5,
      "bodyFatPct": 18.2,
      "waistCm": 84,
      "chestCm": 102,
      "armsCm": 35
    }
  ]
}`;

const COMBINED_EXAMPLE = `{
  "foodLogs": [ ... ],
  "workouts": [ ... ],
  "measurements": [ ... ],
  "waterLogs": [
    { "loggedAt": "2025-12-15T10:00:00Z", "amountMl": 500 }
  ]
}`;

export default function ImportPage() {
  const [jsonInput, setJsonInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // VeSync state
  const [vesyncFile, setVesyncFile] = useState<File | null>(null);
  const [vesyncImporting, setVesyncImporting] = useState(false);
  const [vesyncResult, setVesyncResult] = useState<VeSyncResult | null>(null);
  const vesyncInputRef = useRef<HTMLInputElement>(null);

  const validateJson = (text: string): { valid: boolean; data?: any; error?: string } => {
    if (!text.trim()) {
      return { valid: false, error: "Paste your JSON data above" };
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) {
        return { valid: false, error: "JSON must be an object with foodLogs, workouts, measurements, or waterLogs arrays" };
      }

      const keys = ["foodLogs", "workouts", "measurements", "waterLogs"];
      const hasData = keys.some(
        (k) => Array.isArray(parsed[k]) && parsed[k].length > 0
      );

      if (!hasData) {
        return {
          valid: false,
          error: "No importable data found. Include at least one of: foodLogs, workouts, measurements, waterLogs",
        };
      }

      // Count entries
      const counts: Record<string, number> = {};
      for (const k of keys) {
        if (Array.isArray(parsed[k])) counts[k] = parsed[k].length;
      }

      return { valid: true, data: parsed };
    } catch (e: any) {
      return { valid: false, error: `Invalid JSON: ${e.message}` };
    }
  };

  const handleImport = async () => {
    const validation = validateJson(jsonInput);
    if (!validation.valid) {
      setParseError(validation.error || "Invalid JSON");
      return;
    }

    setParseError(null);
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonInput,
      });

      const data: ImportResult = await res.json();
      setResult(data);

      if (data.success && data.totalImported > 0) {
        invalidateHealthCache();
        toast.success(`Imported ${data.totalImported} records!`);
      } else if (data.totalErrors > 0) {
        toast.error(`Import had ${data.totalErrors} errors.`);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import data.");
    } finally {
      setImporting(false);
    }
  };

  const handlePasteExample = (example: string) => {
    setJsonInput(example);
    setParseError(null);
    setResult(null);
  };

  const handleCopyTemplate = (example: string) => {
    navigator.clipboard.writeText(example);
    toast.success("Template copied to clipboard!");
  };

  const handleVesyncImport = async () => {
    if (!vesyncFile) return;
    setVesyncImporting(true);
    setVesyncResult(null);

    try {
      const formData = new FormData();
      formData.append("file", vesyncFile);

      const res = await fetch("/api/health/import/vesync", {
        method: "POST",
        body: formData,
      });

      const data: VeSyncResult = await res.json();
      setVesyncResult(data);

      if (data.success && data.imported > 0) {
        invalidateHealthCache();
        toast.success(`Imported ${data.imported} measurements!`);
      } else if (data.errors > 0) {
        toast.error(`Import had ${data.errors} errors.`);
      } else if (data.imported === 0 && data.skipped > 0) {
        toast.info("All records already imported (duplicates skipped).");
      }
    } catch (error) {
      console.error("VeSync import error:", error);
      toast.error("Failed to import VeSync data.");
    } finally {
      setVesyncImporting(false);
    }
  };

  // Live validation
  const validation = jsonInput.trim() ? validateJson(jsonInput) : null;
  const entryCounts = validation?.valid
    ? (() => {
        const parsed = JSON.parse(jsonInput);
        const counts: Array<{ label: string; count: number; icon: typeof Utensils }> = [];
        if (Array.isArray(parsed.foodLogs))
          counts.push({ label: "Food logs", count: parsed.foodLogs.length, icon: Utensils });
        if (Array.isArray(parsed.workouts))
          counts.push({ label: "Workouts", count: parsed.workouts.length, icon: Dumbbell });
        if (Array.isArray(parsed.measurements))
          counts.push({ label: "Measurements", count: parsed.measurements.length, icon: Scale });
        if (Array.isArray(parsed.waterLogs))
          counts.push({ label: "Water logs", count: parsed.waterLogs.length, icon: Droplet });
        return counts;
      })()
    : [];

  return (
    <div className="px-4 pt-12 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Import Data</h1>
          <p className="text-xs text-muted-foreground">
            Paste historical food, workout, and measurement data
          </p>
        </div>
      </div>

      {/* Instructions */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-blue-400 flex items-center gap-2">
            <FileJson className="h-4 w-4" /> How it works
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Ask ChatGPT to format your data as JSON matching the templates below</li>
            <li>Paste the JSON into the text area</li>
            <li>Preview the counts, then hit Import</li>
            <li>All dates should be ISO 8601 (e.g. <code className="bg-secondary px-1 rounded">2025-12-15T08:30:00Z</code>)</li>
          </ol>
          <p className="text-[10px] text-blue-300/60">
            You can import food logs, workouts, body measurements, and water logs — all in one JSON or separately.
          </p>
        </CardContent>
      </Card>

      {/* VeSync Smart Scale Import */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-purple-400" />
            VeSync Smart Scale Import
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Upload your VeSync CSV export to import weight, body fat, BMI, muscle mass, and more
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".csv"
            ref={vesyncInputRef}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setVesyncFile(file);
                setVesyncResult(null);
              }
            }}
          />

          <div
            onClick={() => vesyncInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
              vesyncFile
                ? "border-purple-500/40 bg-purple-500/10"
                : "border-border/50 hover:border-purple-500/30 hover:bg-purple-500/5"
            )}
          >
            {vesyncFile ? (
              <div className="space-y-1">
                <FileSpreadsheet className="h-6 w-6 mx-auto text-purple-400" />
                <p className="text-sm font-medium">{vesyncFile.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(vesyncFile.size / 1024).toFixed(1)} KB — tap to change
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Tap to select your VeSync CSV file
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  VeSync App → Profile → Export Data → Select date range → Export
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleVesyncImport}
            disabled={vesyncImporting || !vesyncFile}
            className="w-full h-11 gap-2 bg-purple-600 hover:bg-purple-700"
          >
            {vesyncImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Importing...
              </>
            ) : (
              <>
                <Scale className="h-4 w-4" /> Import Scale Data
              </>
            )}
          </Button>

          {/* VeSync Results */}
          {vesyncResult && (
            <div className={cn(
              "rounded-lg p-3 space-y-2 border",
              vesyncResult.errors === 0
                ? "border-green-500/30 bg-green-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            )}>
              <div className="flex items-center gap-2">
                {vesyncResult.errors === 0 ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                )}
                <p className="text-sm font-medium">
                  {vesyncResult.imported} imported
                  {vesyncResult.skipped > 0 && `, ${vesyncResult.skipped} skipped (duplicates)`}
                  {vesyncResult.errors > 0 && `, ${vesyncResult.errors} errors`}
                </p>
              </div>
              {vesyncResult.dateRange && (
                <p className="text-[10px] text-muted-foreground">
                  Date range: {new Date(vesyncResult.dateRange.from).toLocaleDateString()} – {new Date(vesyncResult.dateRange.to).toLocaleDateString()}
                </p>
              )}
              {vesyncResult.totalRows > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {vesyncResult.totalRows} total rows in CSV
                </p>
              )}
              {vesyncResult.errorMessages && vesyncResult.errorMessages.length > 0 && (
                <div className="max-h-32 overflow-y-auto bg-background/50 rounded p-2 space-y-0.5">
                  {vesyncResult.errorMessages.map((msg, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground font-mono">{msg}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Templates</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Copy a template to give to ChatGPT, or paste an example to see how it works
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="food" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="food" className="text-[10px]">Food</TabsTrigger>
              <TabsTrigger value="workouts" className="text-[10px]">Workouts</TabsTrigger>
              <TabsTrigger value="body" className="text-[10px]">Body</TabsTrigger>
              <TabsTrigger value="all" className="text-[10px]">Combined</TabsTrigger>
            </TabsList>

            {[
              { key: "food", example: FOOD_LOG_EXAMPLE },
              { key: "workouts", example: WORKOUT_EXAMPLE },
              { key: "body", example: MEASUREMENT_EXAMPLE },
              { key: "all", example: COMBINED_EXAMPLE },
            ].map(({ key, example }) => (
              <TabsContent key={key} value={key} className="mt-2">
                <pre className="text-[10px] bg-secondary/30 rounded-lg p-3 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {example}
                </pre>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => handleCopyTemplate(example)}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => handlePasteExample(example)}
                  >
                    Use as example
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* JSON Input */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Paste Your Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              setParseError(null);
              setResult(null);
            }}
            placeholder='{"foodLogs": [...], "workouts": [...], "measurements": [...]}'
            rows={12}
            className="font-mono text-xs resize-y"
          />

          {/* Validation status */}
          {parseError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/10 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{parseError}</p>
            </div>
          )}

          {validation && !validation.valid && !parseError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/10 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{validation.error}</p>
            </div>
          )}

          {entryCounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entryCounts.map(({ label, count, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5"
                >
                  <Icon className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs font-medium text-green-400">
                    {count} {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={importing || !validation?.valid}
            className="w-full h-11 gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Import Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className={cn(
          "border-2",
          result.totalErrors === 0 ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"
        )}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {result.totalErrors === 0 ? (
                <Check className="h-5 w-5 text-green-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              )}
              <p className="text-sm font-medium">
                {result.totalImported} records imported
                {result.totalErrors > 0 && `, ${result.totalErrors} errors`}
              </p>
            </div>

            {Object.entries(result.details).map(([key, detail]) => (
              <div
                key={key}
                className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2"
              >
                <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">
                  {detail.imported} imported
                  {detail.errors > 0 && (
                    <span className="text-destructive ml-1">({detail.errors} failed)</span>
                  )}
                </span>
              </div>
            ))}

            {result.errorMessages && result.errorMessages.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-medium text-destructive">Error details:</p>
                <div className="max-h-40 overflow-y-auto bg-background/50 rounded-lg p-2 space-y-0.5">
                  {result.errorMessages.map((msg, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground font-mono">
                      {msg}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
