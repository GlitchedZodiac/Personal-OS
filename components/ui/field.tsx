import * as React from "react"

import { cn } from "@/lib/utils"

// Field (lane C kit) — a label, the control (Input, Select, Textarea), and
// one line under it: a hint, or the error in the danger ink.

function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="px-1 text-caption font-semibold text-ink-2">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="px-1 text-caption font-medium text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="px-1 text-caption text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

export { Field }
