import { Fragment } from "react"
import {
  ArrowRight,
  Circle,
  Cursor,
  Diamond,
  FrameCorners,
  Hand,
  Square,
  TextT,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useBoardAppStore } from "../store/board-app-store"


type ToolDef = {
  id: string
  label: string
  icon: PhosphorIcon
}


const TOOL_GROUPS: ReadonlyArray<ReadonlyArray<ToolDef>> = [
  [
    { id: "select", label: "Select (V)", icon: Cursor },
    { id: "pan", label: "Pan (H)", icon: Hand },
  ],
  [
    { id: "rect", label: "Rectangle", icon: Square },
    { id: "ellipse", label: "Ellipse", icon: Circle },
    { id: "diamond", label: "Diamond", icon: Diamond },
  ],
  [
    { id: "arrow", label: "Arrow", icon: ArrowRight },
    { id: "text", label: "Text", icon: TextT },
    { id: "frame", label: "Frame (F)", icon: FrameCorners },
  ],
]


/**
 * Floating tool tray for the canvas-harness board — center-top. Reads
 * + writes `tool` on the board-app-store so keyboard shortcuts and
 * future external triggers stay in sync.
 */
export function HarnessToolbar() {
  const tool = useBoardAppStore((s) => s.tool)
  const setTool = useBoardAppStore((s) => s.setTool)

  return (
    <div
      className={cn(
        "absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg",
        "border border-border bg-background/95 px-2 py-1 shadow-md backdrop-blur",
      )}
    >
      {TOOL_GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 ? <div className="mx-0.5 h-5 w-px bg-border" /> : null}
          {group.map((t) => {
            const active = tool === t.id
            const Icon = t.icon
            return (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setTool(t.id)}
                    aria-label={t.label}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-md transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" weight={active ? "fill" : "regular"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}
