import { useCallback } from "react"
import { generateUuid, trimText } from "@/lib/common"
import { getCanvasStoreRef } from "@/features/board/harness/canvas-store-ref"
import { runAgent } from "@/features/agent/engine/agent-loop"
import { ByokLlmClient } from "@/features/agent/engine/byok-client"
import { createNote, linkNotes, updateNote } from "@/features/agent/engine/tools"
import type { AgentEvent } from "@/features/agent/engine/types"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import type { ChatMessage } from "@/features/agent/types/chat"
import { latestAssistantText, stepsFromEvents } from "./agent-event-to-step"


// v1 toolset: the build tools (create/update/link). search/list land later.
const BUILD_TOOLS = [createNote, updateNote, linkNotes]


let counter = 0
const mintId = (): string => `local-${Date.now()}-${counter++}`


/**
 * Local analog of `useSubmitPrompt`: runs the frontend engine against the live
 * board and streams its events into the local message store as a `ChatMessage`
 * with `ReasoningStep[]` — so the existing rich chat UI renders it unchanged.
 * Mints a chat on the first turn (mirrors the backend creating a chat) and
 * labels it from the opening prompt.
 */
export function useLocalSubmitPrompt(boardId: string) {
  const asConfig = useByokStore((s) => s.asConfig)
  const setMessages = useLocalMessagesStore((s) => s.setMessages)
  const setChatUid = useLocalMessagesStore((s) => s.setChatUid)
  const persist = useLocalMessagesStore((s) => s.persist)

  return useCallback(
    async (prompt: string): Promise<void> => {
      const store = getCanvasStoreRef()
      const config = asConfig()

      // Reuse the active chat, or mint one on the first turn.
      const existingUid = useLocalMessagesStore.getState().chatUid
      const isNewChat = !existingUid
      const chatUid = existingUid ?? generateUuid()
      if (isNewChat) setChatUid(chatUid)
      const label = isNewChat ? trimText(prompt, 40) : undefined

      const assistantId = mintId()
      const userMessage: ChatMessage = { id: mintId(), role: "user", content: { markdown: prompt }, chatUid, properties: {} }
      const base: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: { markdown: "" },
        chatUid,
        properties: { reasoning: { type: "reasoning", reasoning: [] } },
        streaming: true,
      }

      setMessages([...useLocalMessagesStore.getState().messages, userMessage, base])

      // Replace the assistant message by id (robust to ordering / later turns).
      const patch = (msg: ChatMessage): void => {
        setMessages(useLocalMessagesStore.getState().messages.map((m) => (m.id === assistantId ? msg : m)))
      }

      if (!store || !config) {
        patch({ ...base, content: { markdown: store ? "Set your API key first." : "No active board." }, streaming: false })
        await persist(label)
        return
      }

      const events: AgentEvent[] = []
      const render = (streaming: boolean): void => {
        patch({
          ...base,
          content: { markdown: latestAssistantText(events) },
          properties: { reasoning: { type: "reasoning", reasoning: stepsFromEvents(events, boardId) } },
          streaming,
        })
      }

      try {
        const llm = ByokLlmClient.fromConfig(config)
        for await (const ev of runAgent({ userMessage: prompt, tools: BUILD_TOOLS, llm, ctx: { store } })) {
          events.push(ev)
          render(true)
        }
        render(false)
      } catch (e) {
        events.push({ type: "assistant_text", text: e instanceof Error ? e.message : String(e) })
        render(false)
      } finally {
        await persist(label)
      }
    },
    [asConfig, setMessages, setChatUid, persist, boardId],
  )
}
