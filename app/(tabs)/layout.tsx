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
        <main className="mx-auto max-w-lg pb-44">
          {children}
        </main>
        <BottomNav />
      </div>
    </PinGate>
  );
}
