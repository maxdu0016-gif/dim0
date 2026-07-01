/**
 * Functional chat-persistence helpers — thin wrappers over the shared `ChatRepo`.
 *
 * These keep the existing call sites stable while the storage logic lives in the
 * repo, now backed by the app-wide engine from the composition root (one shared
 * connection, no per-call opens).
 */
import { getLocalStores } from "@/features/local-stores"
import type { ChatMessage, LocalChat } from "@/features/agent/types/chat"


/** Load a chat's persisted messages in conversation order. */
export const loadMessages = async (chatUid: string): Promise<ChatMessage[]> =>
  (await getLocalStores()).chats.getMessages(chatUid)


/** Persist a chat's full transcript and stamp its record (optional label). */
export const saveMessages = async (
  chatUid: string,
  boardId: string,
  messages: ChatMessage[],
  label?: string,
): Promise<void> => {
  await (await getLocalStores()).chats.saveTranscript(chatUid, boardId, messages, label)
}


/** List a board's chats, most-recently-updated first. */
export const listLocalChats = async (boardId: string): Promise<LocalChat[]> =>
  (await getLocalStores()).chats.listByBoard(boardId)
