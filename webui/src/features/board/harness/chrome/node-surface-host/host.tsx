import { memo, useEffect } from "react"
import { useCanvasStore } from "@canvas-harness/react"
import { useBoardAppStore } from "../../store/board-app-store"
import { CodeSandboxStubPanel } from "./code-sandbox-stub"
import { SheetStubPanel } from "./sheet-stub"
import { WidgetStubPanel } from "./widget-stub"


/**
 * Mounts the currently active rich-node surface once at board level —
 * port of dim0's NodeSurfaceHost. Reads `activeNodeSurface` from
 * board-app-store and renders the matching panel; closing dispatches
 * back to the store. Click on the backdrop closes.
 *
 * Phase 5.1 ships STUB panels (placeholders that exercise the open /
 * close / backdrop / esc flow end-to-end). Phase 5.2 swaps each stub
 * for the real editor port (TipTap / monaco / iframe).
 */
export const NodeSurfaceHost = memo(function NodeSurfaceHost() {
  const activeNodeSurface = useBoardAppStore((s) => s.activeNodeSurface)
  const closeNodeSurface = useBoardAppStore((s) => s.closeNodeSurface)
  const store = useCanvasStore()

  // Auto-close canvas-bound surfaces if their underlying node was removed
  // (e.g. via undo while the surface is open). Sheets may be sub-pages
  // that don't live on the canvas — those gate their own existence.
  useEffect(() => {
    if (!activeNodeSurface) return
    if (activeNodeSurface.kind === "sheet") return
    const node = store.getNode(activeNodeSurface.nodeId as never)
    if (!node) closeNodeSurface()
  }, [activeNodeSurface, store, closeNodeSurface])

  // Esc closes the surface (mirrors prod's affordance).
  useEffect(() => {
    if (!activeNodeSurface) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeNodeSurface()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeNodeSurface, closeNodeSurface])

  if (!activeNodeSurface) return null

  const backdrop = (
    <div
      className="absolute inset-0 z-[54] bg-background/50 backdrop-blur-sm"
      onClick={closeNodeSurface}
      aria-hidden="true"
    />
  )

  return (
    <>
      {backdrop}
      {activeNodeSurface.kind === "sheet" ? (
        <SheetStubPanel
          nodeId={activeNodeSurface.nodeId}
          onClose={closeNodeSurface}
        />
      ) : activeNodeSurface.kind === "code-sandbox" ? (
        <CodeSandboxStubPanel
          nodeId={activeNodeSurface.nodeId}
          onClose={closeNodeSurface}
        />
      ) : (
        <WidgetStubPanel
          nodeId={activeNodeSurface.nodeId}
          onClose={closeNodeSurface}
        />
      )}
    </>
  )
})
