import { useEffect, useState } from "react"
import { useParams, useSearch } from "@tanstack/react-router"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Chat } from "@/features/agent/components/chat-view"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import { HarnessCanvas } from "@/features/board/harness/canvas"
import { LocalFolderBreadcrumb } from "@/features/board/local/local-folder-breadcrumb"
import { NotesSearchDialog } from "@/features/board/local/notes-search-dialog"
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
  const params = useParams({ strict: false })
  const boardId = params.boardId ?? ""
  const rootId = useSearch({
    strict: false,
    select: (s: { root_id?: string }) => s?.root_id,
  })
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)
  const openBoard = useLocalMessagesStore((s) => s.openBoard)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Scope the board to the current folder layer (root_id search param); the
  // harness re-projects that layer when rootId changes.
  useEffect(() => {
    if (boardId) setBoardScope({ boardId, rootId: rootId ?? null })
  }, [boardId, rootId, setBoardScope])

  // Chats are board-scoped, not layer-scoped — open once per board.
  useEffect(() => {
    void requestPersistentStorage()
    if (boardId) void openBoard(boardId)
  }, [boardId, openBoard])

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-background">
      <div className="relative h-full w-full">
        <HarnessCanvas local />

        <LocalFolderBreadcrumb boardId={boardId} rootId={rootId ?? null} />

        <NotesSearchDialog boardId={boardId} />

        {/* Island composes turns; hidden while the full sheet is open (parity with
            online). It grays itself and lights the key icon when no model key is set. */}
        {!sheetOpen && (
          <FloatingAssistant
            boardId={boardId}
            local
            onOpenFullSheet={() => setSheetOpen(true)}
          />
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
