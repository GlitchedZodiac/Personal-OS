"use client";

// The kit, every piece in every state (lane C, 2026-10). Behind the PIN
// gate like every tab route; nothing links here but Settings → System. It
// is the reference the screens converge onto and the page the design
// screenshots are taken from — if a piece looks wrong here, it is wrong
// everywhere. Tokens: app/globals.css · standard: docs/design/pitaya-tokens.md.

import { useState } from "react";
import { toast } from "sonner";
import { TrainIcon } from "@/components/pitaya-icons";
import { Button } from "@/components/ui/button";
import { ChartFrame, HairlineGrid } from "@/components/ui/chart-frame";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { Delta, MetricRow, MetricTile } from "@/components/ui/metric-tile";
import { Section } from "@/components/ui/section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { APPEARANCES, APPEARANCE_LABEL, normalizeAppearance, type Appearance } from "@/lib/appearance";
import { getSettings, saveSettingsToServer } from "@/lib/settings";
import { useBackTo } from "@/lib/nav-stack";

const SWATCHES: { name: string; cls: string; text?: boolean }[] = [
  { name: "bg", cls: "bg-bg" },
  { name: "card", cls: "bg-card" },
  { name: "card-2", cls: "bg-card-2" },
  { name: "rule-2", cls: "bg-rule-2" },
  { name: "ink", cls: "bg-ink", text: true },
  { name: "ink-2", cls: "bg-ink-2", text: true },
  { name: "ink-3", cls: "bg-ink-3" },
  { name: "primary", cls: "bg-primary", text: true },
  { name: "primary-deep", cls: "bg-primary-deep", text: true },
  { name: "accent-bright", cls: "bg-accent-bright" },
  { name: "tint", cls: "bg-tint" },
  { name: "edge", cls: "bg-edge" },
  { name: "success", cls: "bg-success" },
  { name: "success-ink", cls: "bg-success-ink", text: true },
  { name: "warning", cls: "bg-warning" },
  { name: "warning-ink", cls: "bg-warning-ink", text: true },
  { name: "danger", cls: "bg-danger" },
  { name: "danger-ink", cls: "bg-danger-ink", text: true },
  { name: "slate", cls: "bg-slate" },
  { name: "dark-ink", cls: "bg-dark-ink" },
  { name: "band", cls: "bg-band" },
  { name: "focus-ring", cls: "bg-focus-ring" },
];

const SEQ = ["bg-chart-seq-1", "bg-chart-seq-2", "bg-chart-seq-3", "bg-chart-seq-4", "bg-chart-seq-5"];
const CAT = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

const TYPE: { cls: string; name: string; spec: string; sample: string }[] = [
  { cls: "font-display text-hero font-bold tabular-nums", name: "hero", spec: "44/48 · Familjen 700", sample: "1,842" },
  { cls: "font-display text-display font-bold", name: "display", spec: "26/30 · Familjen 700", sample: "Train" },
  { cls: "font-display text-title font-semibold", name: "title", spec: "19/24 · Familjen 600", sample: "This week" },
  { cls: "text-body", name: "body", spec: "15/22 · Instrument 400", sample: "Raise the bell when every set hits the top of the range." },
  { cls: "text-ui font-medium", name: "ui", spec: "13/18 · Instrument 500", sample: "Kettlebell Swing · 5 × 15" },
  { cls: "text-caption text-ink-2", name: "caption", spec: "12/16 · Instrument 400 · the floor for meaning", sample: "Mon 6:45 AM · 38 min" },
  { cls: "micro-label", name: "micro", spec: "11/14 · 600 · .14em · labels and axis ticks only", sample: "Volume · 8 weeks" },
];

const BARS = [38, 52, 47, 66, 58, 81, 72, 90];

