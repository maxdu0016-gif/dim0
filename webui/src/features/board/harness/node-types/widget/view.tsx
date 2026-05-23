import { useRef } from "react"
import { ArrowsOutSimpleIcon, LayoutIcon } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useIsMoving, useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import { WidgetIframe } from "@/features/board/components/flow/widget-iframe"
import type { NoteNodeData } from "../../convert/note-to-node"
import {
  NodeTitleCaption,
  useIsInView,
  useStopCanvasGesture,
} from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"


export type WidgetViewProps = {
  id: NodeId
}


/**
 * Widget inline view — sandboxed iframe rendering `node.content` as
 * HTML, with an expand button top-right that opens the full editor.
 * Suspends the iframe to a "Moving widget…" pill during canvas
 * motion or when the node scrolls off-screen, matching prod UX and
 * keeping pan/zoom smooth even with many widgets.
 */
export function WidgetView({ id }: WidgetViewProps) {
  const node = useNode(id)
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const expandRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  useStopCanvasGesture(expandRef)
  const isMoving = useIsMoving()
  const isInView = useIsInView(wrapRef, "200px")
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const html = node.content ?? ""
  const suspendPreview = isMoving || !isInView

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none relative h-full w-full select-none"
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-dashed border-border bg-background p-2",
        )}
      >
        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border/50 bg-background">
          {html && !suspendPreview ? (
            <WidgetIframe
              html={html}
              title="Widget"
              className="pointer-events-auto h-full w-full bg-transparent"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <LayoutIcon className="size-5 shrink-0" />
              <span>Widget HTML will render here</span>
            </div>
          )}
          {suspendPreview && html ? (
            <div className="absolute inset-0 flex items-center justify-center bg-card/75 backdrop-blur-[1px]">
              <div className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                {isMoving ? "Moving widget…" : "Widget preview paused"}
              </div>
            </div>
          ) : null}
        </div>
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
