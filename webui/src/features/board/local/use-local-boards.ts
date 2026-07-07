import { useCallback, useEffect, useRef, useState } from "react"
import type { BoardMeta } from "@/features/board/model"
import { newLocalBoard } from "@/features/board/persist/local/board-registry"
import type { BoardRegistry } from "@/features/board/persist/local/board-registry"
import { requestPersistentStorage } from "@/features/board/persist/local/persist-storage"
import { getLocalStores } from "@/features/local-stores"


/** List/create/delete local-only boards via the shared BoardRegistry — offline, no account. */
export function useLocalBoards() {
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [ready, setReady] = useState(false)
  const registryRef = useRef<BoardRegistry | null>(null)

  useEffect(() => {
    void requestPersistentStorage()
    let cancelled = false
    void getLocalStores().then((stores) => {
      if (cancelled) return
      registryRef.current = stores.boards
      return stores.boards.listBoards().then((list) => {
        if (!cancelled) {
          setBoards(list)
          setReady(true)
        }
      })
    })
    // The engine is app-wide (owned by the composition root) — don't close it here.
    return () => {
      cancelled = true
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

  const renameBoard = useCallback(
    async (id: string, title: string): Promise<void> => {
      const registry = registryRef.current
      if (!registry) return
      await registry.renameBoard(id, title.trim() || "Untitled board")
      await refresh()
    },
    [refresh],
  )

  return { boards, ready, createBoard, deleteBoard, renameBoard, refresh }
}
