"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowUpRight,
  CheckSquare,
  CalendarClock,
  Heart,
  LayoutDashboard,
  Landmark,
  Receipt,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceQuickCapture } from "@/components/finance-quick-capture";
import { useCachedFetch } from "@/lib/cache";

interface HealthSummary {
  totalCalories: number;
  totalProtein: number;
  workoutCount: number;
  workoutMinutes: number;
  waterMl: number;
}

interface FinanceSummary {
  overview: {
    income: number;
    expenses: number;
    savings: number;
    pendingReviews: number;
  };
  upcomingPayments: Array<{
    id: string;
    description: string;
    amount: number | null;
    dueDate: string;
    merchantName: string | null;
  }>;
  topMerchants: Array<{
    id: string;
    name: string;
    totalSpent: number;
    shareOfSpend: number;
  }>;
  possibleSavings: Array<{
    category: string;
    percentUsed: number;
    remaining: number;
  }>;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const healthUrl = useMemo(() => "/api/health/summary", []);
  const financeUrl = useMemo(() => "/api/finance/summary", []);
  const { data: health, initialLoading: healthLoading } = useCachedFetch<HealthSummary>(healthUrl, {
    ttl: 60_000,
  });
  const { data: finance, initialLoading: financeLoading, refresh } = useCachedFetch<FinanceSummary>(
    financeUrl,
    { ttl: 60_000 }
  );

  return (
    <div className="px-4 pt-10 pb-36 lg:pt-12 lg:pb-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dashboard</p>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 mt-2">
            <LayoutDashboard className="h-7 w-7 text-cyan-400" />
            Personal Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Cross-check health momentum, pending finance reviews, upcoming bills, and quick-capture inputs in one place.
          </p>
        </div>

        <div className="lg:w-[32rem]">
          <FinanceQuickCapture onSaved={refresh} compact />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardCard
            icon={Heart}
            color="text-rose-400"
            label="Calories Today"
            value={healthLoading ? null : `${Math.round(health?.totalCalories || 0)} kcal`}
            hint={healthLoading ? "" : `${Math.round(health?.totalProtein || 0)}g protein`}
            href="/health"
          />
          <DashboardCard
            icon={TrendingUp}
            color="text-blue-400"
            label="Workout Minutes"
            value={healthLoading ? null : `${Math.round(health?.workoutMinutes || 0)} min`}
            hint={healthLoading ? "" : `${health?.workoutCount || 0} workout(s)`}
            href="/trends"
          />
          <DashboardCard
            icon={Wallet}
            color="text-emerald-400"
            label="Monthly Savings"
            value={financeLoading ? null : formatCOP(finance?.overview.savings || 0)}
            hint={financeLoading ? "" : `${formatCOP(finance?.overview.expenses || 0)} spent`}
            href="/finances"
          />
          <DashboardCard
            icon={Receipt}
            color="text-amber-400"
            label="Pending Reviews"
            value={financeLoading ? null : String(finance?.overview.pendingReviews || 0)}
            hint="Inbox triage"
            href="/finances/inbox"
          />
        </div>

        <Card className="border-border/40">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Workspace Shortcuts</p>
                <p className="text-xs text-muted-foreground mt-1">Jump into deeper analytics and capture flows.</p>
              </div>
              <Target className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ShortcutCard href="/finances/inbox" icon={Receipt} label="Finance Inbox" />
              <ShortcutCard href="/finances/transactions" icon={Wallet} label="Transactions" />
              <ShortcutCard href="/finances/obligations" icon={CalendarClock} label="Obligations" />
              <ShortcutCard href="/finances/pockets" icon={Landmark} label="Pockets" />
              <ShortcutCard href="/finances/merchants" icon={TrendingUp} label="Merchants" />
              <ShortcutCard href="/finances/reports" icon={Target} label="Reports" />
              <ShortcutCard href="/health" icon={Heart} label="Health" />
              <ShortcutCard href="/todos" icon={CheckSquare} label="Todos" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <Panel title="Upcoming Payments" href="/finances/inbox">
          {financeLoading ? (
            <PanelSkeleton />
          ) : finance?.upcomingPayments?.length ? (
            <div className="space-y-3">
              {finance.upcomingPayments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{payment.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.dueDate).toLocaleDateString()} {payment.merchantName ? `· ${payment.merchantName}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {payment.amount ? formatCOP(payment.amount) : "TBD"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel text="No upcoming payments detected yet." />
          )}
        </Panel>

        <Panel title="Top Merchants" href="/finances/merchants">
          {financeLoading ? (
            <PanelSkeleton />
          ) : finance?.topMerchants?.length ? (
            <div className="space-y-3">
              {finance.topMerchants.slice(0, 5).map((merchant) => (
                <div key={merchant.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">{merchant.name}</p>
                    <p className="text-sm font-semibold">{formatCOP(merchant.totalSpent)}</p>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary/50">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500/70"
                      style={{ width: `${Math.min(merchant.shareOfSpend, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel text="Merchant trends will appear after more finance data arrives." />
          )}
        </Panel>

        <Panel title="Budget Pressure" href="/finances/reports">
          {financeLoading ? (
            <PanelSkeleton />
          ) : finance?.possibleSavings?.length ? (
            <div className="space-y-3">
              {finance.possibleSavings.slice(0, 4).map((item) => (
                <div key={item.category} className="rounded-2xl border border-border/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium capitalize">{item.category.replace(/_/g, " ")}</p>
                    <p className="text-xs text-amber-400 font-medium">{item.percentUsed}% used</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Remaining room: {formatCOP(item.remaining)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel text="No budget pressure detected right now." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function DashboardCard({
  icon: Icon,
  color,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof LayoutDashboard;
  color: string;
  label: string;
  value: string | null;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full hover:bg-accent/30 transition-colors">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          {value === null ? <Skeleton className="h-7 w-24" /> : <p className="text-2xl font-bold">{value}</p>}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{hint}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ShortcutCard({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-border/40 bg-secondary/20 px-4 py-3 hover:bg-secondary/35 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          <Link href={href} className="text-xs text-cyan-400 hover:underline">
            Open
          </Link>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
