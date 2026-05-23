import { useEffect, useRef, useState } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { Canvas, CanvasProvider, Minimap } from "@canvas-harness/react"
import {
  HarnessSaveStatus,
  HarnessToolbar,
  HarnessViewportControls,
  StyleSidebar,
} from "../chrome"
import { boardNodeTypes, useRenderCustomNodeView } from "../node-types"
import { hydrateBoardStore } from "../persist/snapshot-load"
import { useBoardDebouncedSave, type SaveStatus } from "../persist/use-debounced-save"
import { useBoardAppStore } from "../store/board-app-store"
import { createBoardStore } from "../store/create-board-store"
import { useBoardTheme } from "../theme/use-board-theme"
import { useBoardKeyboard } from "./use-board-keyboard"
import { useCreateHandlers } from "./use-create-handlers"
import { useViewportPersistence } from "./use-viewport-persistence"


/**
 * Canvas-harness mount for the Dim0 board. One per board view; the
 * canvas-harness store is created lazily and persists across re-renders
 * for the same component instance.
 *
 * Responsibilities:
 *  - Create the canvas store with the custom node-type registry
 *  - Hydrate from the board API on scope change (board-app-store boardId/rootId)
 *  - Subscribe the debounced save once hydration completes
 *  - Wire theme + selection chrome + minimap from useBoardTheme
 *  - Dispatch custom node views via the central router
 *
 * Tool state, top-bar wiring, keyboard shortcuts land in subsequent
 * phase-4 commits.
 */
export function HarnessCanvas() {
  const boardId = useBoardAppStore((s) => s.boardId)
  const rootId = useBoardAppStore((s) => s.rootId)
  const setIsLoading = useBoardAppStore((s) => s.setIsLoading)
  const setCanEdit = useBoardAppStore((s) => s.setCanEdit)
  const setBoardLabel = useBoardAppStore((s) => s.setBoardLabel)
  const setBoardVisibility = useBoardAppStore((s) => s.setBoardVisibility)

  const storeRef = useRef<CanvasStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createBoardStore({ nodeTypes: [...boardNodeTypes] })
  }
  const store = storeRef.current

  const tool = useBoardAppStore((s) => s.tool)
  const theme = useBoardTheme()
  const [ready, setReady] = useState(false)
  const saveStatus = useBoardDebouncedSave(store, boardId, ready)
  useBoardKeyboard(store)
  useViewportPersistence(store, boardId, rootId, ready)
  const { handleCreateDrag, handleClick } = useCreateHandlers(store, boardId)

  // Hydrate on scope change. `cancelled` guards against late-arriving fetches
  // when the user navigates rapidly between boards.
  useEffect(() => {
    if (!boardId) {
      setReady(false)
      return
    }
    let cancelled = false
    setReady(false)
    setIsLoading(true)
    hydrateBoardStore(store, { boardId, rootId: rootId ?? undefined })
      .then(({ graph, canEdit }) => {
        if (cancelled) return
        setCanEdit(canEdit)
        setBoardLabel(graph.label ?? "")
        if (graph.visibility === "private" || graph.visibility === "public") {
          setBoardVisibility(graph.visibility)
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("[harness] hydrate failed", err)
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [boardId, rootId, store, setIsLoading, setCanEdit, setBoardLabel, setBoardVisibility])

  return (
    <CanvasProvider store={store}>
      <HarnessCanvasInner
        theme={theme}
        tool={tool}
        saveStatus={saveStatus}
        onCreateDrag={handleCreateDrag}
        onClick={handleClick}
      />
    </CanvasProvider>
  )
}


type InnerProps = {
  theme: ReturnType<typeof useBoardTheme>
  tool: string
  saveStatus: SaveStatus
  onCreateDrag: ReturnType<typeof useCreateHandlers>["handleCreateDrag"]
  onClick: ReturnType<typeof useCreateHandlers>["handleClick"]
}


function HarnessCanvasInner({ theme, tool, saveStatus, onCreateDrag, onClick }: InnerProps) {
  const renderView = useRenderCustomNodeView()
  return (
    <>
      <Canvas
        tool={tool}
        theme={theme.resolver}
        selectionColor={theme.selectionColor}
        background={theme.background}
        renderCustomNodeView={renderView}
        onCreateDrag={onCreateDrag}
        onClick={onClick}
      />
      <HarnessToolbar />
      <HarnessViewportControls />
      <StyleSidebar />
      <HarnessSaveStatus status={saveStatus} />
      <Minimap
        width={200}
        height={140}
        viewportColor={theme.minimap.viewportColor}
        backgroundColor={theme.minimap.backgroundColor}
        borderColor={theme.minimap.borderColor}
        defaultNodeColor={theme.minimap.defaultNodeColor}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          borderRadius: 6,
          overflow: "hidden",
          zIndex: 50,
        }}
      />
    </>
  )
}
