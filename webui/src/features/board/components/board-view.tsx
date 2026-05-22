import { useEffect } from "react"
import { useGraphStore } from "../store/graph-store"
import { useGetBoard } from "../api/get-board"
import { HarnessCanvas } from "../harness/canvas"
import { useBoardAppStore } from "../harness/store/board-app-store"


/**
 * Board entry-point. Mounts the canvas-harness board surface and keeps
 * the legacy graph-store populated as a compat shim so other components
 * (chat panel, dashboard cards, etc.) that still read board metadata
 * from `useGraphStore` keep working until they're migrated.
 *
 * Phase 7 removes the `useGetBoard` call + the legacy store entirely.
 */
export const BoardView: React.FC = () => {
  const { boardId, rootId } = useGraphStore()
  const { getBoardAsync, reset } = useGetBoard()
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)

  // Mirror scope into the harness app store; HarnessCanvas drives hydration off it.
  useEffect(() => {
    setBoardScope({ boardId: boardId ?? null, rootId: rootId ?? null })
  }, [boardId, rootId, setBoardScope])

  // Legacy fetch — populates useGraphStore for components not yet migrated.
  // TODO phase 7: drop once every useGraphStore consumer has been migrated.
  useEffect(() => {
    if (!boardId) return
    reset()
    void getBoardAsync()
  }, [boardId, rootId, getBoardAsync, reset])

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden">
      <div className="relative h-full w-full bg-background">
        <HarnessCanvas />
      </div>
    </div>
  )
}
