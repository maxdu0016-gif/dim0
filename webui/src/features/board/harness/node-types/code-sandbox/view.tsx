import { CodeIcon } from "@phosphor-icons/react"
import type { NodeId } from "@canvas-harness/core"
import { useNode } from "@canvas-harness/react"
import { cn } from "@/lib/utils"
import type { NoteNodeData } from "../../convert/note-to-node"


export type CodeSandboxViewProps = {
  id: NodeId
}


const PREVIEW_LINES = 12


/**
 * Code-sandbox inline view — title bar + language badge + preview of
 * the first ~12 lines of code. No syntax highlighting at this LOD —
 * the full editor opens in a modal surface (phase 5).
 */
export function CodeSandboxView({ id }: CodeSandboxViewProps) {
  const node = useNode(id)
  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const title = data.label?.markdown?.trim() || "Code sandbox"
  const language = data.properties?.programmingLanguage?.text?.trim() || "python"
  const code = node.content ?? ""
  const preview = code.split("\n").slice(0, PREVIEW_LINES).join("\n")

  return (
    <div className="pointer-events-none relative h-full w-full select-none">
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-stone-900 text-stone-100",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-700 px-2 py-1 text-xs font-medium">
          <CodeIcon className="size-3.5 opacity-70" weight="bold" />
          <span className="truncate">{title}</span>
          <span className="ml-auto rounded bg-stone-700 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-stone-300">
            {language}
          </span>
        </div>
        <pre className="scrollbar-thin pointer-events-auto min-h-0 flex-1 overflow-auto whitespace-pre p-2 font-mono text-[11px] leading-relaxed text-stone-300">
          {preview || <span className="italic text-stone-500">no code</span>}
        </pre>
      </div>
    </div>
  )
}
