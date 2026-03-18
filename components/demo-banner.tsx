import { demoModeEnabled, demoText } from "@/lib/demo-client";

export function DemoBanner() {
  if (!demoModeEnabled) return null;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <p className="text-[11px] font-medium text-amber-300">
          {demoText(
            "Doctor demo mode: edits are isolated in the demo database and will not change your real app data.",
            "Modo demo para doctor: los cambios estan aislados en la base de datos de demo y no afectan tus datos reales."
          )}
        </p>
      </div>
    </div>
  );
}
