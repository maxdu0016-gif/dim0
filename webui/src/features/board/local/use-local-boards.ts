import { useCallback, useEffect, useRef, useState } from "react"
import type { BoardMeta } from "@/features/board/model"
import { BoardRegistry, newLocalBoard } from "@/features/board/persist/local/board-registry"
import { requestPersistentStorage } from "@/features/board/persist/local/persist-storage"


/** List/create/delete local-only boards via BoardRegistry — no account, offline. */
export function useLocalBoards() {
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [ready, setReady] = useState(false)
  const registryRef = useRef<BoardRegistry | null>(null)

  useEffect(() => {
    void requestPersistentStorage()
    const registry = new BoardRegistry()
    registryRef.current = registry
    let cancelled = false
    void registry
      .init()
      .then(() => registry.listBoards())
      .then((list) => {
        if (!cancelled) {
          setBoards(list)
          setReady(true)
        }
      })
    return () => {
      cancelled = true
      registry.close()
      registryRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    const registry = registryRef.current
    if (registry) setBoards(await registry.listBoards())
  }, [])

  const createBoard = useCallback(
    async (title: string): Promise<BoardMeta | null> => {
      const registry = registryRef.current
      if (!registry) return null
      const meta = newLocalBoard(title.trim() || "Untitled board", Date.now())
      await registry.createBoard(meta)
      await refresh()
      return meta
    },
    [refresh],
  )

  const deleteBoard = useCallback(
    async (id: string): Promise<void> => {
      const registry = registryRef.current
      if (!registry) return
      await registry.deleteBoard(id)
      await refresh()
    },
    [refresh],
  )

  return { boards, ready, createBoard, deleteBoard }
}
