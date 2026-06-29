import { useEffect, useState } from "react"
import { ByokPanel } from "@/features/agent/byok/byok-panel"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { ChatProvider } from "@/features/agent/hooks/chat-context"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { LocalConversation } from "./local-conversation"
import { useLocalSubmitPrompt } from "./use-local-submit-prompt"


/**
 * Floating local-board agent. Prompts for a BYOK key when unset, then runs the
 * frontend engine against the live board and renders the transcript through the
 * REUSED rich chat UI (`LocalConversation`).
 */
export function LocalAgentPanel() {
  const configured = useByokStore((s) => s.configured)
  const boardId = useBoardAppStore((s) => s.boardId) ?? ""
  const submit = useLocalSubmitPrompt(boardId)
  const openChat = useLocalMessagesStore((s) => s.open)

  // Load this board's persisted chat history on open.
  useEffect(() => {
    if (boardId) void openChat(boardId, boardId)
  }, [boardId, openChat])
  const [showKey, setShowKey] = useState(false)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)

  const send = async (): Promise<void> => {
    const prompt = input.trim()
    if (!prompt || sending) return
    setInput("")
    setSending(true)
    try {
      await submit(prompt)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 flex max-h-[70vh] w-96 flex-col gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
      {!configured || showKey ? (
        <ByokPanel onSaved={() => setShowKey(false)} />
      ) : (
        <ChatProvider initialChatId="local">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <LocalConversation />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send()
              }}
              placeholder={sending ? "Working…" : "Ask the agent to build…"}
              disabled={sending}
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => setShowKey(true)}
              title="API key"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ⚙
            </button>
          </div>
        </ChatProvider>
      )}
    </div>
  )
}
