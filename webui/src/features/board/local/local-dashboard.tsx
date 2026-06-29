import { useNavigate } from "@tanstack/react-router"
import { useLocalBoards } from "./use-local-boards"


/** Local-only board index — create / open / delete boards with no account. */
export function LocalDashboard() {
  const { boards, ready, createBoard, deleteBoard } = useLocalBoards()
  const navigate = useNavigate()

  const handleCreate = async (): Promise<void> => {
    const meta = await createBoard("Untitled board")
    if (meta) navigate({ to: "/local/$boardId", params: { boardId: meta.id } })
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Local boards</h1>
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background"
        >
          New board
        </button>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No boards yet — create one. No account needed.</p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {boards.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => navigate({ to: "/local/$boardId", params: { boardId: b.id } })}
                className="text-left text-sm hover:underline"
              >
                {b.title}
              </button>
              <button
                type="button"
                onClick={() => void deleteBoard(b.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