export default function DesignKitPage() {
  const goBack = useBackTo("/settings");
  // Client-only: this page renders behind the PIN gate, never on the server.
  const [appearance, setAppearance] = useState<Appearance>(() => normalizeAppearance(getSettings().appearance));
  const [range, setRange] = useState("30d");
  const [switches, setSwitches] = useState({ report: true, training: false });
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState("kg");

  const choose = (a: Appearance) => {
    setAppearance(a);
    void saveSettingsToServer({ appearance: a });
  };

  return (
    <div className="pb-dock px-4 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={goBack}>
        ‹ Settings
      </Button>
      <p className="micro-label">Settings · design system</p>
      <h1 className="mt-1 font-display text-display font-bold text-ink">The kit</h1>
      <p className="mt-1 text-caption text-ink-2">
        Every piece the screens are built from, in every state. Tokens live in app/globals.css.
      </p>

      <Section title="Appearance" className="mt-6">
        <ChipRow>
          {APPEARANCES.map((a) => (
            <Chip key={a} selected={appearance === a} onClick={() => choose(a)}>
              {APPEARANCE_LABEL[a]}
            </Chip>
          ))}
        </ChipRow>
      </Section>

      <Section title="Colour roles">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {SWATCHES.map((s) => (
            <div key={s.name} className="min-w-0">
              <div className={`h-10 rounded-control border border-rule-2 ${s.cls}`} />
              <p className="mt-1 truncate text-caption text-ink-2">
                {s.name}
                {s.text ? " · text" : ""}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-caption text-ink-2">Sequential ramp</p>
            <div className="mt-1 flex h-4 overflow-hidden rounded-full">
              {SEQ.map((c) => (
                <div key={c} className={`flex-1 ${c}`} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-caption text-ink-2">Categorical</p>
            <div className="mt-1 flex h-4 gap-1">
              {CAT.map((c) => (
                <div key={c} className={`flex-1 rounded-full ${c}`} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Type · eight steps, floor 12 px">
        <div className="space-y-3 rounded-card border border-rule-2 bg-card p-4 shadow-card">
          {TYPE.map((t) => (
            <div key={t.name}>
              <p className="text-caption text-ink-2">
                {t.name} · {t.spec}
              </p>
              <p className={`${t.cls} text-ink`}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Log set</Button>
          <Button variant="ink">Start live workout</Button>
          <Button variant="secondary">View activities</Button>
          <Button variant="outline">Routines</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Unpair</Button>
          <Button variant="link">All records</Button>
          <Button disabled>Saving…</Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="lg">Large</Button>
          <Button>Default</Button>
          <Button size="sm">Small</Button>
          <Button size="xs">Extra small</Button>
        </div>
      </Section>

      <Section title="Chips">
        <ChipRow>
          {["7d", "30d", "90d", "6mo", "All"].map((r) => (
            <Chip key={r} selected={range === r} onClick={() => setRange(r)}>
              {r}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow className="mt-2">
          <Chip selected count={60}>
            All
          </Chip>
          <Chip count={18}>Gym</Chip>
          <Chip count={21}>Outdoor</Chip>
          <Chip size="sm">Rope</Chip>
          <Chip size="sm" disabled>
            Swim
          </Chip>
        </ChipRow>
      </Section>

      <Section title="Fields">
        <div className="space-y-3 rounded-card border border-rule-2 bg-card p-4 shadow-card">
          <Field label="Routine name" hint="Shown on the watch.">
            <Input placeholder="KB Block A" defaultValue="KB Block A" />
          </Field>
          <Field label="Target weight" error="Between 4 and 48 kg.">
            <Input inputMode="decimal" defaultValue="52" aria-invalid />
          </Field>
          <Field label="Units">
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg · cm</SelectItem>
                <SelectItem value="lb">lb · in</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Note">
            <Textarea placeholder="How did it feel?" />
          </Field>
        </div>
      </Section>

      <Section title="List rows">
        <ListGroup>
          <ListRow title="Units" value="kg · cm" onClick={() => setUnit(unit === "kg" ? "lb" : "kg")} />
          <ListRow
            title="Weekly report ready"
            info="One push on Sunday morning when the report has written itself."
            control={
              <Switch
                checked={switches.report}
                onCheckedChange={(v) => setSwitches((s) => ({ ...s, report: v }))}
                aria-label="Weekly report ready"
              />
            }
          />
          <ListRow
            title="Training day"
            sub="The morning of a planned session"
            control={
              <Switch
                checked={switches.training}
                onCheckedChange={(v) => setSwitches((s) => ({ ...s, training: v }))}
                aria-label="Training day"
              />
            }
          />
          <ListRow title="Heart rate & zones" sub="Read-only — follows the watch" value={<Status tone="success">On</Status>} />
          <ListRow title="Apple Health" value={<Status tone="warning">2 days behind</Status>} />
          <ListRow title="Notifications" sub="9 of 11 on" href="/settings/notifications" />
          <ListRow title="Unpair the watch" tone="danger" onClick={() => toast("Not in the kit page")} chevron={false} />
        </ListGroup>
        <Disclosure label="What is a list row?" className="mt-3 px-1">
          One line per thing: a title, an optional single-line sub, and one trailing value, control or chevron.
          The explanation lives behind the “?”.
        </Disclosure>
      </Section>

      <Section title="Metric tiles">
        <div className="rounded-card border border-rule-2 bg-card p-4 shadow-card">
          <MetricTile
            size="lg"
            label="Today · kcal in"
            value="1,842"
            unit="of 2,300"
            delta={<Delta value={-458} decimals={0} unit="kcal" good="none" suffix="to go" />}
          />
          <MetricRow className="mt-4 border-t border-rule pt-4">
            <MetricTile label="Sessions" value="6" delta={<Delta value={2} decimals={0} good="up" suffix="vs last wk" />} />
            <MetricTile label="Volume" value="18.2" unit="t" delta={<Delta value={3.1} good="up" unit="t" />} />
            <MetricTile label="Weight" value="89.2" unit="kg" delta={<Delta value={-0.3} good="down" unit="kg" />} />
            <MetricTile label="Body fat" value="14.2" unit="%" delta={<Delta value={0.2} good="down" unit="pt" />} />
          </MetricRow>
        </div>
      </Section>

      <Section title="Chart frame">
        <ChartFrame
          title="Volume · 8 weeks"
          meta={<Delta value={38} decimals={0} unit="%" good="up" suffix="vs last" />}
          controls={
            <ChipRow>
              {["8w", "6mo", "All"].map((r) => (
                <Chip key={r} size="sm" selected={r === "8w"}>
                  {r}
                </Chip>
              ))}
            </ChipRow>
          }
          footer={
            <>
              <span>W35</span>
              <span>W42</span>
            </>
          }
        >
          <HairlineGrid />
          <div className="relative flex h-full items-end gap-1.5">
            {BARS.map((v, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-[4px] ${SEQ[Math.min(4, Math.floor((v / 100) * 5))]}`}
                style={{ height: `${v}%` }}
              />
            ))}
          </div>
        </ChartFrame>
        <ChartFrame className="mt-3" title="Jump rope · 8 weeks" empty="No rope sessions in these eight weeks." />
      </Section>

      <Section title="Empty state">
        <div className="rounded-card border border-rule-2 bg-card shadow-card">
          <EmptyState
            icon={<TrainIcon />}
            title="No sessions this week"
            body="Start one from the watch, or tell the chat what you did."
            action={<Button size="sm">Start live workout</Button>}
          />
        </div>
      </Section>

      <Section
        title="Loading"
        action={
          <Button variant="link" size="xs" onClick={() => setLoading((v) => !v)}>
            {loading ? "Show content" : "Show skeleton"}
          </Button>
        }
      >
        <div className="rounded-card border border-rule-2 bg-card p-4 shadow-card">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <div className="fade-up">
              <MetricTile label="This week" value="6" unit="sessions" />
              <p className="mt-2 text-caption text-ink-2">Skeleton → content in 150 ms.</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Toast · sheet">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success("Saved · synced to Pitaya")}>
            Success
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.warning("Offline — queued to sync")}>
            Warning
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.error("Couldn’t save — try again")}>
            Error
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast("Reminder set for 6 pm")}>
            Plain
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="sm">
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="px-4 pb-10">
              <SheetHeader className="px-0">
                <SheetTitle className="font-display text-title text-ink">All records</SheetTitle>
                <SheetDescription className="text-caption text-ink-2">
                  Slides up in 220 ms, leaves in 150.
                </SheetDescription>
              </SheetHeader>
              <ListGroup>
                <ListRow title="Kettlebell Swing" value="28 kg" />
                <ListRow title="Goblet Squat" value="24 kg" />
                <ListRow title="Clean and Press" value="20 kg" />
              </ListGroup>
            </SheetContent>
          </Sheet>
        </div>
      </Section>
    </div>
  );
}
