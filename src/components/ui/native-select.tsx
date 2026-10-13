import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Native `<select>`, styled to stay readable.
 *
 * The option list is drawn by the browser, not by this stylesheet. A select
 * with a transparent background makes Chrome fall back to its own white popup
 * while the options still inherit the page's near-white text, which renders
 * them invisible. Both the control and the options therefore carry an explicit
 * background and text colour, and `color-scheme` keeps the popup chrome dark.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        "[&>option]:bg-background [&>option]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
