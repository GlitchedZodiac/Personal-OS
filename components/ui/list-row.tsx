"use client"

import * as React from "react"
import Link from "next/link"

import { DisclosurePanel, InfoButton } from "@/components/ui/disclosure"
import { cn } from "@/lib/utils"

// ListRow + ListGroup (lane C kit) — one line per thing. A row is a title,
// an optional single-line sub, and ONE trailing thing: a value, a control
// (Switch, Button) or a chevron. Explanations go behind `info` (a "?" that
// reveals the sentence under the row) instead of being printed every time.
// Rows are ≥ 48 px tall; a row with href/onClick is one big tap target.

function ListGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-group"
      className={cn(
        "overflow-hidden rounded-card border border-rule-2 bg-card shadow-card divide-y divide-rule",
        className
      )}
      {...props}
    />
  )
}

type ListRowProps = {
  title: React.ReactNode
  sub?: React.ReactNode
  leading?: React.ReactNode
  /** right-aligned text — a setting's value, a count, a figure */
  value?: React.ReactNode
  /** an interactive control (Switch, Button) — rendered outside the tap area */
  control?: React.ReactNode
  chevron?: boolean
  href?: string
  onClick?: () => void
  /** the explanation, behind a "?" */
  info?: React.ReactNode
  tone?: "default" | "danger"
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

function Chevron() {
  // The design's own row affordance is the "›" glyph, not an icon.
  return (
    <span aria-hidden className="-mr-1 shrink-0 text-title leading-none text-ink-3">
      ›
    </span>
  )
}

function ListRow({
  title,
  sub,
  leading,
  value,
  control,
  chevron,
  href,
  onClick,
  info,
  tone = "default",
  disabled,
  className,
  ...rest
}: ListRowProps) {
  const [open, setOpen] = React.useState(false)
  const interactive = Boolean(href || onClick) && !disabled
  const showChevron = chevron ?? Boolean(href)

  const titleEl = (
    <span
      className={cn(
        "block truncate text-ui font-medium",
        tone === "danger" ? "text-danger-ink" : "text-ink"
      )}
    >
      {title}
    </span>
  )

  const body = (
    <>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        {info && !interactive ? (
          <span className="flex min-w-0 items-center gap-1">
            {titleEl}
            <InfoButton
              open={open}
              aria-label={open ? "Hide explanation" : "Explain"}
              onClick={() => setOpen((v) => !v)}
            />
          </span>
        ) : (
          titleEl
        )}
        {sub ? <span className="mt-0.5 block truncate text-caption text-ink-2">{sub}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span className="shrink-0 text-right text-ui font-semibold tabular-nums text-ink">{value}</span>
      ) : null}
      {showChevron ? <Chevron /> : null}
    </>
  )

  const pressable =
    "flex min-w-0 flex-1 items-center gap-3 text-left outline-none transition-colors duration-150"

  let main: React.ReactNode
  if (href && !disabled) {
    main = (
      <Link href={href} className={cn(pressable, "-mx-4 px-4 py-3 active:bg-card-2")} aria-label={rest["aria-label"]}>
        {body}
      </Link>
    )
  } else if (onClick && !disabled) {
    main = (
      <button
        type="button"
        onClick={onClick}
        className={cn(pressable, "-mx-4 px-4 py-3 active:bg-card-2")}
        aria-label={rest["aria-label"]}
      >
        {body}
      </button>
    )
  } else {
    main = <div className={cn(pressable, "py-3", disabled && "opacity-45")}>{body}</div>
  }

  return (
    <div data-slot="list-row" className={cn("px-4", className)}>
      <div className="flex min-h-12 items-center gap-3">
        {main}
        {info && interactive ? (
          <InfoButton open={open} aria-label={open ? "Hide explanation" : "Explain"} onClick={() => setOpen((v) => !v)} />
        ) : null}
        {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
      </div>
      {info ? (
        <DisclosurePanel open={open} className="pb-3 pt-0">
          {info}
        </DisclosurePanel>
      ) : null}
    </div>
  )
}

export { ListGroup, ListRow }
