import { asBatchId } from "@canvas-harness/core"
import type { CanvasStore, Op } from "@canvas-harness/core"
import type { BoardContent } from "@/features/board/model"


/**
 * Hydrate an empty store with persisted content — the local analog of the
 * backend `hydrateBoardStore`. Applied as one `remote` batch so it skips the
 * undo stack and (if persistence attaches afterward) isn't re-persisted.
 */
export const applyContentToStore = (store: CanvasStore, content: BoardContent): void => {
  const ops: Op[] = []
  for (const group of content.groups) ops.push({ type: "group.upsert", group })
  for (const node of content.nodes) ops.push({ type: "node.add", node })
  for (const edge of content.edges) ops.push({ type: "edge.add", edge })
  if (ops.length > 0) {
    store.applyBatch({
      id: asBatchId("local-hydrate"),
      clientId: store.clientId,
      ts: Date.now(),
      origin: "remote",
      ops,
    })
  }
  if (content.frameOrder && content.frameOrder.length > 0) {
    store.setFrameOrder(content.frameOrder)
  }
}
