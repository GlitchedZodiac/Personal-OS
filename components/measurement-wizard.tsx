"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Scale,
  Ruler,
  Crosshair,
  SkipForward,
  Loader2,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSettings } from "@/lib/settings";
import {
  computeBodyFat3Site,
  getSitesForGender,
  getBodyFatCategory,
  CIRCUMFERENCE_SITES,
  type SkinfoldData,
  type Gender,
  type SiteInstruction,
  type CircumferenceSite,
} from "@/lib/body-fat";

// ─── Types ───────────────────────────────────────────────────────

type MeasurementCategory = "weight" | "circumferences" | "caliper";

interface MeasurementData {
  weightKg: string;
  // Circumferences
  neckCm: string;
  shouldersCm: string;
  chestCm: string;
  waistCm: string;
  hipsCm: string;
  armsCm: string;
  forearmsCm: string;
  legsCm: string;
  calvesCm: string;
  // Skinfold (caliper)
  chest: string; // mm
  abdomen: string; // mm
  thigh: string; // mm
  triceps: string; // mm
  suprailiac: string; // mm
  // Computed
  bodyFatPct: number | null;
  notes: string;
}

const EMPTY_DATA: MeasurementData = {
  weightKg: "",
  neckCm: "",
  shouldersCm: "",
  chestCm: "",
  waistCm: "",
  hipsCm: "",
  armsCm: "",
  forearmsCm: "",
  legsCm: "",
  calvesCm: "",
  chest: "",
  abdomen: "",
  thigh: "",
  triceps: "",
  suprailiac: "",
  bodyFatPct: null,
  notes: "",
};

interface WizardStep {
  type: "category_select" | "weight" | "circumference" | "caliper_intro" | "caliper_site" | "caliper_result" | "review";
  title: string;
  // For circumference steps
  circumferenceSite?: CircumferenceSite;
  // For caliper site steps
  skinfoldSite?: SiteInstruction;
}

interface MeasurementWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// ─── Component ───────────────────────────────────────────────────

