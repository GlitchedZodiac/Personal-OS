"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Check,
  ChevronRight,
  FileUp,
  HeartPulse,
  KeyRound,
  Loader2,
  MoonStar,
  RefreshCw,
  Watch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AIStatusCard } from "@/components/ai-status-card";
import { HealthExportCard } from "@/components/health-export-card";
import {
  getSettings,
  saveSettingsToServer,
  fetchServerSettings,
  type AppSettings,
} from "@/lib/settings";

// Pitaya Settings — four calm sections (design: Pitaya App.dc.html):
// WATCH (arrives with the watch app), DATA, APP, SYSTEM. The old settings
// page (macros, coach instructions, finance) lives in git history; macros
// resurface on Food, and finance/todos are intentionally gone from the UI.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="micro-label px-1">{children}</p>;
}

function Row({
  icon: Icon,
  title,
  sub,
  right,
}: {
  icon: typeof Watch;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function PillGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
              : "rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function applyTheme(theme: AppSettings["theme"]) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saved, setSaved] = useState(false);

  // PIN change state
  const [showPin, setShowPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  // Strava (current GPS source until the watch replaces it)
  const [strava, setStrava] = useState<{ connected: boolean; athleteName?: string } | null>(null);
  const [stravaSyncing, setStravaSyncing] = useState(false);

  useEffect(() => {
    fetchServerSettings().then((server) => {
      setSettings(server);
      applyTheme(server.theme);
    });
    fetch("/api/strava/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStrava)
      .catch(() => setStrava(null));
  }, []);

  const update = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    if (partial.theme) applyTheme(partial.theme);
    await saveSettingsToServer(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const changePin = async () => {
    setPinBusy(true);
    try {
      const res = await fetch("/api/auth/update-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (res.ok) {
        toast.success("PIN updated");
        setShowPin(false);
        setCurrentPin("");
        setNewPin("");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Couldn't update PIN");
      }
    } finally {
      setPinBusy(false);
    }
  };

  const syncStrava = async () => {
    setStravaSyncing(true);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) toast.success(`Synced ${body.imported ?? 0} activities`);
      else toast.error(body.error || "Sync failed");
    } finally {
      setStravaSyncing(false);
    }
  };

  return (
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 space-y-6 max-w-lg lg:max-w-2xl">
      <header className="flex items-end justify-between">
        <div>
          <p className="micro-label">Pitaya</p>
          <h1
            className="mt-1 text-3xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Settings
          </h1>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-[#5E9B72]">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </header>

      {/* WATCH */}
      <section className="space-y-2">
        <SectionLabel>Watch</SectionLabel>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <Row
              icon={HeartPulse}
              title="HRV + recovery score"
              sub="Pairs when the watch app connects"
              right={<span className="micro-label">Soon</span>}
            />
            <Row
              icon={MoonStar}
              title="Sleep stages"
              sub="Pairs when the watch app connects"
              right={<span className="micro-label">Soon</span>}
            />
            <Row
              icon={Watch}
              title="Live workout mirroring"
              sub="Pairs when the watch app connects"
              right={<span className="micro-label">Soon</span>}
            />
          </CardContent>
        </Card>
      </section>

      {/* DATA */}
      <section className="space-y-2">
        <SectionLabel>Data</SectionLabel>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <Link href="/settings/import" className="block">
              <Row
                icon={FileUp}
                title="CSV import"
                sub="Bring in outside data"
                right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
              />
            </Link>
            <Row
              icon={Activity}
              title="Strava"
              sub={
                strava?.connected
                  ? `Connected${strava.athleteName ? ` · ${strava.athleteName}` : ""}`
                  : "Not connected"
              }
              right={
                strava?.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full"
                    onClick={syncStrava}
                    disabled={stravaSyncing}
                  >
                    {stravaSyncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1 text-xs">Sync</span>
                  </Button>
                ) : (
                  <a
                    href="/api/strava/auth"
                    className="text-xs font-semibold text-primary"
                  >
                    Connect
                  </a>
                )
              }
            />
          </CardContent>
        </Card>
        <HealthExportCard />
      </section>

      {/* APP */}
      <section className="space-y-2">
        <SectionLabel>App</SectionLabel>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <Row
              icon={KeyRound}
              title="PIN lock"
              sub="4–8 digits"
              right={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full text-xs"
                  onClick={() => setShowPin((v) => !v)}
                >
                  Change
                </Button>
              }
            />
            {showPin && (
              <div className="space-y-2 px-4 py-3.5">
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="Current PIN"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                />
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="New PIN"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
                <Button
                  className="w-full rounded-full"
                  size="sm"
                  onClick={changePin}
                  disabled={pinBusy || currentPin.length < 4 || newPin.length < 4}
                >
                  {pinBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update PIN"
                  )}
                </Button>
              </div>
            )}
            <Row
              icon={Activity}
              title="Units"
              right={
                <PillGroup
                  value={settings.units}
                  options={[
                    { value: "metric", label: "kg · km" },
                    { value: "imperial", label: "lb · mi" },
                  ]}
                  onChange={(units) => update({ units })}
                />
              }
            />
            <Row
              icon={MoonStar}
              title="Appearance"
              right={
                <PillGroup
                  value={settings.theme}
                  options={[
                    { value: "light", label: "Day" },
                    { value: "dark", label: "Night" },
                    { value: "system", label: "Auto" },
                  ]}
                  onChange={(theme) => update({ theme })}
                />
              }
            />
            <Row
              icon={Activity}
              title="Chat language"
              sub="How the notebook replies"
              right={
                <PillGroup
                  value={settings.aiLanguage}
                  options={[
                    { value: "english", label: "EN" },
                    { value: "spanish", label: "ES" },
                  ]}
                  onChange={(aiLanguage) => update({ aiLanguage })}
                />
              }
            />
          </CardContent>
        </Card>
      </section>

      {/* SYSTEM */}
      <section className="space-y-2">
        <SectionLabel>System</SectionLabel>
        <AIStatusCard />
      </section>
    </div>
  );
}
