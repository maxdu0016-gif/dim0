import { useEffect } from "react"
import { ChatProvider } from "@/features/agent/hooks/chat-context"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import { isLocalAgentOnSynced } from "@/features/agent/local/local-agent-flag"
import { seedTranscriptsFromServer } from "@/features/agent/local/seed-transcripts"
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
  // Phase 2: a SYNCED board in browser-agent mode backs up transcripts to the
  // server (cross-device). A local-only board (`local`) has nothing to sync to.
  const syncTranscript = browserAgent && !local

  // The local chat store is normally initialized by LocalBoardScreen; a synced
  // board in browser-agent mode must init it too. On a synced board, first seed
  // any server-side transcripts into IndexedDB (cross-device) so `openBoard`
  // picks them up; seeding is best-effort and never clobbers a local copy.
  const openBoard = useLocalMessagesStore((s) => s.openBoard)
  useEffect(() => {
    if (!(browserAgent && !local && boardId)) return
    let cancelled = false
    void (async () => {
      if (syncTranscript) await seedTranscriptsFromServer(boardId)
      if (!cancelled) await openBoard(boardId)
    })()
    return () => {
      cancelled = true
    }
  }, [browserAgent, local, syncTranscript, boardId, openBoard])

  return (
    <ChatProvider
      initialChatId={browserAgent ? boardId : currentChatId}
      local={browserAgent}
      syncTranscript={syncTranscript}
    >
      <FloatingIsland boardId={boardId} onOpenFullSheet={onOpenFullSheet} />
      <AnswerCard onOpenFullSheet={onOpenFullSheet} />
    </ChatProvider>
  )
}
