"use client";

import { useEffect } from "react";

// Refetch hook for the global dock: pages that show logged data re-pull when
// a dock-confirmed log lands anywhere in the app ("pitaya:logged", fired by
// components/global-dock.tsx).

export function useDataLoggedListener(onLogged: () => void) {
  useEffect(() => {
    const handler = () => onLogged();
    window.addEventListener("pitaya:logged", handler);
    return () => window.removeEventListener("pitaya:logged", handler);
  }, [onLogged]);
}
