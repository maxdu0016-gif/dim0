import { useState } from "react"
import { AddIcon, CancelPlainIcon } from "@/components/icons"
import { UNTITLED_LABEL } from "@/features/board/const"
import type { BoardMeta } from "@/features/board/model"
import { formatDateForUI } from "@/features/board/utils/datetime"


// Local-board card + "new" tile, rendered by the unified BoardsHome dashboard's
// "On this device" group. (The standalone LocalDashboard screen was folded into
// BoardsHome; these leaves stayed here since that's their only consumer.)


/** A local board card: open on click, ✕ to delete (hover), double-click the title to rename. */
export function LocalBoardCard({
  board,
  onOpen,
  onDelete,
  onRename,
}: {
  board: BoardMeta
  onOpen: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(board.title)
  const date = board.updatedAt ?? board.createdAt
  const dateString = date ? formatDateForUI(new Date(date).toISOString()) : null

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== board.title) onRename(next)
    else setDraft(board.title)
  }

  return (
    <div
      className="group relative w-64 h-60 flex flex-col justify-between gap-1 p-1 overflow-hidden rounded-xl bg-accent hover:bg-muted text-card-foreground border border-transparent hover:border-secondary-foreground hover:ring-2 hover:ring-secondary-foreground/50 shadow-md hover:shadow-lg transition-all cursor-pointer"
      onClick={() => !editing && onOpen()}
    >
      <button
        type="button"
        aria-label="Delete board"
        title="Delete board"
        className="absolute right-2 top-2 z-10 hidden rounded-md bg-background/80 p-1 text-muted-foreground shadow-sm hover:text-destructive group-hover:block"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <CancelPlainIcon className="size-3.5" strokeWidth={2} />
      </button>

      {board.thumbnail ? (
        <img
          src={board.thumbnail}
          alt={board.title || UNTITLED_LABEL}
          className="w-full h-40 object-cover rounded-md"
        />
      ) : (
        <div className="w-full h-40 bg-transparent rounded-md" />
      )}

      <div className="p-2 w-full overflow-ellipsis">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
              if (e.key === "Escape") {
                setDraft(board.title)
                setEditing(false)
              }
            }}
            className="w-full rounded border border-border bg-background px-1 py-0.5 text-sm"
          />
        ) : (
          <h4
            className="inline-block font-medium text-sm"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            title="Double-click to rename"
          >
            {board.title || UNTITLED_LABEL}
          </h4>
        )}
        {dateString && (
          <div className="w-full text-xs text-muted-foreground font-mono mt-1">
            <span className="ml-auto">{dateString}</span>
          </div>
        )}
      </div>
    </div>
  )
}


/** The "new local board" tile. */
export function NewLocalBoardCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="w-64 h-60 flex flex-col items-center justify-center gap-1 p-1 overflow-hidden rounded-xl bg-transparent hover:bg-accent text-card-foreground border-2 border-dashed border-border hover:border-secondary-foreground hover:ring-2 hover:ring-secondary-foreground/10 shadow-none hover:shadow-sm transition-all cursor-pointer"
      onClick={onClick}
    >
      <AddIcon className="shrink-0 size-6 text-secondary-foreground" strokeWidth={2} />
      <span className="font-medium text-sm text-secondary-foreground">New Board</span>
    </div>
  )
}
