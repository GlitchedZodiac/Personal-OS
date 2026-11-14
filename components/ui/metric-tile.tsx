import * as React from "react"

import { Kicker } from "@/components/ui/section"
import { formatDelta, type GoodDirection } from "@/lib/delta"
import { cn } from "@/lib/utils"

// MetricTile, Delta, Num (lane C kit). The number is the hero: Familjen,
// tabular, one size step above everything around it; the label is a micro
// kicker; the delta is green only when it moved the good way.

/** A figure in the display face with tabular digits. */
function Num({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("font-display font-bold tabular-nums", className)} {...props} />
}

function Delta({
  value,
  decimals = 1,
  unit,
  good = "none",
  suffix,
  className,
}: {
  value: number
  decimals?: number
  unit?: string
  good?: GoodDirection
  /** e.g. "· 30d" — rendered in the secondary ink */
  suffix?: React.ReactNode
  className?: string
}) {
  const d = formatDelta(value, decimals, good)
  return (
    <span
      data-slot="delta"
      className={cn(
        "text-caption font-semibold tabular-nums",
        d.tone === "good" ? "text-success-ink" : "text-ink-2",
        className
      )}
    >
      {d.text}
      {unit && !d.flat ? <span className="font-medium"> {unit}</span> : null}
      {suffix ? <span className="font-medium text-ink-2"> {suffix}</span> : null}
    </span>
  )
}

function MetricTile({
  label,
  value,
  unit,
  delta,
  hint,
  size = "md",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  delta?: React.ReactNode
  hint?: React.ReactNode
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <div data-slot="metric-tile" className={cn("min-w-0", className)}>
      <Kicker className="truncate">{label}</Kicker>
      <div className="mt-1 flex items-baseline gap-1">
        <Num
          className={cn(
            "text-ink",
            size === "lg" ? "text-hero" : size === "md" ? "text-title" : "text-body"
          )}
        >
          {value}
        </Num>
        {unit ? <span className="text-caption font-medium text-ink-2">{unit}</span> : null}
      </div>
      {delta ? <div className="mt-0.5">{delta}</div> : null}
      {hint ? <div className="mt-0.5 truncate text-caption text-ink-2">{hint}</div> : null}
    </div>
  )
}

/** A row of tiles that never wraps a tile onto a lonely line. */
function MetricRow({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="metric-row" className={cn("grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4", className)} {...props} />
}

export { Delta, MetricRow, MetricTile, Num }
