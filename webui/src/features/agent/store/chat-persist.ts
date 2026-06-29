import { openDim0Db, type ChatRecord } from "@/features/board/persist/local/idb"
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
 * record (with an optional label), in one transaction. Mirrors the backend
 * storing message objects — minus embeddings (no RAG).
 */
export const saveMessages = async (
  chatUid: string,
  boardId: string,
  messages: ChatMessage[],
  label?: string,
): Promise<void> => {
  const db = await openDim0Db()
  try {
    const tx = db.transaction(["chat_messages", "chats"], "readwrite")
    await tx.objectStore("chat_messages").delete(chatRange(chatUid))
    for (const m of messages) {
      await tx.objectStore("chat_messages").put({ ...m, chatUid })
    }
    // Preserve an existing label when none is supplied this save.
    const prev = await tx.objectStore("chats").get(chatUid)
    await tx.objectStore("chats").put({ id: chatUid, boardId, label: label ?? prev?.label, updatedAt: Date.now() })
    await tx.done
  } finally {
    db.close()
  }
}


/** List a board's chats, most-recently-updated first (mirrors backend `list_chats`). */
export const listLocalChats = async (boardId: string): Promise<ChatRecord[]> => {
  const db = await openDim0Db()
  try {
    const chats = await db.getAllFromIndex("chats", "by-board", boardId)
    return chats.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}
