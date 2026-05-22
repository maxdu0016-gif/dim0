import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type SheetViewProps = {
  id: NodeId
}


const PREVIEW_LINES = 8


// Strip the cheap markdown noise so previews read as plain text. We
// intentionally avoid mounting a full markdown renderer here — the
// modal surface is where rich rendering lives (phase 5).
const stripMarkdown = (md: string): string =>
  md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim()


/**
 * Sheet inline view — title + light-paper card with a plain-text
 * preview of the first lines of the body. Click-to-open is wired in
 * phase 4 (canvas onClick → openNodeSurface).
 */
export function SheetView({ id }: SheetViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const title = data.label?.markdown?.trim() || "Untitled"
  const body = node.content?.trim() ?? ""
  const preview = body
    ? stripMarkdown(body).split("\n").slice(0, PREVIEW_LINES).join("\n")
    : ""

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-amber-50/60 dark:bg-stone-900/60",
        "pointer-events-none select-none",
      )}
    >
      <div className="border-b border-border/40 px-3 py-1.5 text-sm font-medium text-foreground">
        <span className="line-clamp-1">{title}</span>
      </div>
      <div className="flex-1 overflow-hidden px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {preview ? (
          <p className="line-clamp-8 whitespace-pre-wrap">{preview}</p>
        ) : (
          <span className="italic">empty</span>
        )}
      </div>
    </div>
  )
}
