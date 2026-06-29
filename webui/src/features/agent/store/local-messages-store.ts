import { create } from "zustand"
import type { ChatMessage } from "@/features/agent/types/chat"
import { loadMessages, saveMessages } from "./chat-persist"


type LocalMessagesState = {
  chatUid: string | null
  boardId: string | null
  messages: ChatMessage[]
  /** Load a chat's persisted history from IndexedDB. */
  open: (chatUid: string, boardId: string) => Promise<void>
  /** In-memory update (drives streaming render); call `persist` to save. */
  setMessages: (messages: ChatMessage[]) => void
  /** Write the current transcript to IndexedDB. */
  persist: () => Promise<void>
  reset: () => void
}


/**
 * Local chat transcript, backed by IndexedDB (mirrors the backend's persisted
 * messages). In-memory mirror drives the UI during streaming; `persist` writes
 * the turn so history survives reloads.
 */
export const useLocalMessagesStore = create<LocalMessagesState>((set, get) => ({
  chatUid: null,
  boardId: null,
  messages: [],

  open: async (chatUid, boardId) => {
    set({ chatUid, boardId, messages: [] })
    const messages = await loadMessages(chatUid)
    // Guard against a newer open() racing this load.
    if (get().chatUid === chatUid) set({ messages })
  },

  setMessages: (messages) => set({ messages }),

  persist: async () => {
    const { chatUid, boardId, messages } = get()
    if (chatUid && boardId) await saveMessages(chatUid, boardId, messages)
  },

  reset: () => set({ chatUid: null, boardId: null, messages: [] }),
}))
