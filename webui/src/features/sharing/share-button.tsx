import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { ShareDialog } from "./share-dialog"


/**
 * "Share" button shown next to the save-status pill at the canvas
 * top-right. Visible only when the signed-in user's role on the
 * current board is `"owner"` — non-owner editors and viewers don't see it.
 *
 * Layout is owned by the host (`harness-canvas.tsx`) which places this
 * inside a flex container alongside `<HarnessSaveStatus>`.
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
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Share this board"
      >
        Share
      </Button>
      <ShareDialog
        boardId={boardId}
        boardLabel={boardLabel}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
