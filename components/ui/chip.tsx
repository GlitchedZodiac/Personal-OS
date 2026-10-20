import * as React from "react"

import { cn } from "@/lib/utils"

// Chip — the filter / toggle / range pill (lane C kit). Replaces ten
// hand-rolled chip styles. Selected = the accent fill; otherwise card with a
// hairline. A count rides inside in tabular figures.

type ChipProps = React.ComponentProps<"button"> & {
  selected?: boolean
  size?: "sm" | "md"
  count?: number | string
  leading?: React.ReactNode
}

function Chip({
  selected = false,
  size = "md",
  count,
  leading,
  className,
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      data-slot="chip"
      data-selected={selected || undefined}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-45 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        size === "md" ? "h-8 px-3 text-ui" : "h-7 px-2.5 text-caption",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-rule-2 bg-card text-ink-2 hover:text-ink",
        className
      )}
      {...props}
    >
      {leading}
      {children}
      {count !== undefined && (
        <span className={cn("tabular-nums", selected ? "opacity-80" : "text-ink-2")}>{count}</span>
      )}
    </button>
  )
}

/** A horizontal row of chips that scrolls instead of wrapping. */
function ChipRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chip-row"
      className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:px-0", className)}
      {...props}
    />
  )
}

export { Chip, ChipRow }
