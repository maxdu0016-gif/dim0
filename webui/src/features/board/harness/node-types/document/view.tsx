import { FilePdf, File as FileIcon, Clock, CheckCircle, Warning } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type DocumentViewProps = {
  id: NodeId
}


const STATUS_META: Record<
  string,
  { label: string; tone: string; icon: typeof Clock }
> = {
  pending: { label: "Pending", tone: "text-muted-foreground", icon: Clock },
  processing: { label: "Processing", tone: "text-amber-600 dark:text-amber-400", icon: Clock },
  completed: { label: "Ready", tone: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle },
  failed: { label: "Failed", tone: "text-destructive", icon: Warning },
}


/**
 * Document node view — file icon + name + processing status. Doubles
 * as the inline node card; clicking it (phase 4) opens the document
 * panel (phase 5). Pointer-event-transparent so the canvas dispatches.
 */
export function DocumentView({ id }: DocumentViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const name = data.label?.markdown?.trim() || "Untitled file"
  const mime = data.properties?.mimeType?.text
  const status = data.properties?.status?.value
  const isPdf = mime?.includes("pdf") ?? name.toLowerCase().endsWith(".pdf")
  const Icon = isPdf ? FilePdf : FileIcon

  const statusMeta = status ? STATUS_META[status] : null
  const StatusIcon = statusMeta?.icon

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-foreground",
        "pointer-events-none select-none",
      )}
    >
      <Icon className="size-12 opacity-80" weight="duotone" />
      <span className="line-clamp-2 px-2 text-center text-sm font-medium">{name}</span>
      {statusMeta && StatusIcon ? (
        <div className={cn("flex items-center gap-1 text-xs", statusMeta.tone)}>
          <StatusIcon className="size-3" weight="fill" />
          <span>{statusMeta.label}</span>
        </div>
      ) : null}
    </div>
  )
}
