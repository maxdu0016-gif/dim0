import { Icon } from "@iconify/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type FolderViewProps = {
  id: NodeId
}


/**
 * React view for a folder node. Subscribes to its own node via
 * useNode(id) so content edits / position changes are live. The card
 * shows an iconify folder glyph + the folder's label.
 *
 * Click / double-click are handled by `<Canvas onClick>` in phase 4 —
 * this view stays pointer-event-transparent so the canvas can dispatch
 * to its hit tester.
 */
export function FolderView({ id }: FolderViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown?.trim() || "Untitled folder"
  const emoji =
    data.properties?.emoji?.type === "icon" && data.properties.emoji.icon?.type === "icon"
      ? data.properties.emoji.icon.icon
      : null

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-foreground",
        "pointer-events-none select-none",
      )}
    >
      {emoji ? (
        <Icon icon={emoji} className="size-12" />
      ) : (
        <Icon icon="lucide:folder" className="size-12 opacity-80" />
      )}
      <span className="line-clamp-2 text-center text-sm font-medium">{label}</span>
    </div>
  )
}
