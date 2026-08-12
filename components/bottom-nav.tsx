"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  PitayaMarkIcon,
  FoodIcon,
  SettingsIcon,
  TodayIcon,
} from "@/components/pitaya-icons";

// Pitaya tab bar — five even tabs with the design's own icons
// (docs/design/pitaya-app.dc.html). The chat/mic/camera dock floats above
// this bar as its own pill (components/voice-input.tsx), per the design.
const tabs = [
  { label: "Spirit", href: "/spirit", Icon: PitayaMarkIcon },
  { label: "Food", href: "/health/food", Icon: FoodIcon },
  { label: "Today", href: "/dashboard", Icon: TodayIcon },
  { label: "Journal", href: "/journal", Icon: PitayaMarkIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl safe-area-bottom lg:hidden">
      <div className="grid h-16 max-w-3xl mx-auto px-2 grid-cols-5 items-center">
        {tabs.map(({ label, href, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 transition-colors duration-200 tap-scale",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={24} strokeWidth={active ? 2.2 : 1.9} />
              <span
                className={cn(
                  "text-[10px]",
                  active ? "font-semibold" : "font-medium"
                )}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
