import { Icon } from "@iconify/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption } from "../../shared-views"


export type FolderViewProps = {
  id: NodeId
}


/**
 * React view for a folder node. Subscribes to its own node via
 * useNode(id) so content edits / position changes are live. The card
 * shows an iconify folder glyph; the editable label sits BELOW the
 * node card (absolute top-full) matching dim0's prod UX.
 *
 * Dbl-click → nested-board router navigation lands in a follow-up
 * (Phase 5 folder nav). For now the card is non-interactive on its
 * own — only the title responds to clicks.
 */
export function FolderView({ id }: FolderViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const emoji =
    data.properties?.emoji?.type === "icon" && data.properties.emoji.icon?.type === "icon"
      ? data.properties.emoji.icon.icon
      : null

  return (
    <div
      className="pointer-events-none relative h-full w-full select-none"
      data-folder-label-edit-guard="true"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-2 text-foreground">
        {emoji ? (
          <Icon icon={emoji} className="size-12" />
        ) : (
          <Icon icon="lucide:folder" className="size-12 opacity-80" />
        )}
      </div>

      <div
        data-folder-label-edit="true"
        className={cn(
          "absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2",
          "pointer-events-auto",
        )}
      >
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled folder"
          textClassName="text-center text-sm font-medium text-foreground"
        />
      </div>
    </div>
  )
}
