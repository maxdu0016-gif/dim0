import { useRef } from "react"
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption, useStopCanvasGesture } from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"


export type SheetViewProps = {
  id: NodeId
}


const PREVIEW_LINES = 8


// Strip the cheap markdown noise so previews read as plain text. We
// intentionally avoid mounting a full markdown renderer here — the
// modal surface is where rich rendering lives (phase 5.2).
const stripMarkdown = (md: string): string =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim()


/**
 * Sheet inline view — lined card with a plain-text preview. Editable
 * title below the card (NodeTitleCaption). Expand button top-right
 * opens the full editor surface (matches dim0's prod widget pattern
 * applied to sheets too).
 */
export function SheetView({ id }: SheetViewProps) {
  const node = useNode(id)
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const expandRef = useRef<HTMLButtonElement>(null)
  useStopCanvasGesture(expandRef)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const body = node.content?.trim() ?? ""
  const preview = body
    ? stripMarkdown(body).split("\n").slice(0, PREVIEW_LINES).join("\n")
    : ""

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border",
          "bg-amber-50/60 dark:bg-stone-900/60",
        )}
      >
        <div className="scrollbar-thin pointer-events-auto min-h-0 flex-1 overflow-auto px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {preview ? (
            <p className="whitespace-pre-wrap">{preview}</p>
          ) : (
            <span className="italic">empty</span>
          )}
        </div>
      </div>

      {canEdit ? (
        <button
          ref={expandRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openNodeSurface(id as unknown as string, "sheet")
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute right-2 top-2 z-20 inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          title="Open sheet"
          aria-label="Open sheet"
        >
          <ArrowsOutSimpleIcon className="size-4" />
        </button>
      ) : null}

      <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2">
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled"
          textClassName="text-center text-sm font-medium text-foreground"
        />
      </div>
    </div>
  )
}
