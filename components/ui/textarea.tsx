import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-rule-2 placeholder:text-ink-3 focus-visible:border-edge focus-visible:ring-focus-ring aria-invalid:ring-danger/25 aria-invalid:border-danger bg-card text-ink flex field-sizing-content min-h-16 w-full rounded-control border px-4 py-2.5 text-body transition-[color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 md:text-ui",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
