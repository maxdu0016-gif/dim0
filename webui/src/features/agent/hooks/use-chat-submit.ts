import { useCallback } from "react"
import { toast } from "sonner"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { useLocalSubmitPrompt } from "@/features/agent/local/use-local-submit-prompt"
import { useSubmitPrompt } from "./use-submit-prompt"
import { useChat } from "./chat-context"


type SubmitOptions = {
  forceNewChat?: boolean
  attachedBoardId?: string
  preferChatRoute?: boolean
  messageContext?: string
  autoCreateBoard?: boolean
}


/**
 * Local-aware submit. Routes a prompt to the in-browser engine when the chat
 * is local, otherwise to the backend submit flow. Both underlying hooks are
 * always constructed (Rules of Hooks); only one runs per call. Backend-only
 * options (board creation, deep research) are ignored in local mode.
 */
export const useChatSubmit = () => {
  const { local } = useChat()
  const boardId = useBoardAppStore((s) => s.boardId) ?? ""
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const backendSubmit = useSubmitPrompt()
  const localSubmit = useLocalSubmitPrompt(boardId)

  return useCallback(
    async (text: string, options: SubmitOptions = {}): Promise<void> => {
      // The assistant edits the board, so it's edit-gated: a viewer (read-only
      // access to a shared board) can't run it. Local boards are always editable,
      // so this only ever blocks genuine viewers.
      if (!canEdit) {
        toast.error("You have view-only access to this board — ask an editor to run the assistant.")
        return
      }
      if (local) {
        // Forward the whole options object so submit-time inputs (e.g. the
        // selected-node messageContext) can't silently vanish at the seam; the
        // local hook consumes what applies and ignores backend-only fields.
        await localSubmit(text, options)
        return
      }
      await backendSubmit(text, options)
    },
    [local, canEdit, localSubmit, backendSubmit],
  )
}
