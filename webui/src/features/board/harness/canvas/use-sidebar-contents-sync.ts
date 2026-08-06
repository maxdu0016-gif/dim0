import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { CanvasStore, OpBatch } from "@canvas-harness/core"
import type { NoteNodeData } from "../convert/note-to-node"
import type { BoardContentKind } from "@/features/board/api/list-board-contents"


const SURFACE_KINDS = new Set<BoardContentKind>(["sheet", "folder", "code-sandbox", "widget"])


/**
 * Whether a batch changes the sidebar's surface-tree projection: a surface node
 * added, any node removed (the remove op carries only an id, so refresh
 * conservatively — deletes are rare), or a surface node's tree-visible fields
 * (label / icon / parent / kind) edited. A pure drag/resize (position/style only)
 * returns false so we don't re-read the tree on every pointer tick.
 */
export const affectsSurfaceTree = (batch: OpBatch): boolean => {
  for (const op of batch.ops) {
    if (op.type === "node.add") {
      const kind = (op.node.data as NoteNodeData | undefined)?.styleType as BoardContentKind | undefined
      if (kind && SURFACE_KINDS.has(kind)) return true
    } else if (op.type === "node.remove") {
      return true
    } else if (op.type === "node.update") {
      const data = (op.patch as { data?: Partial<NoteNodeData> } | undefined)?.data
      if (data && ("label" in data || "parentId" in data || "properties" in data || "styleType" in data)) {
        return true
      }
    }
  }
  return false
}


/**
 * Keep the sidebar's surface-tree in sync with live canvas edits. The tree reads
 * the on-device store (`["localBoardContents", boardId]`) for both local and
 * offline-available synced boards, so one debounced invalidation on a surface-
 * relevant op (create / delete / rename / re-icon / move) refreshes it — before
 * this, created surfaces never appeared in the tree and rename/icon lagged until
 * a manual collapse+expand. Debounced past the persistence flush so the re-read
 * (a fresh snapshot+oplog load) reflects the just-committed edit.
 */
export const useSidebarContentsSync = (store: CanvasStore, boardId: string | null): void => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!boardId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = store.subscribe("change", (batch) => {
      if (!affectsSurfaceTree(batch)) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void queryClient.invalidateQueries({ queryKey: ["localBoardContents", boardId] })
      }, 250)
    })
    return () => {
      if (timer !== null) clearTimeout(timer)
      unsub()
    }
  }, [store, boardId, queryClient])
}
