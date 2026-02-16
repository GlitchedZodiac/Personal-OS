import { BottomNav } from "@/components/bottom-nav";
import { PinGate } from "@/components/pin-gate";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PinGate>
      <div className="min-h-screen bg-background">
        <main className="pb-20 max-w-lg mx-auto">
          {children}
        </main>
        <BottomNav />
      </div>
    </PinGate>
  );
}
