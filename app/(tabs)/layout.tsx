import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { DemoWalkthrough } from "@/components/demo-walkthrough";
import { GlobalDock } from "@/components/global-dock";
import { NavStackTracker } from "@/components/nav-stack-tracker";
import { PinGate } from "@/components/pin-gate";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PinGate>
      <NavStackTracker />
      <div className="min-h-screen bg-background lg:flex">
        <AppSidebar />
        <div className="flex-1 min-w-0">
          {/* safe-area-top: layout.tsx sets viewportFit: "cover", so the web
              content extends under the status bar and Dynamic Island. Every
              tab page pads with a flat pt-12 (48px), which is LESS than the
              ~59px inset on his 17 Pro Max — so the first thing on the page
              collided with the clock and battery (reported 2026-08-26 with a
              screenshot of the chat's "Saved" line sitting on top of them).
              Applying the inset here once means each page's own pt-12 becomes
              breathing room BELOW the status bar, which is what it always
              meant. The .safe-area-top utility already existed in globals.css
              and was simply never used. Collapses to 0 on desktop. */}
          <main className="safe-area-top mx-auto w-full max-w-lg pb-20 lg:max-w-7xl lg:px-6 lg:pb-8 xl:px-8">
            <DemoBanner />
            {children}
          </main>
        </div>
        <GlobalDock />
        <BottomNav />
        <DemoWalkthrough />
      </div>
    </PinGate>
  );
}
