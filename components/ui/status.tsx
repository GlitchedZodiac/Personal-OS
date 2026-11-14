import * as React from "react"

import { cn } from "@/lib/utils"

// Status (lane C kit) — a READ-ONLY state: a dot and a word ("On",
// "Connected", "Not paired", "Queued"). Never a control, and never dressed
// as one: Settings' watch rows print a connection status
// (pitaya-app.dc.html: `{paired ? "ON" : "off"}`), which is what this is
// for. A thing he can change is a Switch.

type Tone = "success" | "neutral" | "warning" | "danger" | "accent"

const TONE: Record<Tone, { dot: string; text: string }> = {
  success: { dot: "bg-success", text: "text-success-ink" },
  neutral: { dot: "bg-ink-3", text: "text-ink-2" },
  warning: { dot: "bg-warning", text: "text-warning-ink" },
  danger: { dot: "bg-danger", text: "text-danger-ink" },
  accent: { dot: "bg-primary", text: "text-primary" },
}

function Status({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  const t = TONE[tone]
  return (
    <span
      data-slot="status"
      className={cn("inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold", t.text, className)}
      {...props}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  )
}

export { Status }
