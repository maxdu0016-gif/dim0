import { asBatchId } from "@canvas-harness/core"
import type { CanvasStore, Node, Op } from "@canvas-harness/core"
import type { BoardContent } from "@/features/board/model"
import {
  adaptEdgeColors,
  adaptNodeColors,
  applyColorsToEdgeStyle,
  applyColorsToStyle,
} from "@/features/board/harness/theme/color-adapter"
import { storedNodeColorsOf } from "@/features/board/harness/theme/apply-node-colors"
import { getBoardThemeMode } from "@/features/board/harness/theme/theme-mode-ref"


/**
 * Hydrate an empty store with persisted content — the local analog of the
 * backend `hydrateBoardStore`. Applied as one `remote` batch so it skips the
 * undo stack and (if persistence attaches afterward) isn't re-persisted.
 *
 * Re-projects each node/edge's display colors from its canonical
 * `_storedColors` for the CURRENT theme mode — the local analog of what
 * `noteToNode` does on the backend path. Without this, a reload paints whatever
 * theme the colors were last persisted in (the stamp hook + theme-flip
 * projection both skip a `remote` hydrate), so e.g. a dark board reloads
 * mis-themed.
 */
export const applyContentToStore = (store: CanvasStore, content: BoardContent): void => {
  const mode = getBoardThemeMode()
  const ops: Op[] = []

  for (const group of content.groups) ops.push({ type: "group.upsert", group })

  for (const node of content.nodes) {
    const stored = storedNodeColorsOf(node as unknown as Node)
    const display = mode === "dark" ? adaptNodeColors(stored, "dark") : stored
    const style = applyColorsToStyle(node.style ?? {}, display)
    ops.push({ type: "node.add", node: { ...node, style } })
  }

  for (const edge of content.edges) {
    const data = edge.data as { _storedColors?: { strokeColor?: string; textColor?: string } } | undefined
    const stored = data?._storedColors ?? { strokeColor: edge.style?.strokeColor, textColor: edge.style?.textColor }
    const display = mode === "dark" ? adaptEdgeColors(stored, "dark") : stored
    const style = applyColorsToEdgeStyle(edge.style ?? {}, display)
    ops.push({ type: "edge.add", edge: { ...edge, style } })
  }

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
