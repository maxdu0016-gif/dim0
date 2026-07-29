import { useEffect } from "react"
import { ChatProvider } from "@/features/agent/hooks/chat-context"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import { isLocalAgentOnSynced } from "@/features/agent/local/local-agent-flag"
import { AnswerCard } from "./answer-card"
import { FloatingIsland } from "./floating-island"


export interface FloatingAssistantProps {
  boardId: string
  currentChatId?: string
  onOpenFullSheet: () => void
  /** Run on the in-browser engine (local-first board) instead of the backend. */
  local?: boolean
}


/**
 * Ambient board assistant: a composer pill at the bottom of the canvas, an
 * adaptive progress strip, and a right-side answer card that surfaces text
 * replies. Shares the chat session with the full CopilotSheet via the
 * `current_chat_id` search param. On a local board it runs the frontend
 * engine; chat is then scoped to the board itself.
 */
export const FloatingAssistant = ({
  boardId,
  currentChatId,
  onOpenFullSheet,
  local = false,
}: FloatingAssistantProps) => {
  // Phase 3 (flag-gated): run the browser engine on a synced board too. The chat
  // then goes fully local-mode (browser engine + local transcript store), and its
  // edits ride the v2 relay to peers with no server agent. Off → unchanged.
  const browserAgent = local || isLocalAgentOnSynced()

  // The local chat store is normally initialized by LocalBoardScreen; a synced
  // board in browser-agent mode must init it too (loads the board's chats).
  const openBoard = useLocalMessagesStore((s) => s.openBoard)
  useEffect(() => {
    if (browserAgent && !local && boardId) void openBoard(boardId)
  }, [browserAgent, local, boardId, openBoard])

  return (
    <ChatProvider initialChatId={browserAgent ? boardId : currentChatId} local={browserAgent}>
      <FloatingIsland boardId={boardId} onOpenFullSheet={onOpenFullSheet} />
      <AnswerCard onOpenFullSheet={onOpenFullSheet} />
    </ChatProvider>
  )
}
