"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AIStatusCard } from "@/components/ai-status-card";
import {
  getSettings,
  saveSettingsToServer,
  fetchServerSettings,
  type AppSettings,
} from "@/lib/settings";

// Pitaya Settings — full port of the design's Settings screen
// (docs/design/pitaya-app.dc.html, screen 5). Watch pairing card + feature
// list are state-driven from real DeviceSession rows. Surfaced deviations:
// Strava row (current GPS source until the watch replaces it), chat language
// EN/ES (bilingual requirement), and the AI status card (added after the
// prod outage) — everything else is the design verbatim.

interface Device {
  id: string;
  deviceLabel: string;
  platform: string | null;
  deviceType: string | null;
  lastSeenAt: string;
}

// Watch drawing extracted from the design (screen 5, pairing card).
function WatchGlyph({ paired }: { paired: boolean }) {
  return (
    <svg width="44" height="52" viewBox="0 0 44 52" className="shrink-0">
      <rect x="13" y="0" width="18" height="9" rx="3" fill="#D9D7DC" />
      <rect x="13" y="43" width="18" height="9" rx="3" fill="#D9D7DC" />
      <rect x="6" y="7" width="32" height="38" rx="10" fill="#232227" />
      <rect
        x="9.5"
        y="10.5"
        width="25"
        height="31"
        rx="7"
        fill={paired ? "#A63D63" : "#454349"}
        style={{ transition: "fill .4s" }}
      />
      <circle cx="40" cy="20" r="2" fill="#D9D7DC" />
    </svg>
  );
}

