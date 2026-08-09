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

// Pitaya IA: Body | Food | Today (center, brand diamond) | Train | Settings.
// Finances/todos/trends/coach are intentionally absent — routes stay alive,
// the nav simply no longer knows them.
const leftItems = [
  { label: "Body", href: "/health/body", icon: PersonStanding },
  { label: "Food", href: "/health/food", icon: Apple },
];

const rightItems = [
  { label: "Train", href: "/health/workouts", icon: Dumbbell },
  { label: "Settings", href: "/settings", icon: Settings },
];

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Apple;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-2 transition-all duration-200 tap-scale",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon
        className={cn("h-5 w-5 transition-all duration-200", active && "scale-105")}
        strokeWidth={active ? 2.2 : 1.9}
      />
      <span className={cn("text-[10px] font-medium", active && "font-semibold")}>
        {label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const todayActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl safe-area-bottom lg:hidden">
      <div className="grid h-16 max-w-3xl mx-auto px-2 grid-cols-5 items-center">
        {leftItems.map((item) => (
          <TabLink key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Today — center slot with the brand diamond */}
        <Link
          href="/dashboard"
          className="flex flex-col items-center justify-center gap-1 py-2 tap-scale"
        >
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
              todayActive ? "bg-primary shadow-md shadow-primary/30" : "bg-secondary"
            )}
          >
            <span
              className={cn(
                "block h-2.5 w-2.5 rotate-45",
                todayActive ? "bg-primary-foreground" : "bg-primary"
              )}
            />
          </span>
          <span
            className={cn(
              "text-[10px]",
              todayActive ? "font-semibold text-primary" : "font-medium text-muted-foreground"
            )}
          >
            Today
          </span>
        </Link>

        {rightItems.map((item) => (
          <TabLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  );
}
