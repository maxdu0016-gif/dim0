import { useEffect } from "react"
import { useParams } from "@tanstack/react-router"
import { HarnessCanvas } from "@/features/board/harness/canvas"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { LocalAgentPanel } from "@/features/agent/local/local-agent-panel"
import { requestPersistentStorage } from "@/features/board/persist/local/persist-storage"


/** Local board view — mounts the full canvas harness in local (no-backend) mode. */
export function LocalBoardScreen() {
  const params = useParams({ strict: false }) as { boardId?: string }
  const boardId = params.boardId ?? ""
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)

  useEffect(() => {
    void requestPersistentStorage()
    if (boardId) setBoardScope({ boardId, rootId: null })
  }, [boardId, setBoardScope])

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden bg-background">
      <div className="relative h-full w-full">
        <HarnessCanvas local />
        <LocalAgentPanel />
      </div>
    </div>
  )
}
