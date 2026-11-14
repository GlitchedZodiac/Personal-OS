import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

// The kit's button (lane C, 2026-10): pills everywhere interactive
// (pitaya-app.dc.html), one accent, a press that answers in 90 ms. Same API
// as the shadcn original so every existing call site converges in place.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold text-ui transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] active:duration-90 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-invalid:ring-danger/25 aria-invalid:border-danger",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary-deep",
        ink: "bg-ink text-card hover:opacity-90",
        secondary: "bg-tint text-primary-deep hover:bg-tint-2",
        outline:
          "border border-rule-2 bg-card text-ink hover:bg-card-2",
        ghost: "text-ink-2 hover:bg-card-2 hover:text-ink",
        destructive:
          "bg-danger text-on-primary hover:opacity-90 focus-visible:ring-danger/25",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 px-2.5 text-caption has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3 text-caption has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-body has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
