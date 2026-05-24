import { useEffect } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useGraphStore } from "../store/graph-store"
import { useGetBoard } from "../api/get-board"
import { HarnessCanvas } from "../harness/canvas"
import { useBoardAppStore } from "../harness/store/board-app-store"
import { FloatingAssistant } from "./flow/floating-assistant/floating-assistant"
import { CopilotSheet } from "./flow/copilot-sheet"


/**
 * Board entry-point. Mounts the canvas-harness board surface, the
 * floating-island AI composer at the bottom of the canvas, and the
 * full chat sheet drawer. Keeps the legacy graph-store populated as a
 * compat shim so other components (chat panel, dashboard cards, etc.)
 * that still read board metadata from `useGraphStore` keep working
 * until they're migrated.
 *
 * Phase 7 removes the `useGetBoard` call + the legacy store entirely.
 */
export const BoardView: React.FC = () => {
  const navigate = useNavigate()
  const { boardId, rootId } = useGraphStore()
  const { getBoardAsync, reset } = useGetBoard()
  const setBoardScope = useBoardAppStore((s) => s.setBoardScope)
  const chatSheetOpen = useGraphStore((s) => s.chatSheetOpen)
  const setChatSheetOpen = useGraphStore((s) => s.setChatSheetOpen)
  const presentationMode = useBoardAppStore((s) => s.presentationMode)

  // current_chat_id from the URL — shared between the floating island
  // and the full chat sheet so opening one continues the same chat.
  const boardSearch = useSearch({
    strict: false,
    select: (s: { current_chat_id?: string }) => ({ currentChatId: s.current_chat_id }),
  })
  const currentChatId = boardSearch?.currentChatId

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
        {!chatSheetOpen && !presentationMode && boardId && (
          <FloatingAssistant
            boardId={boardId}
            currentChatId={currentChatId}
            onOpenFullSheet={() => setChatSheetOpen(true)}
          />
        )}
        <CopilotSheet
          open={chatSheetOpen}
          onOpenChange={setChatSheetOpen}
          boardId={boardId ?? undefined}
          currentChatId={currentChatId}
          onOpenFullChat={(chatId) => {
            setChatSheetOpen(false)
            if (chatId) {
              navigate({
                to: "/chats/$id",
                params: { id: chatId },
                search: (prev: Record<string, unknown>) => ({
                  ...prev,
                  board_id: boardId || undefined,
                }),
              })
            }
          }}
        />
      </div>
    </div>
  )
}
