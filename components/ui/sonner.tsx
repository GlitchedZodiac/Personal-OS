"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useResolvedTheme } from "@/components/appearance-sync"

// The kit's toast: Pitaya surfaces and status roles (app/globals.css), the
// theme the app is actually showing. `richColors` maps onto the status
// tokens below instead of sonner's own green/red.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--rule-2)",
          "--success-bg": "color-mix(in srgb, var(--success) 12%, var(--card))",
          "--success-text": "var(--success-ink)",
          "--success-border": "color-mix(in srgb, var(--success) 30%, var(--card))",
          "--warning-bg": "color-mix(in srgb, var(--warning) 14%, var(--card))",
          "--warning-text": "var(--warning-ink)",
          "--warning-border": "color-mix(in srgb, var(--warning) 32%, var(--card))",
          "--error-bg": "color-mix(in srgb, var(--danger) 12%, var(--card))",
          "--error-text": "var(--danger-ink)",
          "--error-border": "color-mix(in srgb, var(--danger) 30%, var(--card))",
          "--info-bg": "var(--card)",
          "--info-text": "var(--ink)",
          "--info-border": "var(--rule-2)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
