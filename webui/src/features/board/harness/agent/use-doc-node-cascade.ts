import { useEffect } from "react"
import type { CanvasStore, OpBatch } from "@canvas-harness/core"
import { getLocalStores } from "@/features/local-stores"
import { refreshDocIndex } from "@/features/board/search/use-doc-index"


/**
 * Doc ids whose `document` node was removed by a GENUINE (non-remote) edit.
 *
 * CRITICAL: ignores `origin: "remote"` batches. Hydrate / layer-switch clears the
 * scene as a `remote` batch (see applyContentToStore); without this guard a
 * reload would cascade-delete every document. Only a real user/local delete
 * should tear down the underlying doc + chunks.
 */
export const removedDocNodeIds = (batch: OpBatch): string[] => {
  if (batch.origin === "remote") return []
  const ids: string[] = []
  for (const op of batch.ops) {
    if (op.type === "node.remove" && op.node.type === "document") ids.push(String(op.node.id))
  }
  return ids
}


/**
 * Cascade a document node's deletion to its stored doc + chunks, then reindex —
 * so removing the node from the canvas doesn't leave orphaned chunks the agent
 * would still search. Local boards only.
 */
export const useDocNodeCascade = (store: CanvasStore, boardId: string, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled || !boardId) return
    return store.subscribe("change", (batch) => {
      const ids = removedDocNodeIds(batch)
      if (ids.length === 0) return
      void (async () => {
        const { docs } = await getLocalStores()
        for (const id of ids) await docs.deleteDocument(id)
        await refreshDocIndex(boardId)
      })()
    })
  }, [store, boardId, enabled])
}
