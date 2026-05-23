import { useRef } from "react"
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption, useStopCanvasGesture } from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"


export type WidgetViewProps = {
  id: NodeId
}


// Scripts run inside the iframe, but no same-origin access (no cookies,
// no parent storage). Matches the existing widget-node sandbox set.
const IFRAME_SANDBOX = "allow-scripts allow-popups allow-modals allow-forms"


/**
 * Widget node view — title bar at top + sandboxed iframe rendering
 * `node.content` as HTML. Expand button top-right opens the full HTML
 * editor (phase 5.2). Editable title sits below the card.
 *
 * The wrapper is pointer-event-transparent so the canvas dispatches
 * drags; the iframe + expand button opt back in.
 */
export function WidgetView({ id }: WidgetViewProps) {
  const node = useNode(id)
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const expandRef = useRef<HTMLButtonElement>(null)
  useStopCanvasGesture(expandRef)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const title = label?.trim() || "Widget"
  const html = node.content ?? ""

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-background",
        )}
      >
        <iframe
          title={title}
          srcDoc={html}
          sandbox={IFRAME_SANDBOX}
          className="pointer-events-auto h-full w-full flex-1 bg-white"
          style={{ border: 0 }}
        />
      </div>

      {canEdit ? (
        <button
          ref={expandRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openNodeSurface(id as unknown as string, "widget")
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute right-2 top-2 z-20 inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          title="Open widget"
          aria-label="Open widget"
        >
          <ArrowsOutSimpleIcon className="size-4" />
        </button>
      ) : null}

      <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2">
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled widget"
          textClassName="text-center text-sm font-medium text-foreground"
        />
      </div>
    </div>
  )
}
