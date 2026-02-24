"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Play, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";

type Metric = "proteinPct" | "hydrationPct" | "workoutMinutes";
type Comparator = "<" | ">" | "<=" | ">=";
type ActionType = "todo" | "reminder";

type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  metric: Metric;
  comparator: Comparator;
  threshold: number;
  triggerHour: number;
  actionType: ActionType;
  actionTitle: string;
};

type AutomationGetResponse = {
  rules: AutomationRule[];
};

type AutomationRunResponse = {
  dryRun: boolean;
  evaluatedRules: number;
  triggered: Array<{
    ruleId: string;
    ruleName: string;
    metric: string;
    value: number;
    threshold: number;
    actionType: string;
    actionTitle: string;
    created: boolean;
  }>;
  metricSnapshot: {
    proteinPct: number;
    hydrationPct: number;
    workoutMinutes: number;
  };
};

function emptyRule(index: number): AutomationRule {
  return {
    id: `custom-${Date.now()}-${index}`,
    name: "New rule",
    enabled: true,
    metric: "proteinPct",
    comparator: "<",
    threshold: 70,
    triggerHour: 18,
    actionType: "todo",
    actionTitle: "Take action on this health metric",
  };
}

function metricLabel(metric: Metric) {
  if (metric === "proteinPct") return "Protein %";
  if (metric === "hydrationPct") return "Hydration %";
  return "Workout minutes";
}

export default function AutomationsPage() {
  const { data, initialLoading, refresh } =
    useCachedFetch<AutomationGetResponse>("/api/health/automations", { ttl: 60_000 });
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AutomationRunResponse | null>(null);

  useEffect(() => {
    if (data?.rules) {
      setRules(data.rules);
    }
  }, [data]);

  const localDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);
  const localHour = useMemo(() => new Date().getHours(), []);

  const updateRule = (id: string, patch: Partial<AutomationRule>) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/health/automations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!response.ok) throw new Error("save failed");
      const result: AutomationGetResponse = await response.json();
      setRules(result.rules);
      refresh();
      toast.success("Automation rules saved");
    } catch {
      toast.error("Failed to save automation rules");
    } finally {
      setSaving(false);
    }
  };

  const runRules = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const response = await fetch("/api/health/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          date: localDate,
          localHour,
          tzOffsetMinutes,
        }),
      });
      if (!response.ok) throw new Error("run failed");
      const result: AutomationRunResponse = await response.json();
      setLastRun(result);
      if (!dryRun) invalidateHealthCache();
      toast.success(dryRun ? "Automation preview complete" : "Automation rules executed");
    } catch {
      toast.error("Failed to run automation rules");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Automation Rules</h1>
          <p className="text-xs text-muted-foreground">Trigger actions from your daily health metrics</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runRules(true)} disabled={running}>
            <Play className="h-4 w-4 mr-1" />
            Preview Run
          </Button>
          <Button onClick={() => runRules(false)} disabled={running}>
            <Play className="h-4 w-4 mr-1" />
            Run Now
          </Button>
          <Button
            variant="secondary"
            onClick={() => setRules((prev) => [...prev, emptyRule(prev.length)])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Rule
          </Button>
          <Button onClick={saveRules} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            Save Rules
          </Button>
        </CardContent>
      </Card>

      {initialLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading rules...
          </CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No rules configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rule: {rule.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground mb-1">Name</p>
                    <Input
                      value={rule.name}
                      onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Status</p>
                    <Select
                      value={rule.enabled ? "enabled" : "disabled"}
                      onValueChange={(value) => updateRule(rule.id, { enabled: value === "enabled" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Metric</p>
                    <Select
                      value={rule.metric}
                      onValueChange={(value) => updateRule(rule.id, { metric: value as Metric })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proteinPct">Protein %</SelectItem>
                        <SelectItem value="hydrationPct">Hydration %</SelectItem>
                        <SelectItem value="workoutMinutes">Workout minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Comparator</p>
                    <Select
                      value={rule.comparator}
                      onValueChange={(value) =>
                        updateRule(rule.id, { comparator: value as Comparator })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<">{"<"}</SelectItem>
                        <SelectItem value="<=">{"<="}</SelectItem>
                        <SelectItem value=">">{">"}</SelectItem>
                        <SelectItem value=">=">{">="}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Threshold</p>
                    <Input
                      type="number"
                      value={rule.threshold}
                      onChange={(event) =>
                        updateRule(rule.id, {
                          threshold: Number(event.target.value || 0),
                        })
                      }
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Trigger hour</p>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.triggerHour}
                      onChange={(event) =>
                        updateRule(rule.id, {
                          triggerHour: Number(event.target.value || 0),
                        })
                      }
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Action</p>
                    <Select
                      value={rule.actionType}
                      onValueChange={(value) => updateRule(rule.id, { actionType: value as ActionType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">Create todo</SelectItem>
                        <SelectItem value="reminder">Create reminder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground mb-1">Action title</p>
                    <Input
                      value={rule.actionTitle}
                      onChange={(event) =>
                        updateRule(rule.id, { actionTitle: event.target.value })
                      }
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setRules((prev) => prev.filter((item) => item.id !== rule.id))}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {lastRun && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Last Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Evaluated {lastRun.evaluatedRules} rules. Triggered {lastRun.triggered.length}.
            </p>
            <p className="text-xs text-muted-foreground">
              Metrics: Protein {lastRun.metricSnapshot.proteinPct}%, Hydration {lastRun.metricSnapshot.hydrationPct}%, Workout {lastRun.metricSnapshot.workoutMinutes} min.
            </p>
            {lastRun.triggered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules triggered.</p>
            ) : (
              <div className="space-y-1.5">
                {lastRun.triggered.map((item) => (
                  <div key={`${item.ruleId}-${item.actionTitle}`} className="rounded-lg border border-border/40 p-2">
                    <p className="text-sm font-medium">{item.ruleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {metricLabel(item.metric as Metric)} {item.value} vs {item.threshold}
                    </p>
                    <p className="text-xs">
                      {item.actionType}: {item.actionTitle} ({item.created ? "created" : "already exists"})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
