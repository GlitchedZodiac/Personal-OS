"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { demoModeEnabled, demoSpanishEnabled, demoText } from "@/lib/demo-client";

const WALKTHROUGH_STORAGE_KEY = "personal-os-demo-walkthrough-v1";

const ENGLISH_STEPS = [
  {
    title: "Welcome to the health dashboard",
    body: "This screen summarizes calories, macros, hydration, workouts, and body metrics for the day.",
  },
  {
    title: "Voice-first logging",
    body: "Use the microphone to log meals, workouts, water, and notes quickly using natural speech.",
  },
  {
    title: "Section navigation",
    body: "Use the bottom tabs to move across Health, Trends, Todos, Finances, and Settings.",
  },
  {
    title: "Safe demo environment",
    body: "You can edit data in this demo freely. Nothing here changes the owner's real production metrics.",
  },
];

const SPANISH_STEPS = [
  {
    title: "Bienvenido al panel de salud",
    body: "Esta pantalla resume calorias, macros, hidratacion, entrenos y metricas corporales del dia.",
  },
  {
    title: "Registro por voz",
    body: "Usa el microfono para registrar comidas, entrenamientos, agua y notas hablando de forma natural.",
  },
  {
    title: "Navegacion por secciones",
    body: "Usa las pestanas inferiores para ir entre Salud, Tendencias, Tareas, Finanzas y Configuracion.",
  },
  {
    title: "Entorno de demo seguro",
    body: "Puedes editar datos en esta demo sin riesgo. Nada aqui modifica las metricas reales del dueno.",
  },
];

export function DemoWalkthrough() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!demoModeEnabled || pathname !== "/health") return;
    try {
      const seen = localStorage.getItem(WALKTHROUGH_STORAGE_KEY);
      if (!seen) setIsOpen(true);
    } catch {
      setIsOpen(true);
    }
  }, [pathname]);

  const steps = demoSpanishEnabled ? SPANISH_STEPS : ENGLISH_STEPS;

  const closeWalkthrough = () => {
    setIsOpen(false);
    try {
      localStorage.setItem(WALKTHROUGH_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignore localStorage errors in private mode.
    }
  };

  if (!demoModeEnabled || pathname !== "/health" || !isOpen) return null;

  const current = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-end sm:items-center sm:justify-center">
      <Card className="w-full max-w-md border-amber-500/30 bg-background/95">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                {demoText("Doctor Demo Walkthrough", "Guia de Demo para Doctor")}
              </p>
              <CardTitle className="text-lg mt-1">{current.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={closeWalkthrough}
              aria-label={demoText("Close walkthrough", "Cerrar guia")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {current.body}
          </p>

          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-8 bg-amber-400" : "w-3 bg-muted"
                }`}
              />
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((idx) => Math.max(0, idx - 1))}
              disabled={stepIndex === 0}
            >
              {demoText("Back", "Atras")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  closeWalkthrough();
                } else {
                  setStepIndex((idx) => Math.min(steps.length - 1, idx + 1));
                }
              }}
            >
              {isLastStep
                ? demoText("Start Demo", "Iniciar Demo")
                : demoText("Next", "Siguiente")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
