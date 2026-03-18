"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";

export default function ActionsPage() {
  return (
    <div className="space-y-4 px-4 pt-12 pb-4 lg:space-y-6 lg:px-0 lg:pt-10">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">App Actions</h1>
        <p className="text-sm text-muted-foreground">Coming in Phase 3+</p>
      </div>
      <Card className="max-w-3xl">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Integrations Coming Soon</p>
          <p className="text-xs mt-2">
            Strava sync, LinkedIn/Facebook posting, shopping tracker, and
            Bancolombia expense tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
