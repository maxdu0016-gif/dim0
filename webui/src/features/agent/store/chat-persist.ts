import { openDim0Db } from "@/features/board/persist/local/idb"
import type { ChatMessage } from "@/features/agent/types/chat"


// All messages for a chat: compound key [chatUid, id], so this range spans them.
const chatRange = (chatUid: string): IDBKeyRange =>
  IDBKeyRange.bound([chatUid, ""], [chatUid, "￿"])


/** Load a chat's persisted messages from IndexedDB (mirrors backend `get_messages`). */
export const loadMessages = async (chatUid: string): Promise<ChatMessage[]> => {
  const db = await openDim0Db()
  try {
    return await db.getAll("chat_messages", chatRange(chatUid))
  } finally {
    db.close()
  }
}


/**
 * Persist a chat's full transcript: replace its messages and stamp the chat
 * record, in one transaction. Mirrors the backend storing message objects —
 * minus embeddings (no RAG).
 */
export const saveMessages = async (chatUid: string, boardId: string, messages: ChatMessage[]): Promise<void> => {
  const db = await openDim0Db()
  try {
    const tx = db.transaction(["chat_messages", "chats"], "readwrite")
    await tx.objectStore("chat_messages").delete(chatRange(chatUid))
    for (const m of messages) {
      await tx.objectStore("chat_messages").put({ ...m, chatUid })
    }
    await tx.objectStore("chats").put({ id: chatUid, boardId, updatedAt: Date.now() })
    await tx.done
  } finally {
    db.close()
  }
}
