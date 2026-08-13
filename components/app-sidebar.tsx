"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  JournalIcon,
  SpiritIcon,
  FoodIcon,
  PitayaLogo,
  SettingsIcon,
  TodayIcon,
} from "@/components/pitaya-icons";

// Desktop rail — same five surfaces as the tab bar, same design icons.
const navItems = [
  { label: "Today", href: "/dashboard", Icon: TodayIcon },
  { label: "Spirit", href: "/spirit", Icon: SpiritIcon },
  { label: "Food", href: "/health/food", Icon: FoodIcon },
  { label: "Journal", href: "/journal", Icon: JournalIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border lg:bg-sidebar">
      <div className="px-6 py-7 border-b border-border">
        <div className="flex items-center gap-3">
          <PitayaLogo size={34} />
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
        {navItems.map(({ label, href, Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-full transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon size={18} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
