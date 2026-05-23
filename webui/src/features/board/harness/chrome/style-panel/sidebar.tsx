import { useCallback, useMemo } from "react"
import type { Node, Style as CanvasStyle } from "@canvas-harness/core"
import { useCanvasStore, useNodes, useSelection } from "@canvas-harness/react"
import { StylePanel } from "./panel"


/**
 * Reads the current selection from canvas-harness, derives a single
 * representative style from the first selected non-frame node, and
 * dispatches style changes back to all selected nodes in one undoable
 * batch.
 *
 * Mounted standalone in the canvas chrome — hidden when no nodes are
 * selected. Edge styling (pathStyle / arrowheads) is deferred to a
 * follow-up; nodes only for v1.
 *
 * Frames are skipped (no visual styling worth exposing in the panel).
 * Custom node types (sheet / code-sandbox / widget / document / folder)
 * also appear here — their style fields work the same way, even though
 * their React views override most of the rendering.
 */
export function StyleSidebar() {
  const selection = useSelection()
  const allNodes = useNodes()
  const store = useCanvasStore()

  const selectedNodes = useMemo<Node[]>(() => {
    if (selection.length === 0) return []
    const ids = new Set(selection as string[])
    return allNodes.filter((n) => ids.has(n.id as unknown as string) && n.type !== "frame")
  }, [selection, allNodes])

  const representativeStyle = selectedNodes[0]?.style

  const handleStyleChange = useCallback(
    (patch: Partial<CanvasStyle>) => {
      store.batch(() => {
        for (const n of selectedNodes) {
          store.updateNode(n.id, { style: { ...n.style, ...patch } })
        }
      })
    },
    [store, selectedNodes],
  )

  if (selectedNodes.length === 0 || !representativeStyle) return null

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 z-50 w-[160px] -translate-y-1/2">
      <StylePanel style={representativeStyle} onStyleChange={handleStyleChange} />
    </div>
  )
}
