import * as React from "react"

import { cn } from "@/lib/utils"

// Section — the only way a group starts (lane C kit): an 11-px micro label,
// an optional action on the right, then the content. Kicker is the label on
// its own (inside cards, over metric tiles).

function Kicker({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="kicker" className={cn("micro-label", className)} {...props} />
}

type SectionProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode
  /** right-aligned: a count, a meta line, or a small link/button */
  action?: React.ReactNode
}

function Section({ title, action, className, children, ...props }: SectionProps) {
  return (
    <section data-slot="section" className={cn("mt-6 first:mt-0", className)} {...props}>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3 px-1">
        <Kicker>{title}</Kicker>
        {action ? <div className="text-caption font-semibold text-ink-2">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** A text action for a Section header ("All records", "Edit"). */
function SectionAction({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "-my-2 rounded-full px-2 py-2 text-caption font-semibold text-primary transition-colors duration-150 hover:text-primary-deep",
        className
      )}
      {...props}
    />
  )
}

export { Kicker, Section, SectionAction }
