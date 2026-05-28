import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { ShareDialog } from "./share-dialog"


/**
 * Floating "Share" button that mounts in the top-right of the canvas.
 * Visible only when the signed-in user's role on the current board
 * is `"owner"` — non-owner editors and viewers shouldn't see it.
 */
export function ShareButton() {
  const boardId = useBoardAppStore((s) => s.boardId)
  const boardRole = useBoardAppStore((s) => s.boardRole)
  const boardLabel = useBoardAppStore((s) => s.boardLabel)
  const presentationMode = useBoardAppStore((s) => s.presentationMode)
  const [open, setOpen] = useState(false)

  if (!boardId) return null
  if (boardRole !== "owner") return null
  if (presentationMode) return null

  return (
    <>
      <div className="absolute right-3 top-3 z-40">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label="Share this board"
        >
          Share
        </Button>
      </div>
      <ShareDialog
        boardId={boardId}
        boardLabel={boardLabel}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
