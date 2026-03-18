import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { DemoWalkthrough } from "@/components/demo-walkthrough";
import { PinGate } from "@/components/pin-gate";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PinGate>
      <div className="min-h-screen bg-background lg:flex">
        <AppSidebar />
        <div className="flex-1 min-w-0">
          <main className="mx-auto w-full max-w-lg pb-20 lg:max-w-7xl lg:px-6 lg:pb-8 xl:px-8">
            <DemoBanner />
            {children}
          </main>
        </div>
        <BottomNav />
        <DemoWalkthrough />
      </div>
    </PinGate>
  );
}
