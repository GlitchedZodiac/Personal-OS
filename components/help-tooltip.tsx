"use client";

import { useId, useState } from "react";
import { CircleHelp } from "lucide-react";

interface HelpTooltipProps {
  content: string;
  label?: string;
}

export function HelpTooltip({ content, label = "Help" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-2xl border border-border/60 bg-background/95 p-3 text-left text-xs text-muted-foreground shadow-2xl backdrop-blur"
        >
          {content}
        </span>
      )}
    </span>
  );
}
