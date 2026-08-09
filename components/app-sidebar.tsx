"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckSquare,
  Heart,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, color: "text-cyan-400" },
  { label: "Health", href: "/health", icon: Heart, color: "text-rose-400" },
  { label: "Trends", href: "/trends", icon: TrendingUp, color: "text-blue-400" },
  { label: "Todos", href: "/todos", icon: CheckSquare, color: "text-green-400" },
  { label: "Finances", href: "/finances", icon: Wallet, color: "text-emerald-400" },
  { label: "Settings", href: "/settings", icon: Settings, color: "text-purple-400" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:border-r lg:border-border/40 lg:bg-sidebar/70 lg:backdrop-blur-xl">
      <div className="px-6 py-6 border-b border-border/30">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Personal OS</p>
        <h1 className="text-2xl font-semibold mt-2">Desktop Workspace</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Finance, health, and planning in one view.
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors",
                isActive ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? item.color : "text-muted-foreground")} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
