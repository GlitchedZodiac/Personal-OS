"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Settings,
  Target,
  Ruler,
  Palette,
  Lock,
  LogOut,
  Brain,
  Heart,
  CheckSquare,
  Share2,
  Dumbbell,
  Mic,
  ChevronRight,
  User,
  Upload,
  Scale,
  Check,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Bell,
  BellRing,
  Unplug,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getSettings, saveSettingsToServer, getMacroGrams, fetchServerSettings, type AppSettings } from "@/lib/settings";
import { MacroSlider } from "@/components/macro-slider";
import Link from "next/link";

interface BalanceInfo {
  available: boolean;
  totalGranted?: number | null;
  totalUsed?: number | null;
  totalAvailable?: number | null;
  plan?: string;
  hardLimitUsd?: number | null;
  softLimitUsd?: number | null;
  monthlyUsageUsd?: number | null;
  accessUntil?: string | null;
  keyValid?: boolean;
  message?: string;
  dashboardUrl?: string;
  error?: string;
}

function NotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined") return "default";
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  const handleEnable = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Notifications enabled! You'll get reminders on this device.");
    }
  };

  if (permission === "unsupported") {
    return <p className="text-xs text-muted-foreground">Notifications not supported on this browser.</p>;
  }

  if (permission === "granted") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <BellRing className="h-4 w-4" />
        <span>Notifications are enabled on this device</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <p className="text-xs text-muted-foreground">
        Notifications are blocked. Enable them in your browser/device settings.
      </p>
    );
  }

  return (
    <Button onClick={handleEnable} variant="outline" size="sm" className="gap-2">
      <Bell className="h-4 w-4" />
      Enable Notifications
    </Button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  // Strava state
  const [stravaStatus, setStravaStatus] = useState<{
    connected: boolean;
    athleteName?: string;
    athletePhoto?: string;
    syncedWorkouts?: number;
    lastSyncedAt?: string;
    tokenExpired?: boolean;
  } | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/ai/balance");
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      } else {
        setBalance({ available: false, error: "Failed to fetch" });
      }
    } catch {
      setBalance({ available: false, error: "Network error" });
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchStravaStatus = useCallback(async () => {
    setStravaLoading(true);
    try {
      const res = await fetch("/api/strava/status");
      if (res.ok) {
        const data = await res.json();
        setStravaStatus(data);
      }
    } catch {
      setStravaStatus({ connected: false });
    } finally {
      setStravaLoading(false);
    }
  }, []);

  const handleStravaConnect = () => {
    const appUrl = window.location.origin;
    window.location.href = `/api/strava/auth?redirect=${encodeURIComponent(appUrl)}`;
  };

  const handleStravaDisconnect = async () => {
    if (!confirm("Disconnect Strava? Your synced workouts will remain.")) return;
    try {
      const res = await fetch("/api/strava/status", { method: "DELETE" });
      if (res.ok) {
        setStravaStatus({ connected: false });
        toast.success("Strava disconnected");
      }
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleStravaSync = async (fullSync = false) => {
    setStravaSyncing(true);
    try {
      const res = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullSync }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Synced ${data.synced} activities`);
        fetchStravaStatus(); // refresh status
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed — network error");
    } finally {
      setStravaSyncing(false);
    }
  };

  useEffect(() => {
    // Load settings from server DB (syncs across devices), then fall back to localStorage
    fetchServerSettings().then((s) => setSettings(s));
    fetchBalance();
    fetchStravaStatus();

    // Check for Strava callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get("strava") === "connected") {
      toast.success("Strava connected successfully! 🎉");
      // Clean up URL
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("strava") === "error") {
      toast.error(`Strava error: ${params.get("message") || "unknown"}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, [fetchBalance, fetchStravaStatus]);

  // Auto-save whenever settings change (debounced 500ms) — saves to BOTH localStorage + server DB
  const autoSave = useCallback((newSettings: AppSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveSettingsToServer(newSettings);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    }, 500);
  }, []);

  // Wrap setSettings to trigger auto-save
  const updateSettings = useCallback((updater: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Don't auto-save on first render / hydration
      if (!isFirstRender.current) {
        autoSave(next);
      }
      return next;
    });
  }, [autoSave]);

  // After first useEffect, mark first render done
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  const handleMacroChange = (protein: number, carbs: number, fat: number) => {
    updateSettings((prev) => ({ ...prev, proteinPct: protein, carbsPct: carbs, fatPct: fat }));
  };

  const handleChangePin = async () => {
    setPinError("");

    if (newPin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs don't match");
      return;
    }

    try {
      const verifyRes = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: currentPin }),
      });

      if (!verifyRes.ok) {
        setPinError("Current PIN is incorrect");
        return;
      }

      const updateRes = await fetch("/api/auth/update-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });

      if (updateRes.ok) {
        toast.success("PIN updated successfully!");
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
      } else {
        setPinError("Failed to update PIN");
      }
    } catch {
      setPinError("Failed to update PIN");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
      window.location.reload();
    } catch {
      toast.error("Failed to log out");
    }
  };

  const macros = getMacroGrams(settings);

  return (
    <div className="px-4 pt-12 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        {showSaved && (
          <div className="flex items-center gap-1.5 text-xs text-green-400 animate-in fade-in">
            <Check className="h-3.5 w-3.5" />
            Saved
          </div>
        )}
      </div>

      {/* Nutrition Targets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-orange-500" />
            Daily Nutrition Targets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="text-xs text-muted-foreground">
              Calorie Target (kcal)
            </Label>
            <Input
              type="number"
              value={settings.calorieTarget}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  calorieTarget: parseInt(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          {/* Macro Slider */}
          <div>
            <Label className="text-xs text-muted-foreground mb-3 block">
              Macro Distribution (drag the handles or use ±)
            </Label>
            <MacroSlider
              proteinPct={settings.proteinPct}
              carbsPct={settings.carbsPct}
              fatPct={settings.fatPct}
              onChange={handleMacroChange}
              calorieTarget={settings.calorieTarget}
            />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Daily targets: {macros.proteinG}g protein • {macros.carbsG}g carbs • {macros.fatG}g fat ={" "}
            {macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9} kcal
          </p>
        </CardContent>
      </Card>

      {/* Body Goals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4 text-green-500" />
            Body Goals
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Target lines will appear on your trend charts
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Goal Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.bodyGoals?.goalWeightKg ?? ""}
                onChange={(e) =>
                  updateSettings({
                    ...settings,
                    bodyGoals: {
                      ...settings.bodyGoals,
                      goalWeightKg: e.target.value ? parseFloat(e.target.value) : null,
                    },
                  })
                }
                placeholder="e.g. 75"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Goal Waist (cm)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.bodyGoals?.goalWaistCm ?? ""}
                onChange={(e) =>
                  updateSettings({
                    ...settings,
                    bodyGoals: {
                      ...settings.bodyGoals,
                      goalWaistCm: e.target.value ? parseFloat(e.target.value) : null,
                    },
                  })
                }
                placeholder="e.g. 82"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workout Training — Voice-first */}
      <Link href="/health/workouts/plan">
        <Card className="border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/10">
              <Dumbbell className="h-6 w-6 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Workout Plan</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Talk to AI to build and manage your training
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Mic className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] text-purple-400 font-medium">
                  Voice-powered — just tell AI what you want
                </span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* Import Data */}
      <Link href="/settings/import">
        <Card className="border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-cyan-500/10">
              <Upload className="h-6 w-6 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Import Historical Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bulk import meals, workouts, and measurements from ChatGPT
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* Strava Integration */}
      <Card className="border-orange-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" fill="#FC4C02"/>
            </svg>
            <span className="text-orange-400">Strava</span>
            {stravaStatus?.connected && (
              <span className="ml-auto text-[10px] text-green-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Connected
              </span>
            )}
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Sync your runs, rides, and workouts automatically
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {stravaLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking connection...
            </div>
          ) : stravaStatus?.connected ? (
            <>
              {/* Athlete info */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                {stravaStatus.athletePhoto && (
                  <img
                    src={stravaStatus.athletePhoto}
                    alt="Strava avatar"
                    className="h-10 w-10 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {stravaStatus.athleteName || "Strava Athlete"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {stravaStatus.syncedWorkouts || 0} workouts synced
                    {stravaStatus.lastSyncedAt && (
                      <> • Last sync: {new Date(stravaStatus.lastSyncedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Sync buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleStravaSync(false)}
                  disabled={stravaSyncing}
                  size="sm"
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {stravaSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Sync Recent
                </Button>
                <Button
                  onClick={() => handleStravaSync(true)}
                  disabled={stravaSyncing}
                  size="sm"
                  variant="outline"
                  className="border-orange-500/30 text-orange-400"
                >
                  Full Sync
                </Button>
              </div>

              {/* Disconnect */}
              <Button
                onClick={handleStravaDisconnect}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-red-400"
              >
                <Unplug className="h-3 w-3 mr-1.5" />
                Disconnect Strava
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Connect your Strava account to automatically import your runs, rides, hikes, and other activities.
              </p>
              <Button
                onClick={handleStravaConnect}
                className="w-full bg-[#FC4C02] hover:bg-[#e54502] text-white"
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="white">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                </svg>
                Connect with Strava
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* OpenAI Balance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-500" />
              OpenAI Balance
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchBalance}
              disabled={balanceLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {balanceLoading && !balance ? (
            <div className="text-xs text-muted-foreground animate-pulse">
              Checking balance...
            </div>
          ) : balance?.available && balance.totalAvailable != null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Available</span>
                <span className="text-lg font-bold text-emerald-400">
                  ${balance.totalAvailable.toFixed(2)}
                </span>
              </div>
              {balance.totalUsed != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Used</span>
                  <span className="text-sm font-medium">
                    ${balance.totalUsed.toFixed(2)}
                  </span>
                </div>
              )}
              {balance.totalGranted != null && (
                <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((balance.totalAvailable ?? 0) / (balance.totalGranted ?? 1)) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ) : balance?.available && balance.plan ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plan</span>
                <span className="text-sm font-medium">{balance.plan}</span>
              </div>
              {balance.monthlyUsageUsd != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">This Month</span>
                  <span className="text-sm font-medium">
                    ${balance.monthlyUsageUsd.toFixed(2)}
                    {balance.hardLimitUsd != null && (
                      <span className="text-muted-foreground"> / ${balance.hardLimitUsd}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {balance?.keyValid === true ? (
                <p className="text-xs text-emerald-400">✓ API key is valid</p>
              ) : balance?.keyValid === false ? (
                <p className="text-xs text-red-400">✗ API key is invalid or expired</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {balance?.message || "Billing details unavailable from API"}
              </p>
            </div>
          )}
          <a
            href={balance?.dashboardUrl || "https://platform.openai.com/settings/organization/billing/overview"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline mt-3"
          >
            <ExternalLink className="h-3 w-3" />
            View on OpenAI Dashboard
          </a>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            Notifications
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Enable push notifications for reminders and todo alerts
          </p>
        </CardHeader>
        <CardContent>
          <NotificationPermission />
        </CardContent>
      </Card>

      {/* AI Behavior Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            AI Behavior
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Customize how the AI behaves in each section of the app
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Response Language */}
          <div>
            <Label className="text-xs text-muted-foreground">AI Response Language</Label>
            <p className="text-[10px] text-muted-foreground mb-1.5">
              AI insights and tips will always respond in this language, even if you log in another language
            </p>
            <Select
              value={settings.aiLanguage || "english"}
              onValueChange={(v) =>
                updateSettings({
                  ...settings,
                  aiLanguage: v as AppSettings["aiLanguage"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="spanish">Español</SelectItem>
                <SelectItem value="portuguese">Português</SelectItem>
                <SelectItem value="french">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="health" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="health" className="text-xs gap-1">
                <Heart className="h-3 w-3" />
                Health
              </TabsTrigger>
              <TabsTrigger value="todos" className="text-xs gap-1">
                <CheckSquare className="h-3 w-3" />
                Todos
              </TabsTrigger>
              <TabsTrigger value="social" className="text-xs gap-1">
                <Share2 className="h-3 w-3" />
                Social
              </TabsTrigger>
            </TabsList>

            <TabsContent value="health" className="mt-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Health AI Instructions
                </Label>
                <Textarea
                  value={settings.aiInstructions?.health || ""}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      aiInstructions: {
                        ...settings.aiInstructions,
                        health: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., I'm doing keto so keep carbs under 20g per meal. I eat mostly Colombian food. Always respond in Spanish. I'm lactose intolerant..."
                  rows={4}
                  className="text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  These instructions will be sent to the AI when logging food, measurements, and workouts.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="todos" className="mt-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Todos AI Instructions
                </Label>
                <Textarea
                  value={settings.aiInstructions?.todos || ""}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      aiInstructions: {
                        ...settings.aiInstructions,
                        todos: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., I'm a software engineer. Help me break tasks into smaller steps. Prioritize by urgency..."
                  rows={4}
                  className="text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  These instructions will be sent to the AI when managing your task list.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="social" className="mt-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Social Media AI Instructions
                </Label>
                <Textarea
                  value={settings.aiInstructions?.social || ""}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      aiInstructions: {
                        ...settings.aiInstructions,
                        social: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g., My brand voice is casual and witty. I post about tech and fitness. Keep posts under 280 characters for Twitter..."
                  rows={4}
                  className="text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  These instructions will be sent to the AI when drafting social media content.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-cyan-500" />
            Profile
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Used for body fat caliper calculations
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Sex</Label>
              <Select
                value={settings.gender || "unset"}
                onValueChange={(v) =>
                  updateSettings({
                    ...settings,
                    gender: v === "unset" ? "" : (v as "male" | "female"),
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Birth Year</Label>
              <Input
                type="number"
                value={settings.birthYear || ""}
                onChange={(e) =>
                  updateSettings({
                    ...settings,
                    birthYear: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="1990"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Units */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Ruler className="h-4 w-4 text-blue-500" />
            Units
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.units}
            onValueChange={(v) =>
              updateSettings({
                ...settings,
                units: v as "metric" | "imperial",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">Metric (kg, cm)</SelectItem>
              <SelectItem value="imperial">Imperial (lbs, in)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Palette className="h-4 w-4 text-purple-500" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.theme}
            onValueChange={(v) =>
              updateSettings({
                ...settings,
                theme: v as "dark" | "light" | "system",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark Mode</SelectItem>
              <SelectItem value="light">Light Mode</SelectItem>
              <SelectItem value="system">System Default</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Change PIN */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-500" />
            Change PIN
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Current PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="Enter current PIN"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Enter new PIN"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Confirm New PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Confirm new PIN"
              className="mt-1"
            />
          </div>
          {pinError && (
            <p className="text-xs text-destructive">{pinError}</p>
          )}
          <Button
            onClick={handleChangePin}
            variant="outline"
            className="w-full"
            disabled={!currentPin || !newPin || !confirmPin}
          >
            Update PIN
          </Button>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        onClick={handleLogout}
        variant="destructive"
        className="w-full h-11"
      >
        <LogOut className="h-4 w-4 mr-2" /> Lock App
      </Button>

      {/* Version */}
      <p className="text-center text-[10px] text-muted-foreground pt-2">
        Personal OS v1.0
      </p>
    </div>
  );
}
