import { ArrowClockwise, ArrowCounterClockwise } from "@phosphor-icons/react"
import {
  useCanRedo,
  useCanUndo,
  useCanvasStore,
} from "@canvas-harness/react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"


type ButtonProps = {
  label: string
  Icon: typeof ArrowCounterClockwise
  disabled: boolean
  onClick: () => void
}


function HistoryButton({ label, Icon, disabled, onClick }: ButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
          )}
        >
          <Icon className="size-4" weight="bold" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}


/**
 * Top-left floating undo / redo buttons. Reflect canUndo / canRedo from
 * the canvas-harness store and call store.undo / store.redo directly —
 * same path as the keyboard shortcut.
 */
export function HarnessHistoryControls() {
  const store = useCanvasStore()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  return (
    <div
      className={cn(
        "absolute left-3 top-3 z-50 flex items-center gap-0.5 rounded-lg",
        "border border-border bg-background/95 px-1 py-1 shadow-md backdrop-blur",
      )}
    >
      <HistoryButton
        label="Undo (Cmd+Z)"
        Icon={ArrowCounterClockwise}
        disabled={!canUndo}
        onClick={() => store.undo()}
      />
      <HistoryButton
        label="Redo (Cmd+Shift+Z)"
        Icon={ArrowClockwise}
        disabled={!canRedo}
        onClick={() => store.redo()}
      />
    </div>
  )
}
