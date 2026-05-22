import { ReactFlowProvider } from "@xyflow/react"
import { useEffect, useMemo } from "react"
import GraphEditor from "./flow/graph-editor"
import { useGraphStore } from "../store/graph-store"
import { LoadingWindow } from "@/components/loading-view"
import { useGetBoard } from "../api/get-board"
import { HarnessCanvas, useCanvasHarnessEnabled } from "../harness/canvas"
import { useBoardAppStore } from "../harness/store/board-app-store"

/**
 * GraphView
 *
 * Board-aware shell for the graph editor that triggers a fetch on board changes
 * and renders purely from derived loading state. It resets the mutation state
 * when the boardId changes, fires a single fetch, and relies on React Query's
 * status combined with the graph store's isLoading to avoid local race conditions.
 *
 * Behind the localStorage feature flag `topix:feature.canvas-harness` the
 * board mounts via the canvas-harness path instead — react-flow stays the
 * default until the migration is complete (phase 7).
 */
export const BoardView: React.FC = () => {
  const { boardId, rootId, isLoading: storeLoading } = useGraphStore()
  const { getBoardAsync, isPending, isSuccess, reset } = useGetBoard()
  const harnessEnabled = useCanvasHarnessEnabled()
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)

  // Mirror scope into the harness app store so it can drive hydration.
  useEffect(() => {
    if (!harnessEnabled) return
    setBoardScope({ boardId: boardId ?? null, rootId: rootId ?? null })
  }, [harnessEnabled, boardId, rootId, setBoardScope])

  useEffect(() => {
    if (harnessEnabled) return
    if (!boardId) return
    reset()
    void getBoardAsync()
  }, [harnessEnabled, boardId, rootId, getBoardAsync, reset])

  const loading = useMemo(
    () => !isSuccess || isPending || storeLoading,
    [isSuccess, isPending, storeLoading]
  )

  if (harnessEnabled) {
    return (
      <div className="absolute inset-0 h-full w-full overflow-hidden">
        <div className="relative h-full w-full bg-background">
          <HarnessCanvas />
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <div className="relative h-full w-full bg-background">
          {loading ? (
            <div className="absolute inset-0 bg-background flex items-center justify-center">
              <LoadingWindow message="Loading board" viewMode="compact" />
            </div>
          ) : (
            <GraphEditor />
          )}
        </div>
      </ReactFlowProvider>
    </div>
  )
}
