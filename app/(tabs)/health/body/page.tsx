"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Minus,
  Scale,
  Ruler,
  Crosshair,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { MeasurementWizard } from "@/components/measurement-wizard";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getBodyFatCategory, type Gender } from "@/lib/body-fat";
import { useCachedFetch, invalidateHealthCache } from "@/lib/cache";

interface BodyEntry {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armsCm: number | null;
  legsCm: number | null;
  hipsCm: number | null;
  shouldersCm: number | null;
  neckCm: number | null;
  forearmsCm: number | null;
  calvesCm: number | null;
  skinfoldData: Record<string, number> | null;
  notes: string | null;
}

export default function BodyMeasurementsPage() {
  const { data: entries, initialLoading, refresh: fetchEntries } =
    useCachedFetch<BodyEntry[]>("/api/health/body", { ttl: 60_000 });
  const [showWizard, setShowWizard] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [gender, setGender] = useState<Gender | "">("");

  const isImperial = units === "imperial";

  useEffect(() => {
    const settings = getSettings();
    setUnits(settings.units);
    setGender(settings.gender || "");
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/health/body?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateHealthCache();
        fetchEntries();
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const getTrendIcon = (current: number | null, previous: number | null, invertColors = false) => {
    if (!current || !previous) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (current < previous)
      return (
        <TrendingDown
          className={cn("h-3 w-3", invertColors ? "text-red-500" : "text-green-500")}
        />
      );
    if (current > previous)
      return (
        <TrendingUp
          className={cn("h-3 w-3", invertColors ? "text-green-500" : "text-red-500")}
        />
      );
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const formatWeight = (kg: number | null) => {
    if (!kg) return "—";
    return isImperial ? `${Math.round(kg * 2.205 * 10) / 10} lbs` : `${kg} kg`;
  };

  const formatCm = (cm: number | null) => {
    if (!cm) return null;
    return isImperial ? `${Math.round(cm / 2.54 * 10) / 10}"` : `${cm} cm`;
  };

  const safeEntries = entries ?? [];
  const latest = safeEntries[0];
  const previous = safeEntries[1];

  // Gather all circumference data for the latest entry
  const latestCircumferences = latest
    ? [
        { label: "Neck", value: latest.neckCm },
        { label: "Shoulders", value: latest.shouldersCm },
        { label: "Chest", value: latest.chestCm },
        { label: "Waist", value: latest.waistCm },
        { label: "Hips", value: latest.hipsCm },
        { label: "Arms", value: latest.armsCm },
        { label: "Forearms", value: latest.forearmsCm },
        { label: "Thighs", value: latest.legsCm },
        { label: "Calves", value: latest.calvesCm },
      ].filter((c) => c.value != null)
    : [];

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Body Measurements</h1>
          <p className="text-xs text-muted-foreground">
            Track your body composition
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" /> Measure
        </Button>
      </div>

      {/* Latest Measurement Summary */}
      {latest && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Latest — {format(new Date(latest.measuredAt), "MMM d, yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary metrics row */}
            <div className="grid grid-cols-3 gap-4">
              {latest.weightKg != null && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-xl font-bold">
                      {isImperial
                        ? Math.round(latest.weightKg * 2.205 * 10) / 10
                        : latest.weightKg}
                    </span>
                    {getTrendIcon(latest.weightKg, previous?.weightKg ?? null)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isImperial ? "lbs" : "kg"}
                  </span>
                </div>
              )}
              {latest.bodyFatPct != null && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    <Crosshair className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xl font-bold">{latest.bodyFatPct}%</span>
                    {getTrendIcon(latest.bodyFatPct, previous?.bodyFatPct ?? null)}
                  </div>
                  <span className="text-xs text-muted-foreground">body fat</span>
                  {gender && (
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        getBodyFatCategory(latest.bodyFatPct, gender as Gender).color
                      )}
                    >
                      {getBodyFatCategory(latest.bodyFatPct, gender as Gender).label}
                    </span>
                  )}
                </div>
              )}
              {latest.waistCm != null && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-xl font-bold">
                      {isImperial
                        ? Math.round(latest.waistCm / 2.54 * 10) / 10
                        : latest.waistCm}
                    </span>
                    {getTrendIcon(latest.waistCm, previous?.waistCm ?? null)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isImperial ? '"' : "cm"} waist
                  </span>
                </div>
              )}
            </div>

            {/* Circumference overview */}
            {latestCircumferences.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                  Circumferences
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {latestCircumferences.map((c) => (
                    <div
                      key={c.label}
                      className="bg-secondary/30 rounded-lg p-2 text-center"
                    >
                      <p className="text-sm font-semibold">{formatCm(c.value!)}</p>
                      <p className="text-[10px] text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {initialLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : safeEntries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Scale className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>No measurements yet.</p>
              <p className="text-xs mt-1">
                Tap <strong>Measure</strong> to start the guided walkthrough.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">BF%</TableHead>
                    <TableHead className="text-right">Waist</TableHead>
                    <TableHead className="text-right w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeEntries.map((entry, idx) => {
                    const prev = safeEntries[idx + 1];
                    const isExpanded = expandedEntry === entry.id;

                    // Collect extra circumferences for expandable detail
                    const extraCircum = [
                      { label: "Neck", value: entry.neckCm },
                      { label: "Shoulders", value: entry.shouldersCm },
                      { label: "Chest", value: entry.chestCm },
                      { label: "Hips", value: entry.hipsCm },
                      { label: "Arms", value: entry.armsCm },
                      { label: "Forearms", value: entry.forearmsCm },
                      { label: "Thighs", value: entry.legsCm },
                      { label: "Calves", value: entry.calvesCm },
                    ].filter((c) => c.value != null);

                    const hasExtra = extraCircum.length > 0 || entry.skinfoldData;

                    return (
                      <TableRow
                        key={entry.id}
                        className={cn(isExpanded && "border-b-0")}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {hasExtra && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedEntry(isExpanded ? null : entry.id)
                                }
                                className="p-0.5"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            <span className="text-sm">
                              {format(new Date(entry.measuredAt), "MMM d")}
                            </span>
                          </div>
                          {/* Expandable detail row */}
                          {isExpanded && (
                            <div className="mt-2 space-y-2 pb-2">
                              {extraCircum.length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {extraCircum.map((c) => (
                                    <div
                                      key={c.label}
                                      className="flex justify-between text-[10px] bg-secondary/20 rounded px-2 py-1"
                                    >
                                      <span className="text-muted-foreground">
                                        {c.label}
                                      </span>
                                      <span className="font-medium">
                                        {formatCm(c.value!)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {entry.skinfoldData && (
                                <div className="text-[10px] text-muted-foreground">
                                  <span className="font-medium text-foreground/70">
                                    Skinfold:
                                  </span>{" "}
                                  {Object.entries(
                                    entry.skinfoldData as Record<string, number>
                                  )
                                    .map(
                                      ([site, mm]) =>
                                        `${site}: ${mm}mm`
                                    )
                                    .join(", ")}
                                </div>
                              )}
                              {entry.notes && (
                                <p className="text-[10px] text-muted-foreground italic">
                                  {entry.notes}
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {entry.weightKg != null ? (
                            <div className="flex items-center justify-end gap-1">
                              {formatWeight(entry.weightKg)}
                              {getTrendIcon(entry.weightKg, prev?.weightKg ?? null)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {entry.bodyFatPct != null ? `${entry.bodyFatPct}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {entry.waistCm != null ? formatCm(entry.waistCm) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <ConfirmDelete
                            onConfirm={() => handleDelete(entry.id)}
                            itemName="this measurement"
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measurement Wizard */}
      <MeasurementWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onSaved={() => {
          invalidateHealthCache();
          fetchEntries();
        }}
      />

      {/* Voice Input */}
      <VoiceInput onDataLogged={() => { invalidateHealthCache(); fetchEntries(); }} />
    </div>
  );
}
