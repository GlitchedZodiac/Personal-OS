"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Heart, Settings, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Health",
    href: "/health",
    icon: Heart,
    activeColor: "text-teal-300",
    activeBg: "bg-teal-500/14",
  },
  {
    label: "Trends",
    href: "/trends",
    icon: TrendingUp,
    activeColor: "text-amber-300",
    activeBg: "bg-amber-500/14",
  },
  {
    label: "Todos",
    href: "/todos",
    icon: CheckSquare,
    activeColor: "text-orange-300",
    activeBg: "bg-orange-500/14",
  },
  {
    label: "Finances",
    href: "/finances",
    icon: Wallet,
    activeColor: "text-emerald-300",
    activeBg: "bg-emerald-500/14",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    activeColor: "text-cyan-300",
    activeBg: "bg-cyan-500/14",
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
      <nav className="floating-action-dock pointer-events-auto mx-auto max-w-lg rounded-[28px] px-2 py-2">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "tap-scale flex flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2 text-[10px] font-medium transition-all duration-200",
                  isActive ? item.activeColor : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "relative rounded-2xl p-2 transition-all duration-200",
                    isActive && item.activeBg
                  )}
                >
                  <item.icon
                    className={cn("h-[18px] w-[18px] transition-transform duration-200", isActive && "scale-110")}
                    strokeWidth={isActive ? 1.75 : 2}
                  />
                  {isActive && (
                    <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-current" />
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
