import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToolsMenuIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { ServicesPanel } from "./services-panel"
import { SERVICES_SHELL } from "./shell"


const triggerClass = cn(
  "shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors",
  "border border-transparent hover:border-border hover:bg-accent",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/30",
)


/**
 * Island affordance for the Services popover — a quiet gear that opens the
 * unified model/key/services settings above the composer, styled like the steps
 * popover (same sidebar shell + shadow).
 */
export const ServicesButton = () => {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClass} aria-label="Service and model settings">
              <ToolsMenuIcon className="size-4 shrink-0" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Services &amp; keys</TooltipContent>
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
