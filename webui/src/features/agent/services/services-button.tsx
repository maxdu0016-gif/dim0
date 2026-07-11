import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ServicesPanel } from "./services-panel"
import { SERVICES_SHELL } from "./shell"


/** A key glyph — signals "set your API keys". */
function KeyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4 shrink-0" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3m-3 0 3 3-3 3" />
    </svg>
  )
}


/**
 * Island affordance for the Services popover — a key icon that opens the unified
 * model/key/services settings above the composer (styled like the steps popover).
 * `emphasize` lifts it to secondary-foreground with a soft ring, used to draw the
 * eye when no model key is set yet and the rest of the island is dimmed.
 */
export const ServicesButton = ({ emphasize = false }: { emphasize?: boolean }) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/30",
                emphasize
                  ? "text-secondary-foreground ring-2 ring-secondary-foreground/30 hover:bg-accent"
                  : "text-muted-foreground border border-transparent hover:border-border hover:bg-accent",
              )}
              aria-label="Service and model settings"
            >
              <KeyGlyph />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{emphasize ? "Set a key to start" : "Services & keys"}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className={cn(SERVICES_SHELL, "w-[min(400px,calc(100vw-4rem))] p-3")}
      >
        <ServicesPanel onSaved={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
