import { useState } from "react"
import { clsx } from "clsx"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToolsMenuIcon } from "@/components/icons"
import { ByokPanel } from "./byok-panel"


/**
 * Local-board settings: a gear that opens the BYOK config (provider, model,
 * key). The in-browser engine has no backend tools, so this replaces the
 * online tools menu — the only meaningful setting is which model/key to use.
 */
export const ByokSettingsButton = () => {
  const [open, setOpen] = useState(false)

  const buttonClass = clsx(
    "transition-all shrink-0 my-icon p-2 rounded-lg",
    "hover:bg-accent dark:bg-input/30 dark:hover:bg-accent/50",
    "border border-transparent hover:border-border transition-colors",
    "text-muted-foreground",
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <DialogTrigger
            render={
              <button className={buttonClass} aria-label="Model and API key settings">
                <ToolsMenuIcon className="size-4 shrink-0" strokeWidth={2} />
              </button>
            }
          />
        </TooltipTrigger>
        <TooltipContent>Model &amp; key</TooltipContent>
      </Tooltip>
      <DialogContent className="w-[360px] max-w-[calc(100%-2rem)] rounded-lg p-4">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-sm font-medium text-muted-foreground">Model &amp; API key</DialogTitle>
        </DialogHeader>
        <ByokPanel onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
