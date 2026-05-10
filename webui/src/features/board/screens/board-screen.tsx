import { BoardView } from "../components/board-view"
import { useParams, useSearch } from "@tanstack/react-router"
import { useGraphStore } from "../store/graph-store"
import { useEffect } from "react"
import { useActiveSurfaceFromUrl } from "../hooks/use-active-surface-from-url"


// Board screen — also serves the surface routes (/boards/:id/sheets/:noteId,
// /code-sandbox/:noteId, /widgets/:noteId) so a sub-page URL just mounts
// the canvas plus a dialog overlay.
export const BoardScreen = () => {
  // `strict: false` so we can read params regardless of which board-tree
  // route matched (board vs. sheet vs. code-sandbox vs. widget).
  const params = useParams({ strict: false }) as { id?: string }
  const boardId = params.id ?? ""
  const boardSearch = useSearch({
    strict: false,
    select: (s: { root_id?: string }) => ({ rootId: s?.root_id }),
  })
  const rootId = boardSearch?.rootId

  const setGraphScope = useGraphStore(state => state.setGraphScope)

  useEffect(() => {
    if (!boardId) return
    setGraphScope({ boardId, rootId })
  }, [boardId, rootId, setGraphScope])

  useActiveSurfaceFromUrl()

  return (
    <>
      <BoardView />
    </>
  )
}
