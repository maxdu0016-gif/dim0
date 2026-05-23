import { useRef } from "react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption, useStopCanvasGesture } from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"


export type SheetViewProps = {
  id: NodeId
}


const PREVIEW_LINES = 10


// Strip cheap markdown noise so the inline preview reads as plain
// text. Full markdown rendering lives in the modal editor surface.
const stripMarkdown = (md: string): string =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim()


/**
 * Sheet inline view — sticky-note style card. The whole body is the
 * click target (opens the editor surface). Editable title sits below.
 * Pan/zoom suspension is handled by the canvas placeholder
 * (drawSheetPlaceholder) — this component only mounts at idle.
 */
export function SheetView({ id }: SheetViewProps) {
  const node = useNode(id)
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const bodyRef = useRef<HTMLButtonElement>(null)
  useStopCanvasGesture(bodyRef)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const body = node.content?.trim() ?? ""
  const preview = body
    ? stripMarkdown(body).split("\n").slice(0, PREVIEW_LINES).join("\n")
    : ""

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <button
        ref={bodyRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (!canEdit) return
          openNodeSurface(id as unknown as string, "sheet")
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left text-card-foreground shadow-md",
          "pointer-events-auto",
          canEdit ? "cursor-pointer" : "cursor-default",
        )}
        title={canEdit ? "Open sheet" : undefined}
      >
        <div className="scrollbar-thin min-h-0 flex-1 overflow-hidden px-4 py-3 text-sm leading-relaxed text-foreground">
          {preview ? (
            <p className="whitespace-pre-wrap">{preview}</p>
          ) : (
            <span className="italic text-muted-foreground">Empty sheet</span>
          )}
        </div>
      </button>

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
