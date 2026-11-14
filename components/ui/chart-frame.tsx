import * as React from "react"

import { Kicker } from "@/components/ui/section"
import { cn } from "@/lib/utils"

// ChartFrame (lane C kit) — the one standard for charts: a kicker and a
// meta line, optional range chips, the plot on hairline grids, a footer for
// axis notes, and an honest empty state (the frame, its grid and one
// sentence — never an empty box). Colours come from the ramps in
// app/globals.css: categorical --chart-1…5, sequential --chart-seq-1…5.

/** Categorical series colour i (1-based, wraps after 5). */
function chartColor(i: number): string {
  return `var(--chart-${((Math.max(1, i) - 1) % 5) + 1})`
}

/** Sequential ramp step (1 = faint … 5 = strongest). */
function chartSeq(step: number): string {
  return `var(--chart-seq-${Math.min(5, Math.max(1, Math.round(step)))})`
}

const CHART_GRID = "var(--chart-grid)"
const CHART_REF = "var(--chart-ref)"

/** Three hairlines (top, middle, bottom) behind a plot area. */
function HairlineGrid({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 flex flex-col justify-between", className)}>
      {Array.from({ length: Math.max(2, lines) }, (_, i) => (
        <div key={i} className="h-px w-full bg-chart-grid" />
      ))}
    </div>
  )
}

/** The one tooltip: ink on paper, inverted in Night. */
function ChartTooltip({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        "pointer-events-none rounded-lg bg-tooltip px-2 py-1 text-caption font-semibold tabular-nums text-tooltip-ink shadow-float",
        className
      )}
      {...props}
    />
  )
}

function ChartEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex h-full items-center justify-center", className)}>
      <HairlineGrid />
      <p className="relative max-w-[28ch] bg-card px-2 text-center text-caption text-ink-2">{children}</p>
    </div>
  )
}

function ChartFrame({
  title,
  meta,
  controls,
  footer,
  empty,
  height = 140,
  className,
  plotClassName,
  children,
}: {
  title: React.ReactNode
  /** right side of the header: a total, a delta, a range label */
  meta?: React.ReactNode
  /** range / metric chips under the header */
  controls?: React.ReactNode
  /** axis notes under the plot ("Sep 12 · 7-day mean · Oct 20") */
  footer?: React.ReactNode
  /** when set, the plot is replaced by this sentence on the hairline grid */
  empty?: React.ReactNode
  /** plot height in px */
  height?: number
  className?: string
  plotClassName?: string
  children?: React.ReactNode
}) {
  return (
    <section
      data-slot="chart-frame"
      className={cn("rounded-card border border-rule-2 bg-card p-4 shadow-card", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <Kicker>{title}</Kicker>
        {meta ? <div className="shrink-0 text-caption font-semibold tabular-nums text-ink-2">{meta}</div> : null}
      </div>
      {controls ? <div className="mt-3">{controls}</div> : null}
      <div className={cn("relative mt-3", plotClassName)} style={{ height }}>
        {empty ? <ChartEmpty>{empty}</ChartEmpty> : children}
      </div>
      {footer ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-micro tabular-nums text-ink-2">{footer}</div>
      ) : null}
    </section>
  )
}

export { CHART_GRID, CHART_REF, ChartEmpty, ChartFrame, ChartTooltip, HairlineGrid, chartColor, chartSeq }
