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

// Pitaya: one accent for every tab — berry ink on a pale pink tint
const navItems = [
  { label: demoText("Hub", "Centro"), href: "/dashboard", icon: LayoutDashboard },
  { label: demoText("Health", "Salud"), href: "/health", icon: Heart },
  { label: demoText("Trends", "Tendencias"), href: "/trends", icon: TrendingUp },
  { label: demoText("Todos", "Tareas"), href: "/todos", icon: CheckSquare },
  { label: demoText("Finances", "Finanzas"), href: "/finances", icon: Wallet },
  { label: demoText("Settings", "Ajustes"), href: "/settings", icon: Settings },
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
                isActive ? "text-pitaya-deep" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-300",
                  isActive && "bg-pitaya/10"
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
