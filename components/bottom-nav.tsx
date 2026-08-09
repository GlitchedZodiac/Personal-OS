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
import { demoText } from "@/lib/demo-client";

const navItems = [
  {
    label: demoText("Hub", "Centro"),
    href: "/dashboard",
    icon: LayoutDashboard,
    activeColor: "text-cyan-400",
    activeBg: "bg-cyan-500/10",
  },
  {
    label: demoText("Health", "Salud"),
    href: "/health",
    icon: Heart,
    activeColor: "text-rose-400",
    activeBg: "bg-rose-500/10",
  },
  {
    label: demoText("Trends", "Tendencias"),
    href: "/trends",
    icon: TrendingUp,
    activeColor: "text-blue-400",
    activeBg: "bg-blue-500/10",
  },
  {
    label: demoText("Todos", "Tareas"),
    href: "/todos",
    icon: CheckSquare,
    activeColor: "text-green-400",
    activeBg: "bg-green-500/10",
  },
  {
    label: demoText("Finances", "Finanzas"),
    href: "/finances",
    icon: Wallet,
    activeColor: "text-emerald-400",
    activeBg: "bg-emerald-500/10",
  },
  {
    label: demoText("Settings", "Ajustes"),
    href: "/settings",
    icon: Settings,
    activeColor: "text-purple-400",
    activeBg: "bg-purple-500/10",
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 safe-area-bottom lg:hidden">
      <div className="grid grid-cols-6 h-16 max-w-3xl mx-auto px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all duration-200 tap-scale",
                isActive ? item.activeColor : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-300",
                  isActive && item.activeBg
                )}
              >
                <item.icon
                  className={cn("h-4 w-4 transition-all duration-200", isActive && "scale-110")}
                  fill={isActive ? "currentColor" : "none"}
                  strokeWidth={isActive ? 1.5 : 2}
                />
              </div>
              <span className={cn("text-[9px] font-medium transition-all", isActive && "font-semibold")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
