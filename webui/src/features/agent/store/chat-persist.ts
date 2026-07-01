/**
 * Functional chat-persistence helpers — thin wrappers over `ChatRepo`.
 *
 * These keep the existing call sites stable while the storage logic lives in the
 * repo. Each call opens a short-lived engine; the composition root (D.0 step 4)
 * will replace these with a shared engine + injected repo, at which point these
 * wrappers go away.
 */
import { IndexedDbEngine } from "@/features/board/persist/local/indexeddb-engine"
import type { ChatMessage, LocalChat } from "@/features/agent/types/chat"
import { ChatRepo } from "./chat-repo"


/** Run `fn` with a short-lived engine + repo, closing the engine afterwards. */
const withRepo = async <T>(fn: (repo: ChatRepo) => Promise<T>): Promise<T> => {
  const engine = await IndexedDbEngine.open()
  try {
    return await fn(new ChatRepo(engine))
  } finally {
    engine.close()
  }
}


/** Load a chat's persisted messages in conversation order. */
export const loadMessages = (chatUid: string): Promise<ChatMessage[]> =>
  withRepo((repo) => repo.getMessages(chatUid))


/** Persist a chat's full transcript and stamp its record (optional label). */
export const saveMessages = (
  chatUid: string,
  boardId: string,
  messages: ChatMessage[],
  label?: string,
): Promise<void> => withRepo((repo) => repo.saveTranscript(chatUid, boardId, messages, label))


/** List a board's chats, most-recently-updated first. */
export const listLocalChats = (boardId: string): Promise<LocalChat[]> =>
  withRepo((repo) => repo.listByBoard(boardId))
