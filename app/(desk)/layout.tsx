import { PinGate } from "@/components/pin-gate";
import { NavStackTracker } from "@/components/nav-stack-tracker";

// The iPad desk routes — full-bleed, no phone chrome (tab bar, dock,
// sidebar). Below ~700pt the pages themselves step aside for the phone
// layout (10b: compact = the phone app, untouched).
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <PinGate>
      <NavStackTracker />
      <div className="min-h-screen bg-[#F2F1F2]" style={{ position: "relative" }}>{children}</div>
    </PinGate>
  );
}
