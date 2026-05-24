import { useEffect } from "react"
import type { CanvasStore } from "@canvas-harness/core"


/**
 * Stamp `parentId` + `graphUid` onto edges created by the lib's arrow
 * tool. Canvas-harness's `useArrowTool` calls `store.addEdge` with no
 * `data` field, which means newly-drawn edges have no parent_id when
 * persisted — so an edge drawn inside a sub-folder would appear at
 * the root board.
 *
 * Hydrated edges already carry these fields via the convert layer
 * (see linkToEdge), so we detect "lib-created" edges by the absence
 * of `data.version` (the convert layer always sets it).
 *
 * Mirrors prod's [line-placement.ts](dim0/.../line-placement.ts)
 * which sets `parentId: rootId` directly at construction time.
 */
export const useStampNewEdges = (
  store: CanvasStore,
  boardId: string | null,
  rootId: string | null,
): void => {
  useEffect(() => {
    if (!boardId) return
    return store.subscribe("change", (batch) => {
      if (batch.origin !== "local") return
      for (const op of batch.ops) {
        if (op.type !== "edge.add") continue
        const data = (op.edge.data ?? {}) as Record<string, unknown>
        // Skip edges already stamped by the convert layer (hydration /
        // applyBatch from an agent) — they always carry `version`.
        if (data.version !== undefined) continue
        store.updateEdge(op.edge.id, {
          data: {
            ...data,
            version: 1,
            createdAt: new Date().toISOString(),
            graphUid: boardId,
            parentId: rootId ?? undefined,
          },
        })
      }
    })
  }, [store, boardId, rootId])
}