export function MeasurementWizard({
  open,
  onOpenChange,
  onSaved,
}: MeasurementWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<MeasurementCategory>>(new Set());
  const [data, setData] = useState<MeasurementData>({ ...EMPTY_DATA });
  const [gender, setGender] = useState<Gender | "">(() => {
    const settings = getSettings();
    return settings.gender || "";
  });
  const [saving, setSaving] = useState(false);

  const age = useMemo(() => {
    const settings = getSettings();
    if (settings.birthYear) {
      return new Date().getFullYear() - settings.birthYear;
    }
    return 30; // default fallback
  }, []);

  const units = useMemo(() => getSettings().units, []);
  const isImperial = units === "imperial";

  // Build the step list dynamically based on selected categories
  const steps: WizardStep[] = useMemo(() => {
    const result: WizardStep[] = [
      { type: "category_select", title: "What would you like to measure?" },
    ];

    if (selectedCategories.has("weight")) {
      result.push({ type: "weight", title: "Weight" });
    }

    if (selectedCategories.has("circumferences")) {
      for (const site of CIRCUMFERENCE_SITES) {
        result.push({
          type: "circumference",
          title: site.name,
          circumferenceSite: site,
        });
      }
    }

    if (selectedCategories.has("caliper")) {
      result.push({ type: "caliper_intro", title: "Body Fat Caliper" });
      const sites = gender ? getSitesForGender(gender as Gender) : [];
      for (const site of sites) {
        result.push({
          type: "caliper_site",
          title: site.name,
          skinfoldSite: site,
        });
      }
      result.push({ type: "caliper_result", title: "Body Fat Result" });
    }

    result.push({ type: "review", title: "Review & Save" });

    return result;
  }, [selectedCategories, gender]);

  const currentStep = steps[step] || steps[0];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progress = steps.length > 1 ? (step / (steps.length - 1)) * 100 : 0;

  const toggleCategory = (cat: MeasurementCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const updateField = (field: keyof MeasurementData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  // Compute body fat when reaching caliper result step
  const computedBodyFat = useMemo(() => {
    if (!gender) return null;
    const skinfolds: SkinfoldData = {
      chest: data.chest ? parseFloat(data.chest) : undefined,
      abdomen: data.abdomen ? parseFloat(data.abdomen) : undefined,
      thigh: data.thigh ? parseFloat(data.thigh) : undefined,
      triceps: data.triceps ? parseFloat(data.triceps) : undefined,
      suprailiac: data.suprailiac ? parseFloat(data.suprailiac) : undefined,
    };
    return computeBodyFat3Site(gender as Gender, age, skinfolds);
  }, [data, gender, age]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};

      // Weight
      if (data.weightKg) {
        const w = parseFloat(data.weightKg);
        body.weightKg = isImperial ? Math.round(w / 2.205 * 10) / 10 : w;
      }

      // Circumferences — convert from inches to cm if imperial
      const circumFields = [
        "neckCm", "shouldersCm", "chestCm", "waistCm",
        "hipsCm", "armsCm", "forearmsCm", "legsCm", "calvesCm",
      ] as const;
      for (const field of circumFields) {
        const val = data[field];
        if (val) {
          const num = parseFloat(val);
          body[field] = isImperial ? Math.round(num * 2.54 * 10) / 10 : num;
        }
      }

      // Body fat from caliper
      if (computedBodyFat !== null) {
        body.bodyFatPct = computedBodyFat;
      }

      // Skinfold raw data
      const skinfoldRaw: Record<string, number> = {};
      if (data.chest) skinfoldRaw.chest = parseFloat(data.chest);
      if (data.abdomen) skinfoldRaw.abdomen = parseFloat(data.abdomen);
      if (data.thigh) skinfoldRaw.thigh = parseFloat(data.thigh);
      if (data.triceps) skinfoldRaw.triceps = parseFloat(data.triceps);
      if (data.suprailiac) skinfoldRaw.suprailiac = parseFloat(data.suprailiac);
      if (Object.keys(skinfoldRaw).length > 0) {
        body.skinfoldData = skinfoldRaw;
      }

      if (data.notes) body.notes = data.notes;

      const res = await fetch("/api/health/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("Measurements saved!");
        // Reset
        setData({ ...EMPTY_DATA });
        setStep(0);
        setSelectedCategories(new Set());
        onOpenChange(false);
        onSaved();
      } else {
        toast.error("Failed to save measurements.");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save measurements.");
    } finally {
      setSaving(false);
    }
  }, [data, computedBodyFat, isImperial, onOpenChange, onSaved]);

  const handleClose = () => {
    setData({ ...EMPTY_DATA });
    setStep(0);
    setSelectedCategories(new Set());
    onOpenChange(false);
  };

  // Count filled values for the review step
  const filledCount = useMemo(() => {
    let count = 0;
    if (data.weightKg) count++;
    const circumFields = [
      "neckCm", "shouldersCm", "chestCm", "waistCm",
      "hipsCm", "armsCm", "forearmsCm", "legsCm", "calvesCm",
    ] as const;
    for (const f of circumFields) {
      if (data[f]) count++;
    }
    if (computedBodyFat !== null) count++;
    return count;
  }, [data, computedBodyFat]);

  // ─── Render Steps ────────────────────────────────────────────

  const renderCategorySelect = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">
        Select the measurements you want to log today.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {[
          {
            cat: "weight" as MeasurementCategory,
            icon: Scale,
            label: "Weight",
            desc: "Step on the scale",
            color: "blue",
          },
          {
            cat: "circumferences" as MeasurementCategory,
            icon: Ruler,
            label: "Circumferences",
            desc: "Tape measurements (waist, chest, arms, etc.)",
            color: "green",
          },
          {
            cat: "caliper" as MeasurementCategory,
            icon: Crosshair,
            label: "Body Fat (Caliper)",
            desc: "Skinfold measurements with a body fat caliper",
            color: "amber",
          },
        ].map(({ cat, icon: Icon, label, desc, color }) => {
          const selected = selectedCategories.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                selected
                  ? `border-${color}-500 bg-${color}-500/10`
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  selected ? `bg-${color}-500/20` : "bg-secondary"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    selected ? `text-${color}-400` : "text-muted-foreground"
                  )}
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              {selected && (
                <Check className={`h-5 w-5 text-${color}-400 shrink-0`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderWeight = () => (
    <div className="space-y-4">
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-blue-400">Tips for accurate weighing</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Weigh yourself first thing in the morning</li>
              <li>After using the bathroom, before eating or drinking</li>
              <li>Wear minimal clothing or the same clothes each time</li>
              <li>Use the same scale in the same spot on the floor</li>
            </ul>
          </div>
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">
          Weight ({isImperial ? "lbs" : "kg"})
        </Label>
        <Input
          type="number"
          step="0.1"
          value={data.weightKg}
          onChange={(e) => updateField("weightKg", e.target.value)}
          placeholder={isImperial ? "185.0" : "84.0"}
          className="mt-1 text-lg h-12"
          autoFocus
        />
      </div>
    </div>
  );

  const renderCircumference = (site: CircumferenceSite) => {
    const fieldId = site.id as keyof MeasurementData;
    return (
      <div className="space-y-4">
        <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Ruler className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-green-400">{site.name}</p>
              <p>{site.description}</p>
              <div className="border-t border-green-500/10 pt-2">
                <p className="font-medium text-foreground/80 mb-1">How to measure:</p>
                <p>{site.howTo}</p>
              </div>
            </div>
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">
            {site.name} ({isImperial ? "inches" : "cm"})
          </Label>
          <Input
            type="number"
            step="0.1"
            value={data[fieldId] as string}
            onChange={(e) => updateField(fieldId, e.target.value)}
            placeholder="0.0"
            className="mt-1 text-lg h-12"
            autoFocus
          />
        </div>
      </div>
    );
  };

  const renderCaliperIntro = () => (
    <div className="space-y-4">
      <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Crosshair className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-amber-400">Jackson-Pollock 3-Site Method</p>
            <p>
              This method uses a skinfold caliper to measure fat thickness at 3 specific
              body sites. It then estimates your overall body fat percentage.
            </p>
            <div className="border-t border-amber-500/10 pt-2">
              <p className="font-medium text-foreground/80 mb-1">How to use your caliper:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Pinch the skin fold between your thumb and forefinger</li>
                <li>Place the caliper jaws about 1 cm (half inch) away from your fingers</li>
                <li>Let the caliper close on the fold — don&apos;t squeeze it shut</li>
                <li>Wait 2 seconds, then read the measurement in mm</li>
                <li>Take 2-3 readings at each site and use the average</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Gender selection for determining which 3 sites to measure */}
      <div>
        <Label className="text-sm font-medium">Your biological sex (for formula)</Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {(["male", "female"] as Gender[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={cn(
                "p-3 rounded-xl border-2 text-sm font-medium transition-all capitalize",
                gender === g
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              {g}
            </button>
          ))}
        </div>
        {gender && (
          <p className="text-xs text-muted-foreground mt-2">
            Sites:{" "}
            {getSitesForGender(gender as Gender)
              .map((s) => s.name)
              .join(", ")}
          </p>
        )}
      </div>
    </div>
  );

  const renderCaliperSite = (site: SiteInstruction) => {
    const fieldId = site.id as keyof MeasurementData;
    return (
      <div className="space-y-4">
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Crosshair className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-amber-400">{site.name}</p>
              <p>{site.description}</p>
              <div className="border-t border-amber-500/10 pt-2">
                <p className="font-medium text-foreground/80 mb-1">How to pinch:</p>
                <p>{site.howTo}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-amber-500/70">
                  Fold direction: {site.foldDirection}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">{site.name} (mm)</Label>
          <Input
            type="number"
            step="0.5"
            value={data[fieldId] as string}
            onChange={(e) => updateField(fieldId, e.target.value)}
            placeholder="0.0"
            className="mt-1 text-lg h-12"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Take 2-3 readings and enter the average.
          </p>
        </div>
      </div>
    );
  };

  const renderCaliperResult = () => {
    const category =
      computedBodyFat !== null && gender
        ? getBodyFatCategory(computedBodyFat, gender as Gender)
        : null;

    return (
      <div className="space-y-4">
        {computedBodyFat !== null ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-6 text-center space-y-3">
              <Sparkles className="h-8 w-8 text-amber-400 mx-auto" />
              <div>
                <p className="text-4xl font-bold">{computedBodyFat}%</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Estimated Body Fat
                </p>
              </div>
              {category && (
                <p className={cn("text-sm font-medium", category.color)}>
                  {category.label}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Jackson-Pollock 3-site method • Age: {age}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Could not compute body fat — some measurements are missing.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  // Go back to first caliper site
                  const firstCaliperSiteIdx = steps.findIndex(
                    (s) => s.type === "caliper_site"
                  );
                  if (firstCaliperSiteIdx >= 0) setStep(firstCaliperSiteIdx);
                }}
              >
                Go Back to Sites
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderReview = () => {
    const entries: Array<{ label: string; value: string }> = [];

    if (data.weightKg) {
      entries.push({
        label: "Weight",
        value: `${data.weightKg} ${isImperial ? "lbs" : "kg"}`,
      });
    }

    const circumFields: Array<{
      field: keyof MeasurementData;
      label: string;
    }> = [
      { field: "neckCm", label: "Neck" },
      { field: "shouldersCm", label: "Shoulders" },
      { field: "chestCm", label: "Chest" },
      { field: "waistCm", label: "Waist" },
      { field: "hipsCm", label: "Hips" },
      { field: "armsCm", label: "Arms" },
      { field: "forearmsCm", label: "Forearms" },
      { field: "legsCm", label: "Thighs" },
      { field: "calvesCm", label: "Calves" },
    ];
    for (const { field, label } of circumFields) {
      const val = data[field] as string;
      if (val) {
        entries.push({
          label,
          value: `${val} ${isImperial ? "in" : "cm"}`,
        });
      }
    }

    if (computedBodyFat !== null) {
      entries.push({ label: "Body Fat", value: `${computedBodyFat}%` });
    }

    return (
      <div className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No measurements entered. Go back and fill in at least one.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.label}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
              >
                <span className="text-sm text-muted-foreground">{e.label}</span>
                <span className="text-sm font-medium">{e.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        <div>
          <Label className="text-xs">Notes (optional)</Label>
          <Input
            value={data.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Any notes about this session..."
            className="mt-1"
          />
        </div>

        <Button
          className="w-full h-11 gap-2"
          disabled={saving || filledCount === 0}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save {filledCount} Measurement{filledCount !== 1 ? "s" : ""}
        </Button>
      </div>
    );
  };

  // ─── Main Render ────────────────────────────────────────────

  const renderCurrentStep = () => {
    switch (currentStep.type) {
      case "category_select":
        return renderCategorySelect();
      case "weight":
        return renderWeight();
      case "circumference":
        return currentStep.circumferenceSite
          ? renderCircumference(currentStep.circumferenceSite)
          : null;
      case "caliper_intro":
        return renderCaliperIntro();
      case "caliper_site":
        return currentStep.skinfoldSite
          ? renderCaliperSite(currentStep.skinfoldSite)
          : null;
      case "caliper_result":
        return renderCaliperResult();
      case "review":
        return renderReview();
      default:
        return null;
    }
  };

  const canProceedFromCategorySelect = selectedCategories.size > 0;
  const canProceedFromCaliperIntro = !!gender;

  const canNext =
    currentStep.type === "category_select"
      ? canProceedFromCategorySelect
      : currentStep.type === "caliper_intro"
      ? canProceedFromCaliperIntro
      : true;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {currentStep.title}
          </DialogTitle>
          {/* Progress bar */}
          <div className="w-full h-1 rounded-full bg-secondary mt-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Step {step + 1} of {steps.length}
          </p>
        </DialogHeader>

        {/* Step content */}
        <div className="mt-2">{renderCurrentStep()}</div>

        {/* Navigation */}
        {currentStep.type !== "review" && (
          <div className="flex gap-2 mt-4">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <div className="flex-1" />
            {/* Skip button for circumference and caliper site steps */}
            {(currentStep.type === "circumference" ||
              currentStep.type === "caliper_site") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="gap-1 text-muted-foreground"
              >
                Skip
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isLast && (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={!canNext}
                className="gap-1"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        {currentStep.type === "review" && !isFirst && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="gap-1 mt-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
