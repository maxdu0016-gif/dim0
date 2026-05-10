import { memo, useEffect } from "react"

import { useGraphStore } from "../../store/graph-store"
import { CodeSandboxPanel } from "./code-sandbox-panel"
import { SheetNodePanel } from "./sheet-node-panel"
import { WidgetPanel } from "./widget-panel"


/**
 * Mounts the currently active rich node surface once at board level.
 *
 * Sheets are special: a sub-page is a note whose `parent_id` points at
 * another note rather than living on the canvas, so it never appears in
 * `nodesById`. The sheet panel handles loading from the API for that
 * case, so we always mount it and let the panel gate on its own data.
 * Widgets and code-sandbox surfaces remain canvas-only.
 */
export const NodeSurfaceHost = memo(function NodeSurfaceHost() {
  const activeNodeSurface = useGraphStore((state) => state.activeNodeSurface)
  const hasNode = useGraphStore((state) =>
    activeNodeSurface ? state.nodesById.has(activeNodeSurface.nodeId) : false,
  )
  const closeNodeSurface = useGraphStore((state) => state.closeNodeSurface)

  useEffect(() => {
    if (!activeNodeSurface) return
    // Auto-close only for canvas-bound surfaces; sheets may be sub-pages.
    if (activeNodeSurface.kind !== "sheet" && !hasNode) {
      closeNodeSurface()
    }
  }, [activeNodeSurface, closeNodeSurface, hasNode])

  if (!activeNodeSurface) return null

  if (activeNodeSurface.kind === "sheet") {
    return <SheetNodePanel nodeId={activeNodeSurface.nodeId} />
  }

  if (!hasNode) return null

  if (activeNodeSurface.kind === "widget") {
    return <WidgetPanel nodeId={activeNodeSurface.nodeId} />
  }

  return <CodeSandboxPanel nodeId={activeNodeSurface.nodeId} />
})
