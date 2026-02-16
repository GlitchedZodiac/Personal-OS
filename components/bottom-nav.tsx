"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  TrendingUp,
  CheckSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Health",
    href: "/health",
    icon: Heart,
    activeColor: "text-rose-400",
    activeBg: "bg-rose-500/10",
  },
  {
    label: "Trends",
    href: "/trends",
    icon: TrendingUp,
    activeColor: "text-blue-400",
    activeBg: "bg-blue-500/10",
  },
  {
    label: "Todos",
    href: "/todos",
    icon: CheckSquare,
    activeColor: "text-green-400",
    activeBg: "bg-green-500/10",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    activeColor: "text-purple-400",
    activeBg: "bg-purple-500/10",
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-2xl transition-all duration-200 tap-scale",
                isActive
                  ? item.activeColor
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-300",
                  isActive && item.activeBg
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive && "scale-110"
                  )}
                  fill={isActive ? "currentColor" : "none"}
                  strokeWidth={isActive ? 1.5 : 2}
                />
                {isActive && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-all",
                  isActive && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
