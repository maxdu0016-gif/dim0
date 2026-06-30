import { useCallback } from "react"
import { generateUuid, trimText } from "@/lib/common"
import { getCanvasStoreRef } from "@/features/board/harness/canvas-store-ref"
import { runAgent } from "@/features/agent/engine/agent-loop"
import { ByokLlmClient } from "@/features/agent/engine/byok-client"
import { agentBuildTools } from "@/features/agent/engine/tools"
import { skillTools } from "@/features/agent/engine/skills"
import type { AgentEvent } from "@/features/agent/engine/types"
import { planSystemPrompt } from "@/features/agent/prompts"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import type { ChatMessage } from "@/features/agent/types/chat"
import { agentLog } from "@/features/agent/engine/debug"
import { latestAssistantText, stepsFromEvents } from "./agent-event-to-step"
import { toLlmHistory } from "./chat-history"


// Note-building tools + on-demand skill loaders (search/list land in C/D).
const AGENT_TOOLS = [...agentBuildTools, ...skillTools]


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

      // Prior turns become context (captured before the new turn is appended)
      // so the agent remembers the conversation.
      const history = toLlmHistory(useLocalMessagesStore.getState().messages)

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
        const system = planSystemPrompt(new Date().toLocaleString())
        for await (const ev of runAgent({ system, userMessage: prompt, history, tools: AGENT_TOOLS, llm, ctx: { store } })) {
          events.push(ev)
          render(true)
        }
        render(false)
      } catch (e) {
        agentLog.error("runAgent", e)
        // Mark it as an error so it doesn't read like a normal answer.
        events.push({ type: "assistant_text", text: `⚠️ Agent error: ${e instanceof Error ? e.message : String(e)}` })
        render(false)
      } finally {
        await persist(label)
      }
    },
    [asConfig, setMessages, setChatUid, persist, boardId],
  )
}
