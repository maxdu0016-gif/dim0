import { AssistantMessage } from "@/features/agent/components/chat/assistant-message"
import { UserMessage } from "@/features/agent/components/chat/user-message"
import { useLocalMessages } from "./use-local-messages"


/**
 * Local twin of `Conversation` — reuses the rich message renderers
 * (`AssistantMessage` → reasoning steps → tool cards, `UserMessage`) but reads
 * from the local message store instead of the backend (`useListMessages`).
 * Must render inside a `ChatProvider` (tool-step-row uses `useChat`).
 */
export function LocalConversation() {
  const messages = useLocalMessages()
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id

  return (
    <div className="flex flex-col items-end gap-1">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} message={m} isLatest={m.id === lastUserId} />
        ) : m.role === "assistant" ? (
          <AssistantMessage key={m.id} message={m} />
        ) : null,
      )}
    </div>
  )
}
