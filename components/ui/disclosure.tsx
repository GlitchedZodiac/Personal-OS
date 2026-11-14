"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Disclosure — the sentence behind a tap (lane C kit). Settings and data
// screens print one line per thing; the explanation lives here, opened by a
// small "?" and revealed in 150 ms without measuring (globals .reveal).

function InfoButton({
  open,
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { open: boolean }) {
  return (
    <button
      type={type}
      aria-expanded={open}
      className={cn(
        // 24 px glyph inside a 40 px hit area
        "relative -m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full border text-caption font-semibold leading-none transition-colors duration-150",
          open ? "border-primary bg-primary text-on-primary" : "border-rule-2 text-ink-2"
        )}
      >
        ?
      </span>
    </button>
  )
}

function DisclosurePanel({
  open,
  className,
  children,
}: {
  open: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="reveal" data-open={open} aria-hidden={!open}>
      <div>
        <div className={cn("pt-1.5 text-caption text-ink-2", className)}>{children}</div>
      </div>
    </div>
  )
}

/** A label with its "?" and the sentence underneath, self-contained. */
function Disclosure({
  label,
  children,
  defaultOpen = false,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div data-slot="disclosure" className={className}>
      <div className="flex items-center gap-1">
        <span className="text-ui font-medium text-ink">{label}</span>
        <InfoButton open={open} aria-label={open ? "Hide explanation" : "Explain"} onClick={() => setOpen((v) => !v)} />
      </div>
      <DisclosurePanel open={open}>{children}</DisclosurePanel>
    </div>
  )
}

export { Disclosure, DisclosurePanel, InfoButton }
