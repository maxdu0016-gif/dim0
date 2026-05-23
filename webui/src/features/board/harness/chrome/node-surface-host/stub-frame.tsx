import { type ReactNode } from "react"
import { XIcon } from "@phosphor-icons/react"
import { useNode } from "@canvas-harness/react"
import type { NodeId } from "@canvas-harness/core"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type StubFrameProps = {
  nodeId: string
  onClose: () => void
  /** Type-specific accent for the header. */
  accent?: string
  /** Title fallback when the node has no label. */
  titleFallback: string
  /** Type-specific body placeholder. */
  children?: ReactNode
}


/**
 * Shared visual frame for the phase-5.1 stub panels. Renders a
 * centered card with a header (node title + close button) and a body
 * slot. Same chrome the real panels in phase 5.2 will inherit.
 */
export function StubFrame({
  nodeId,
  onClose,
  accent,
  titleFallback,
  children,
}: StubFrameProps) {
  const node = useNode(nodeId as NodeId)
  const data = (node?.data ?? {}) as Partial<NoteNodeData>
  const title = data.label?.markdown?.trim() || titleFallback

  return (
    <div
      className={cn(
        "absolute left-1/2 top-1/2 z-[55] flex max-h-[80vh] w-[min(720px,90vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
        "rounded-2xl border border-border bg-card shadow-2xl",
      )}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 py-3",
          accent,
        )}
      >
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <XIcon className="size-4" weight="bold" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {children ?? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            Editor coming soon (phase 5.2).
          </div>
        )}
      </div>
    </div>
  )
}
