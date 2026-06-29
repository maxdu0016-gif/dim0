import { useEffect, useState } from "react"
import { useParams } from "@tanstack/react-router"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Chat } from "@/features/agent/components/chat-view"
import { ByokPanel } from "@/features/agent/byok/byok-panel"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import { HarnessCanvas } from "@/features/board/harness/canvas"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { FloatingAssistant } from "@/features/board/components/flow/floating-assistant/floating-assistant"
import { requestPersistentStorage } from "@/features/board/persist/local/persist-storage"


/**
 * Local board view — mounts the full canvas harness and the real agent UI in
 * local (no-backend) mode. The agent runs on the in-browser engine via BYOK;
 * the floating island composes turns, and the sparkles button opens the full
 * chat sheet (reused `<Chat>`: history, transcript, docked input).
 */
export function LocalBoardScreen() {
  const params = useParams({ strict: false }) as { boardId?: string }
  const boardId = params.boardId ?? ""
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)
  const configured = useByokStore((s) => s.configured)
  const openBoard = useLocalMessagesStore((s) => s.openBoard)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    void requestPersistentStorage()
    if (boardId) {
      setBoardScope({ boardId, rootId: null })
      void openBoard(boardId)
    }
  }, [boardId, setBoardScope, openBoard])

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden bg-background">
      <div className="relative h-full w-full">
        <HarnessCanvas local />

        {/* Island composes turns; hidden while the full sheet is open (parity with online). */}
        {!sheetOpen && configured && (
          <FloatingAssistant
            boardId={boardId}
            local
            onOpenFullSheet={() => setSheetOpen(true)}
          />
        )}

        {!configured && (
          <div className="absolute bottom-4 left-1/2 z-[60] w-[min(580px,calc(100vw-4rem))] -translate-x-1/2">
            <ByokPanel />
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} modal={false} disablePointerDismissal>
          <SheetContent
            side="right"
            showOverlay={false}
            showClose={false}
            className="z-[60] w-full border-l border-border/70 bg-background p-0 text-sidebar-foreground md:w-[500px] md:max-w-[92vw]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Board Assistant</SheetTitle>
            </SheetHeader>
            <div className="relative h-full w-full">
              {sheetOpen && (
                <Chat
                  local
                  initialBoardId={boardId}
                  showHistoricalChats
                  enableSelectionContext
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
