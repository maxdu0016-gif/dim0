import { useRef } from "react"
import { CodeIcon } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"
import { NodeTitleCaption, useStopCanvasGesture } from "../../shared-views"
import { useBoardAppStore } from "../../store/board-app-store"


export type CodeSandboxViewProps = {
  id: NodeId
}


const PREVIEW_LINES = 12


/**
 * Code-sandbox inline view — entire body is a click-to-open button
 * (matches dim0's prod UX). Click anywhere on the code preview opens
 * the full editor surface. Editable title sits below the card.
 */
export function CodeSandboxView({ id }: CodeSandboxViewProps) {
  const node = useNode(id)
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const bodyRef = useRef<HTMLButtonElement>(null)
  useStopCanvasGesture(bodyRef)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const language = data.properties?.programmingLanguage?.text?.trim() || "python"
  const code = node.content ?? ""
  const preview = code.split("\n").slice(0, PREVIEW_LINES).join("\n")

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <button
        ref={bodyRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (!canEdit) return
          openNodeSurface(id as unknown as string, "code-sandbox")
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-stone-900 text-stone-100",
          "pointer-events-auto text-left",
          canEdit ? "cursor-pointer" : "cursor-default",
        )}
        title={canEdit ? "Open code sandbox" : undefined}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-700 px-2 py-1 text-xs font-medium">
          <CodeIcon className="size-3.5 opacity-70" weight="bold" />
          <span className="ml-auto rounded bg-stone-700 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-stone-300">
            {language}
          </span>
        </div>
        <pre className="scrollbar-thin min-h-0 flex-1 overflow-auto whitespace-pre p-2 font-mono text-[11px] leading-relaxed text-stone-300">
          {preview || <span className="italic text-stone-500">no code</span>}
        </pre>
      </button>

      <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2">
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled sandbox"
          textClassName="text-center text-sm font-medium text-foreground"
        />
      </div>
    </div>
  )
}
