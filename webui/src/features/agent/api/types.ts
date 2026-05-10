import type { Chat } from "../types/chat"
import type { LlmModel } from "../types/llm"
import type { ToolName } from "../types/stream"
import type { WebSearchEngine } from "../types/web"


/**
 * Request payload for sending a message.
 */
export interface SendMessageRequestPayload {
  query: string
  messageId: string
  rootId?: string
  /**
   * When set, the user is editing this note when they hit send. Used by
   * the agent as a hint about which page is currently active so it can
   * scope retrieval / edits to that note.
   */
  attachedNoteId?: string
  model: LlmModel
  webSearchEngine: WebSearchEngine
  enabledTools?: ToolName[]
  useDeepResearch?: boolean
  messageContext?: string
}


/**
 * Response type for sending a message.
 */
export interface VoidSuccessResponse {
  success: boolean
}


/**
 * Response type for listing chats.
 */
export interface ListChatsResponse extends VoidSuccessResponse {
  data: {
    chats: Chat[]
  }
}