const WATCH_FEATURES = [
  "Heart rate & zones",
  "HRV + recovery score",
  "Sleep stages",
  "Steps, rings & auto-detect",
  "Live workout mirroring",
];

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [saved, setSaved] = useState(false);

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [showPairHelp, setShowPairHelp] = useState(false);
  const [unpairing, setUnpairing] = useState(false);

  const [showPin, setShowPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const [strava, setStrava] = useState<{ connected: boolean; athleteName?: string } | null>(null);
  const [stravaSyncing, setStravaSyncing] = useState(false);

  const loadDevices = useCallback(() => {
    fetch("/api/health/devices")
      .then((r) => (r.ok ? r.json() : { devices: [] }))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    fetchServerSettings().then(setSettings);
    loadDevices();
    fetch("/api/strava/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStrava)
      .catch(() => setStrava(null));
  }, [loadDevices]);

  const update = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    await saveSettingsToServer(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  // The watch (or any wearable-shaped session) drives the pairing card.
  const watch =
    devices?.find(
      (d) =>
        (d.deviceType ?? "").toLowerCase().includes("watch") ||
        (d.platform ?? "").toLowerCase().includes("watch")
    ) ?? devices?.[0] ?? null;
  const paired = Boolean(watch);

  const unpair = async () => {
    if (!watch) return;
    setUnpairing(true);
    try {
      const res = await fetch("/api/health/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: watch.id }),
      });
      if (res.ok) {
        toast.success(`${watch.deviceLabel} unpaired`);
        loadDevices();
      } else {
        toast.error("Couldn't unpair");
      }
    } finally {
      setUnpairing(false);
    }
  };

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
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="micro-label">Connections &amp; app</p>
          <h1
            className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Settings
          </h1>
        </div>
        {saved && (
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-[#5E9B72]">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      {/* Watch pairing card */}
      <div
        className="mt-[18px] flex items-center gap-3.5 rounded-[16px] border border-border p-4 transition-colors duration-300"
        style={{ background: paired ? "#F0F7F1" : "#FAF9FA" }}
      >
        <WatchGlyph paired={paired} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground">
            {watch ? watch.deviceLabel : "Apple Watch"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {watch
              ? `Connected · last seen ${relativeTime(watch.lastSeenAt)}`
              : "Not connected"}
          </p>
        </div>
        {paired ? (
          <button
            onClick={unpair}
            disabled={unpairing}
            className="rounded-[8px] border border-border bg-card px-3.5 py-2 text-xs font-semibold text-secondary-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {unpairing ? "…" : "Unpair"}
          </button>
        ) : (
          <button
            onClick={() => setShowPairHelp((v) => !v)}
            className="rounded-[8px] bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pair
          </button>
        )}
      </div>
      {showPairHelp && !paired && (
        <div className="mt-2 rounded-[12px] border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Open Pitaya on the watch and sign in with your PIN — it appears here
          the moment it connects. A one-tap pairing code ships with the
          Devices build.
        </div>
      )}

      {/* Feature list — 1px-gap grid, state text driven by the connection */}
      <div className="mt-3 grid gap-px overflow-hidden rounded-[14px] border border-border bg-border">
        {WATCH_FEATURES.map((label) => (
          <div
            key={label}
            className="flex items-center justify-between bg-card px-3.5 py-3"
          >
            <span className="text-[12.5px] text-foreground/85">{label}</span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: paired ? "#5E9B72" : "#96949B" }}
            >
              {paired ? "ON" : "off"}
            </span>
          </div>
        ))}
      </div>

      {/* DATA */}
      <div className="mt-3 overflow-hidden rounded-[16px] bg-card shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">CSV import</p>
            <p className="mt-px text-[11px] text-muted-foreground">
              bring history from the old app
            </p>
          </div>
          <Link
            href="/settings/import"
            className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Choose file
          </Link>
        </div>
        {/* Export data — added 2026-08-26. NOTE: the design file's DATA card
            has two rows; the app already added Strava and this makes four.
            Deliberate deviation, surfaced to Michael rather than shipped
            silently (CLAUDE.md port gate, rule 3). */}
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Export data
            </p>
            <p className="mt-px text-[11px] text-muted-foreground">
              JSON + CSV — health &amp; measurements
            </p>
          </div>
          <Link
            href="/settings/export"
            className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Download
          </Link>
        </div>
        {/* Claude connector (MCP) — added 2026-08-29; same deliberate
            DATA-card deviation as the rows above. */}
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Claude connector
            </p>
            <p className="mt-px text-[11px] text-muted-foreground">
              your Claude account, reading &amp; writing Pitaya
            </p>
          </div>
          <Link
            href="/settings/claude"
            className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Connect
          </Link>
        </div>
        {/* Notifications — added 2026-08-28 with the training senders; same
            deliberate DATA-card deviation as the export row above. */}
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Notifications
            </p>
            <p className="mt-px text-[11px] text-muted-foreground">
              what gets sent, and when
            </p>
          </div>
          <Link
            href="/settings/notifications"
            className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Configure
          </Link>
        </div>
        <div className="flex items-center justify-between border-b border-muted px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Weekly PDF report
            </p>
            <p className="mt-px text-[11px] text-muted-foreground">
              Sunday Report, print-clean
            </p>
          </div>
          <button
            onClick={() =>
              toast("Sunday Report is on the bench — PDF export ships next.")
            }
            className="rounded-[8px] bg-primary px-3.5 py-[7px] text-xs font-semibold text-primary-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Export
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Strava</p>
            <p className="mt-px text-[11px] text-muted-foreground">
              {strava?.connected
                ? `Connected${strava.athleteName ? ` · ${strava.athleteName}` : ""}`
                : "GPS source until the watch takes over"}
            </p>
          </div>
          {strava?.connected ? (
            <button
              onClick={syncStrava}
              disabled={stravaSyncing}
              className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stravaSyncing ? "…" : "Sync"}
            </button>
          ) : (
            <a
              href="/api/strava/auth"
              className="rounded-[8px] border border-[#D9D7DC] px-3.5 py-[7px] text-xs font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Connect
            </a>
          )}
        </div>
      </div>

      {/* APP */}
      <p className="micro-label mb-2 mt-[18px]">App</p>
      <div className="grid gap-px overflow-hidden rounded-[14px] border border-border bg-border">
        <button
          onClick={() => setShowPin((v) => !v)}
          className="flex items-center justify-between bg-card px-3.5 py-3 text-left"
        >
          <span className="text-[12.5px] text-foreground/85">PIN lock</span>
          <span className="text-xs font-semibold text-foreground">
            On · 4-digit
          </span>
        </button>
        {showPin && (
          <div className="space-y-2 bg-card px-3.5 py-3">
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
              {pinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
            </Button>
          </div>
        )}
        <button
          onClick={() =>
            update({
              units: settings.units === "metric" ? "imperial" : "metric",
            })
          }
          className="flex items-center justify-between bg-card px-3.5 py-3 text-left"
        >
          <span className="text-[12.5px] text-foreground/85">Units</span>
          <span className="text-xs font-semibold text-foreground">
            {settings.units === "metric" ? "kg · cm" : "lb · in"}
          </span>
        </button>
        <div className="flex items-center justify-between bg-card px-3.5 py-3">
          <span className="text-[12.5px] text-foreground/85">Appearance</span>
          <span className="text-xs font-semibold text-foreground">
            Day{" "}
            <span className="font-medium text-muted-foreground">
              · Night — next build
            </span>
          </span>
        </div>
        <button
          onClick={() =>
            update({
              aiLanguage: settings.aiLanguage === "english" ? "spanish" : "english",
            })
          }
          className="flex items-center justify-between bg-card px-3.5 py-3 text-left"
        >
          <span className="text-[12.5px] text-foreground/85">Chat language</span>
          <span className="text-xs font-semibold text-foreground">
            {settings.aiLanguage === "english" ? "English" : "Español"}
          </span>
        </button>
      </div>

      {/* SYSTEM — AI connection + spend (kept after the prod outage) */}
      <p className="micro-label mb-2 mt-[18px]">System</p>
      <AIStatusCard />
    </div>
  );
}
