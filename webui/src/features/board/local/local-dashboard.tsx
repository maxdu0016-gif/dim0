import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AddIcon, CancelPlainIcon } from "@/components/icons"
import { ThemedWelcome } from "@/features/agent/components/chat/welcome-message"
import { UNTITLED_LABEL } from "@/features/board/const"
import type { BoardMeta } from "@/features/board/model"
import { formatDateForUI } from "@/features/board/utils/datetime"
import { useLocalBoards } from "./use-local-boards"


/**
 * Local-only board index — create / open / rename / delete boards with no
 * account, fully offline. Mirrors the backend dashboard's card grid but reads
 * the local registry and routes to `/local/$boardId`.
 */
export function LocalDashboard() {
  const { boards, ready, createBoard, deleteBoard, renameBoard } = useLocalBoards()
  const navigate = useNavigate()

  const open = (id: string): void => {
    void navigate({ to: "/local/$boardId", params: { boardId: id } })
  }

  const handleCreate = async (): Promise<void> => {
    const meta = await createBoard("Untitled board")
    if (meta) open(meta.id)
  }

  const sorted = [...boards].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

  return (
    <div className="w-full h-full">
      <div className="pt-8 pb-4">
        <ThemedWelcome name="Dog" message="Local Boards" />
      </div>

      <div className="mx-auto max-w-5xl p-4">
        <div
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 place-items-center"
          role="list"
          aria-label="Local boards"
        >
          <div className="w-full h-full flex justify-center items-center">
            <NewBoardCard onClick={() => void handleCreate()} />
          </div>

          {sorted.map((board) => (
            <div key={board.id} className="w-full h-full flex justify-center items-center">
              <LocalBoardCard
                board={board}
                onOpen={() => open(board.id)}
                onDelete={() => void deleteBoard(board.id)}
                onRename={(title) => void renameBoard(board.id, title)}
              />
            </div>
          ))}
        </div>

        {ready && sorted.length === 0 && (
          <div className="text-center mt-8 text-muted-foreground">
            No boards yet — create your first one above. No account needed.
          </div>
        )}
      </div>
    </div>
  )
}


/** A local board card: open on click, ✕ to delete (hover), double-click the title to rename. */
function LocalBoardCard({
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

      {/* Local boards have no thumbnail (capture is disabled offline). */}
      <div className="w-full h-40 bg-transparent rounded-md" />

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


/** The "new board" tile. */
function NewBoardCard({ onClick }: { onClick: () => void }) {
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
