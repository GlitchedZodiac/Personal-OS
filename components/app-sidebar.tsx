"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Apple,
  Dumbbell,
  PersonStanding,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Pitaya IA — same five surfaces as the tab bar, Today first on desktop.
const navItems = [
  { label: "Today", href: "/dashboard", icon: null },
  { label: "Body", href: "/health/body", icon: PersonStanding },
  { label: "Food", href: "/health/food", icon: Apple },
  { label: "Train", href: "/health/workouts", icon: Dumbbell },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border lg:bg-sidebar">
      <div className="px-6 py-7 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="pitaya-diamond" />
          <span
            className="text-lg font-bold tracking-[0.18em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            PITAYA
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          It&apos;s just you. Prove it.
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-full transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {item.icon ? (
                <item.icon className="h-4 w-4" />
              ) : (
                <span
                  className={cn(
                    "block h-2 w-2 rotate-45",
                    isActive ? "bg-accent-foreground" : "bg-primary"
                  )}
                />
              )}
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
