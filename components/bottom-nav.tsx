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
  },
  {
    label: "Trends",
    href: "/trends",
    icon: TrendingUp,
  },
  {
    label: "Todos",
    href: "/todos",
    icon: CheckSquare,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "relative p-1 rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-all",
                    isActive && "scale-110"
                  )}
                />
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
