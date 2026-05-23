import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useCanvasStore, useNode } from "@canvas-harness/react"
import type { NodeId } from "@canvas-harness/core"
import { CancelPlainIcon, DownloadIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { SheetEditor } from "@/features/board/components/sheet/sheet-editor"
import type { NoteNodeData } from "../../convert/note-to-node"


export type SheetPanelProps = {
  nodeId: string
  onClose: () => void
}


const PANEL_CLASS =
  "absolute left-1/2 -translate-x-1/2 top-4 bottom-4 md:top-20 md:bottom-[96px] w-[min(900px,calc(100vw-2rem))] z-[55] flex flex-col rounded-lg border bg-card shadow-xl overflow-visible"


/**
 * Floating sheet editor — TipTap markdown editor bound to a sandbox
 * node's `content` field via the canvas-harness store. Closes via
 * the `onClose` callback (Esc / X / backdrop click are wired up at
 * NodeSurfaceHost).
 */
export const SheetPanel = memo(function SheetPanel({
  nodeId,
  onClose,
}: SheetPanelProps) {
  const store = useCanvasStore()
  const node = useNode(nodeId as NodeId)
  const data = (node?.data ?? {}) as Partial<NoteNodeData>

  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.label?.markdown ?? "")
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (titleEditing) return
    setTitleDraft(data.label?.markdown ?? "")
  }, [data.label?.markdown, titleEditing])

  useEffect(() => {
    if (!titleEditing) return
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [titleEditing])

  const persistTitle = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      const prev = data.label?.markdown?.trim() ?? ""
      if (trimmed === prev) return
      const prevData = (node?.data ?? {}) as Record<string, unknown>
      store.updateNode(nodeId as NodeId, {
        data: {
          ...prevData,
          label: trimmed ? { markdown: trimmed } : undefined,
        },
      })
    },
    [data.label?.markdown, node?.data, nodeId, store],
  )

  const stopTitleEdit = useCallback(
    (save: boolean) => {
      if (save) persistTitle(titleDraft)
      else setTitleDraft(data.label?.markdown ?? "")
      setTitleEditing(false)
    },
    [persistTitle, titleDraft, data.label?.markdown],
  )

  const handleNoteChange = useCallback(
    (markdown: string) => {
      const current = node?.content ?? ""
      if (markdown === current) return
      store.updateNode(nodeId as NodeId, { content: markdown })
    },
    [node?.content, nodeId, store],
  )

  const handleDownloadMarkdown = useCallback(() => {
    const markdown = node?.content ?? ""
    if (!markdown.trim()) return

    const safeBaseName =
      (data.label?.markdown || "sheet")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "sheet"

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${safeBaseName}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [node?.content, data.label?.markdown])

  if (!node) {
    return (
      <div
        className={`${PANEL_CLASS} items-center justify-center gap-3 text-sm text-muted-foreground`}
      >
        <p>This sheet no longer exists.</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  const displayTitle = data.label?.markdown?.trim() || "Untitled note"

  return (
    <div className={PANEL_CLASS} onClick={(e) => e.stopPropagation()}>
      <div className="flex w-full items-center justify-end gap-1 px-3 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDownloadMarkdown}
          title="Download markdown"
          aria-label="Download markdown"
          disabled={!node.content?.trim()}
        >
          <DownloadIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          <CancelPlainIcon className="size-4" />
        </Button>
      </div>

      <SheetEditor
        key={nodeId}
        value={node.content ?? ""}
        onSave={handleNoteChange}
        parentNoteId={nodeId}
        className="min-h-0 flex-1"
        bodyHeader={
          <div className="mx-auto max-w-[720px] pb-8">
            {titleEditing ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => stopTitleEdit(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    stopTitleEdit(true)
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    stopTitleEdit(false)
                  }
                }}
                className="w-full border-0 bg-transparent px-0 py-0.5 text-3xl font-bold tracking-tight text-foreground focus:outline-none md:text-4xl"
                placeholder="Untitled note"
              />
            ) : (
              <button
                type="button"
                onClick={() => setTitleEditing(true)}
                className="block w-full text-left text-3xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 md:text-4xl"
                title={displayTitle}
              >
                {displayTitle}
              </button>
            )}
          </div>
        }
      />
    </div>
  )
})
