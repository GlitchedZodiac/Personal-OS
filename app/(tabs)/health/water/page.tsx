"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Droplets, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/confirm-delete";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getTimeZoneOffsetMinutesForDateString,
} from "@/lib/timezone";

type WaterLog = {
  id: string;
  loggedAt: string;
  amountMl: number;
};

type WaterResponse = {
  logs: WaterLog[];
  manualMl: number;
  inferredFluidMl: number;
  workoutAdjustmentMl: number;
  targetMl: number;
  totalMl: number;
  glasses: number;
};

export default function WaterLogPage() {
  const initialTimeZone = getSettings().timeZone;
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [dateFilter, setDateFilter] = useState(
    getDateStringInTimeZone(new Date(), initialTimeZone)
  );
  const tzOffsetMinutes = useMemo(
    () => getTimeZoneOffsetMinutesForDateString(dateFilter, timeZone),
    [dateFilter, timeZone]
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<WaterLog | null>(null);
  const [newAmount, setNewAmount] = useState("250");
  const [newLoggedAt, setNewLoggedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [editAmount, setEditAmount] = useState("");
  const [editLoggedAt, setEditLoggedAt] = useState("");

  useEffect(() => {
    fetchServerSettings().then((s) => {
      setTimeZone(s.timeZone);
      setDateFilter(getDateStringInTimeZone(new Date(), s.timeZone));
    });
  }, []);

  const waterUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date", dateFilter);
    params.set("tzOffsetMinutes", String(tzOffsetMinutes));
    params.set("timeZone", timeZone);
    return `/api/health/water?${params.toString()}`;
  }, [dateFilter, tzOffsetMinutes, timeZone]);

  const { data, initialLoading, refresh } = useCachedFetch<WaterResponse>(waterUrl, { ttl: 30_000 });
  const logs = data?.logs ?? [];

  const addWaterEntry = async () => {
    const amountMl = Number.parseInt(newAmount, 10);
    if (!Number.isFinite(amountMl) || amountMl <= 0) {
      toast.error("Enter a valid amount in ml");
      return;
    }
    try {
      const res = await fetch("/api/health/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMl,
          loggedAt: newLoggedAt ? new Date(newLoggedAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add hydration entry");
        return;
      }
      setShowAddDialog(false);
      setNewAmount("250");
      setNewLoggedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      invalidateHealthCache();
      refresh();
      toast.success("Hydration entry added");
    } catch {
      toast.error("Failed to add hydration entry");
    }
  };

  const startEdit = (entry: WaterLog) => {
    setEditEntry(entry);
    setEditAmount(String(entry.amountMl));
    setEditLoggedAt(format(new Date(entry.loggedAt), "yyyy-MM-dd'T'HH:mm"));
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    const amountMl = Number.parseInt(editAmount, 10);
    if (!Number.isFinite(amountMl) || amountMl <= 0) {
      toast.error("Enter a valid amount in ml");
      return;
    }
    try {
      const res = await fetch(`/api/health/water?id=${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMl,
          loggedAt: editLoggedAt ? new Date(editLoggedAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to update hydration entry");
        return;
      }
      setEditEntry(null);
      invalidateHealthCache();
      refresh();
      toast.success("Hydration entry updated");
    } catch {
      toast.error("Failed to update hydration entry");
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/health/water?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete hydration entry");
        return;
      }
      invalidateHealthCache();
      refresh();
      toast.success("Hydration entry deleted");
    } catch {
      toast.error("Failed to delete hydration entry");
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
          <h1 className="text-xl font-bold">Hydration Log</h1>
          <p className="text-xs text-muted-foreground">Edit amount and date/time for each entry</p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={() =>
                setDateFilter(getDateStringInTimeZone(new Date(), timeZone))
              }
              className="h-9"
            >
              Today
            </Button>
          </div>

          {initialLoading ? (
            <p className="text-xs text-muted-foreground">Loading hydration data...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
                <p className="text-muted-foreground">Total Fluids</p>
                <p className="text-lg font-semibold">{Math.round(data?.totalMl ?? 0)} ml</p>
                <p className="text-[10px] text-muted-foreground">
                  Target {Math.round(data?.targetMl ?? 2500)} ml
                </p>
              </div>
              <div className="rounded-lg border border-border/40 p-2">
                <p className="text-muted-foreground">Breakdown</p>
                <p>Manual: {Math.round(data?.manualMl ?? 0)} ml</p>
                <p>Auto: {Math.round(data?.inferredFluidMl ?? 0)} ml</p>
                <p>Workout adj: +{Math.round(data?.workoutAdjustmentMl ?? 0)} ml</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {initialLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Droplets className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No manual hydration entries for this day.</p>
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-border/40 p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{entry.amountMl} ml</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(entry.loggedAt), "MMM d, yyyy • h:mm a")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDelete
                  onConfirm={() => deleteEntry(entry.id)}
                  itemName="this hydration entry"
                  trigger={
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  }
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Hydration Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (ml)</Label>
              <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={newLoggedAt} onChange={(e) => setNewLoggedAt(e.target.value)} />
            </div>
            <Button className="w-full" onClick={addWaterEntry}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Hydration Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (ml)</Label>
              <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={editLoggedAt} onChange={(e) => setEditLoggedAt(e.target.value)} />
            </div>
            <Button className="w-full" onClick={saveEdit}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
