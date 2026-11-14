import * as React from "react"

import { cn } from "@/lib/utils"

// EmptyState (lane C kit) — one shape for "nothing here yet": a glyph in a
// tint circle (from components/pitaya-icons.tsx on designed surfaces), a
// title that says what is missing, one line that says how it fills, and at
// most one action. Replaces fourteen different treatments.

function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  body?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10",
        className
      )}
    >
      {icon ? (
        <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-tint text-primary [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-body font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-[34ch] text-caption text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
