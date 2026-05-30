import { useEffect } from "react"
import { type CanvasStore } from "@canvas-harness/core"
import type { NoteNodeData } from "../convert/note-to-node"


/**
 * Rewrite `data.graphUid` and `data.parentId` on pasted nodes so they
 * land in the user's current scope.
 *
 * canvas-harness's paste preserves the source node's `data` verbatim —
 * including the Dim0-specific `graphUid` and `parentId`. Without this
 * rewrite:
 *
 *   - Cross-board paste lands a Note with `parent_id` pointing to a
 *     folder in the SOURCE board. On refresh, the target board's REST
 *     query (`parent_id IS NULL`) filters the note out → "disappears".
 *   - Same-board cross-folder paste lands a Note at its original
 *     folder, not the user's current folder.
 *
 * Trigger logic: a local `node.add` whose `data.version !== undefined`
 * AND whose `data.graphUid` or `data.parentId` doesn't match the
 * current scope is treated as a paste. Fresh tool-drawn nodes go
 * through `use-create-handlers → noteToNode` which already stamps the
 * current scope, so they match and are skipped here. REST-hydrated
 * nodes don't fire local node.add at all (hydrate clears and seeds
 * through `applyGraphToStore` which we now don't subscribe to via the
 * 'local' batch filter on `change`).
 *
 * Tree-paste is flattened: folder nodes are blocked from being copied
 * at all (see `use-block-folder-copy`), so we never have to remap
 * descendant parentId references.
 */
export const useStampPastedNodes = (
  store: CanvasStore,
  boardId: string | null,
  rootId: string | null,
): void => {
  useEffect(() => {
    if (!boardId) return
    return store.subscribe("change", (batch) => {
      if (batch.origin !== "local") return
      for (const op of batch.ops) {
        if (op.type !== "node.add") continue
        const data = (op.node.data ?? {}) as NoteNodeData & Record<string, unknown>
        // Fresh tool-drawn nodes have no `data.version` yet — they get
        // their scope from `noteToNode` in `use-create-handlers`. Skip
        // them; they're already correct.
        if (data.version === undefined) continue

        const wantedParentId = rootId ?? undefined
        const parentMatches = data.parentId === wantedParentId
        const boardMatches = data.graphUid === boardId
        if (boardMatches && parentMatches) continue

        // Paste lands the node in the user's current scope. Folder
        // trees are blocked from copy (see `use-block-folder-copy`),
        // so we don't have to remap any child→parent references.
        store.updateNode(op.node.id, {
          data: {
            ...data,
            graphUid: boardId,
            parentId: wantedParentId,
          },
        })
      }
    })
  }, [store, boardId, rootId])
}
