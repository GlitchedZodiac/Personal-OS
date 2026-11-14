import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ink placeholder:text-ink-3 selection:bg-primary selection:text-on-primary border-rule-2 bg-card h-10 w-full min-w-0 rounded-full border px-4 py-1 text-body text-ink transition-[color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-ui file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 md:text-ui",
        "focus-visible:border-edge focus-visible:ring-2 focus-visible:ring-focus-ring",
        "aria-invalid:ring-danger/25 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
