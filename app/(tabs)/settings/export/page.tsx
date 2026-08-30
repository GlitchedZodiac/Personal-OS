"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HealthExportCard } from "@/components/health-export-card";
import {
  HEALTH_CSV_DATASETS,
  HEALTH_CSV_KEYS,
  type HealthCsvDatasetKey,
} from "@/lib/health-csv";

// Sibling of /settings/import and deliberately in ITS visual register (shadcn
// cards, lucide icons) rather than the designed /settings screen — that page is
// a verbatim port of docs/design/pitaya-app.dc.html and this page has no design
// source yet. Logged in docs/state.md as a pending stage.

const RANGES = [
  { value: "all", label: "All time" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "custom", label: "Custom" },
];

export default function ExportDataPage() {
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<HealthCsvDatasetKey | null>(null);
  const [gpxBusy, setGpxBusy] = useState(false);

  const custom = range === "custom";
  const effectiveRange = custom ? "all" : range;

  /** from/to for the GPX endpoint: custom dates pass through, day-count
      ranges become a from date, "all" sends nothing. */
  function gpxRangeParams() {
    const params = new URLSearchParams();
    if (custom) {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return params;
    }
    const days = Number(range);
    if (Number.isFinite(days) && days > 0) {
      const start = new Date(Date.now() - days * 86_400_000);
      params.set("from", start.toISOString().slice(0, 10));
    }
    return params;
  }

  async function downloadGpx() {
    try {
      setGpxBusy(true);
      const res = await fetch(`/api/health/export/gpx?${gpxRangeParams().toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const trackCount = res.headers.get("X-Track-Count");
      const named = /filename="([^"]+)"/.exec(
        res.headers.get("Content-Disposition") ?? ""
      )?.[1];
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = named ?? "pitaya-gps-tracks.gpx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success(
        trackCount ? `${trackCount} GPS track(s) downloaded` : "GPX downloaded"
      );
    } catch (error) {
      console.error("GPX export failed:", error);
      toast.error("Failed to export GPX");
    } finally {
      setGpxBusy(false);
    }
  }

  function buildParams(extra: Record<string, string> = {}) {
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
    const params = new URLSearchParams({ range: effectiveRange, timeZone, ...extra });
    if (custom && from) params.set("from", from);
    if (custom && to) params.set("to", to);
    return params;
  }

  async function downloadCsv(key: HealthCsvDatasetKey) {
    try {
      setBusy(key);
      const res = await fetch(
        `/api/health/export/csv?${buildParams({ dataset: key }).toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rowCount = res.headers.get("X-Row-Count");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      // Same pattern as the one wired-up export in the app
      // (app/(tabs)/spirit/settings/page.tsx doExport).
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = named ?? `${key}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);

      toast.success(
        rowCount
          ? `${Number(rowCount).toLocaleString()} ${HEALTH_CSV_DATASETS[key].label.toLowerCase()} rows downloaded`
          : `${HEALTH_CSV_DATASETS[key].label} downloaded`
      );
    } catch (error) {
      console.error("CSV export failed:", error);
      toast.error(`Failed to export ${HEALTH_CSV_DATASETS[key].label}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-4 pt-12 pb-8 lg:space-y-6 lg:px-0 lg:pt-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Export Data</h1>
          <p className="text-xs text-muted-foreground">
            Your health and measurement history, as JSON or spreadsheets
          </p>
        </div>
      </div>

      {/* Range applies to both halves below */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={range} onValueChange={setRange}>
            <TabsList className="grid w-full grid-cols-4">
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {custom && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
                aria-label="To date"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <HealthExportCard
        range={effectiveRange}
        from={custom ? from : undefined}
        to={custom ? to : undefined}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapIcon className="h-4 w-4" />
            GPS tracks (GPX)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Every walk, run and hike in range as one GPX file — the standard
            track format any mapping tool opens. Watch recordings carry
            elevation and timestamps.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={gpxBusy}
            onClick={downloadGpx}
          >
            {gpxBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            GPX
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            Spreadsheets (CSV)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {HEALTH_CSV_KEYS.map((key) => {
            const dataset = HEALTH_CSV_DATASETS[key];
            return (
              <div
                key={key}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{dataset.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {dataset.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => downloadCsv(key)}
                >
                  {busy === key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  CSV
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-muted">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">About these files</p>
          <p>
            All values are metric — kilograms, centimetres, millilitres. Imperial
            is a display preference only; converting here would lose precision.
          </p>
          <p>
            CSVs are UTF-8 with a byte-order mark and CRLF line endings, so Excel
            and Google Sheets both read accents correctly. The{" "}
            <span className="font-medium">date</span> column is your local day.
          </p>
          <p>
            Files download one at a time — iOS Safari only accepts the first of a
            batch, so there is no &ldquo;download all&rdquo;.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
