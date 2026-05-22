import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type WidgetViewProps = {
  id: NodeId
}


// Scripts run inside the iframe, but no same-origin access (no cookies,
// no parent storage). Matches the existing widget-node sandbox set.
const IFRAME_SANDBOX = "allow-scripts allow-popups allow-modals allow-forms"


/**
 * Widget node view — title bar at top + sandboxed iframe rendering
 * `node.content` as HTML. The wrapper is pointer-event-transparent so
 * the canvas dispatches drags / selection; the iframe itself opts back
 * in so charts and interactive widgets stay clickable.
 */
export function WidgetView({ id }: WidgetViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const title = data.label?.markdown?.trim() || "Widget"
  const html = node.content ?? ""

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-background",
        "pointer-events-none",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-2 py-1 text-xs font-medium text-foreground">
        <span className="truncate">{title}</span>
      </div>
      <iframe
        title={title}
        srcDoc={html}
        sandbox={IFRAME_SANDBOX}
        className="pointer-events-auto h-full w-full flex-1 bg-white"
        style={{ border: 0 }}
      />
    </div>
  )
}
