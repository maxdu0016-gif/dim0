import { useCallback } from "react"
import { generateUuid, trimText } from "@/lib/common"
import { getCanvasStoreRef } from "@/features/board/harness/canvas-store-ref"
import { arrangeCreatedNodes } from "@/features/board/harness/agent/arrange-created-nodes"
import { runAgent } from "@/features/agent/engine/agent-loop"
import { resolveAgentLlm } from "@/features/agent/engine/services/local-llm"
import { useIsSignedIn } from "@/lib/auth"
import { agentBuildTools, searchNotes } from "@/features/agent/engine/tools"
import { skillTools } from "@/features/agent/engine/skills"
import { getSearchIndexRef } from "@/features/board/search/search-index-ref"
import type { AgentEvent } from "@/features/agent/engine/types"
import { planSystemPrompt } from "@/features/agent/prompts"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { useLocalMessagesStore } from "@/features/agent/store/local-messages-store"
import type { ChatMessage } from "@/features/agent/types/chat"
import { agentLog } from "@/features/agent/engine/debug"
import { latestAssistantText, stepsFromEvents } from "./agent-event-to-step"
import { toLlmHistory } from "./chat-history"
import { maybeAutoLabelBoard } from "./describe-board"


// Note-building tools + full-text search + on-demand skill loaders.
const AGENT_TOOLS = [...agentBuildTools, searchNotes, ...skillTools]


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
  const signedIn = useIsSignedIn()
  const setMessages = useLocalMessagesStore((s) => s.setMessages)
  const setChatUid = useLocalMessagesStore((s) => s.setChatUid)
  const persist = useLocalMessagesStore((s) => s.persist)

  return useCallback(
    async (prompt: string): Promise<void> => {
      const store = getCanvasStoreRef()
      const config = asConfig()
      // The agent's LLM: BYOK if a key is set, else managed (our keys) when
      // signed in. Null only when signed out with no key.
      const llm = store ? resolveAgentLlm(config, { signedIn }) : null
      // Current folder layer at submit time — new notes are born here (not
      // rescoped after the fact). Read imperatively so it's always current.
      const rootId = useBoardAppStore.getState().rootId

      // Reuse the active chat, or mint one on the first turn.
      const existingUid = useLocalMessagesStore.getState().chatUid
      const isNewChat = !existingUid
      const chatUid = existingUid ?? generateUuid()
      if (isNewChat) setChatUid(chatUid)
      const label = isNewChat ? trimText(prompt, 40) : undefined

      // Prior turns become context (captured before the new turn is appended)
      // so the agent remembers the conversation.
      const history = toLlmHistory(useLocalMessagesStore.getState().messages)

      // Stamp creation time (mirrors backend Message.created_at) so the UI
      // shows a real timestamp instead of "Pending…".
      const createdAt = new Date().toISOString()
      const assistantId = mintId()
      const userMessage: ChatMessage = { id: mintId(), role: "user", content: { markdown: prompt }, chatUid, properties: {}, createdAt }
      const base: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: { markdown: "" },
        chatUid,
        properties: { reasoning: { type: "reasoning", reasoning: [] } },
        streaming: true,
        createdAt,
      }

      setMessages([...useLocalMessagesStore.getState().messages, userMessage, base])

      // Replace the assistant message by id (robust to ordering / later turns).
      const patch = (msg: ChatMessage): void => {
        setMessages(useLocalMessagesStore.getState().messages.map((m) => (m.id === assistantId ? msg : m)))
      }

      if (!store || !llm) {
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

      const createdNodeIds: string[] = []
      try {
        const system = planSystemPrompt(new Date().toLocaleString())
        const search = getSearchIndexRef() ?? undefined
        for await (const ev of runAgent({ system, userMessage: prompt, history, tools: AGENT_TOOLS, llm, ctx: { store, rootId, search } })) {
          events.push(ev)
          // Track notes created this turn so we can arrange them afterward.
          if (
            ev.type === "tool_result" &&
            (ev.toolName === "write_note" || ev.toolName === "create_note") &&
            ev.result && typeof ev.result === "object" && "id" in ev.result
          ) {
            createdNodeIds.push(String((ev.result as { id: unknown }).id))
          }
          render(true)
        }
        render(false)
        // Post-turn arrange (frontend analog of backend rearrange_created_notes).
        await arrangeCreatedNodes(store, createdNodeIds)
      } catch (e) {
        agentLog.error("runAgent", e)
        // Mark it as an error so it doesn't read like a normal answer.
        events.push({ type: "assistant_text", text: `⚠️ Agent error: ${e instanceof Error ? e.message : String(e)}` })
        render(false)
      } finally {
        await persist(label)
        const { chatUid: savedUid, messages } = useLocalMessagesStore.getState()
        agentLog.turnDone(savedUid, messages.length)
        // Auto-label a still-"Untitled" board from its first turn (fire-and-forget).
        void maybeAutoLabelBoard(boardId, messages, resolveAgentLlm(config, { signedIn }))
      }
    },
    [asConfig, signedIn, setMessages, setChatUid, persist, boardId],
  )
}
