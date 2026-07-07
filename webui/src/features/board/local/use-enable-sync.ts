import { useCallback, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAppStore } from "@/store"
import { getLocalStores } from "@/features/local-stores"
import { BoardPersistence } from "@/features/board/persist/local/board-persistence"
import { adoptBoard } from "@/features/board/api/adopt-board"
import { enableSync } from "@/features/board/harness/sync/enable-sync"
import type { EnableSyncResult } from "@/features/board/harness/sync/enable-sync"


/**
 * Promote a local board to synced (local → synced) from the dashboard.
 *
 * Wires the real deps to the `enableSync` orchestrator: a fresh BoardPersistence
 * for the snapshot + compaction, the adopt API, and the registry flip. Signed-out
 * users are routed to sign-in (a synced board needs an owner). On success it
 * invalidates the synced-board list so the card moves into the "Synced" group.
 * `pendingId` is the board mid-promotion (for a spinner / disabled state).
 */
export function useEnableSync() {
  const userId = useAppStore((s) => s.userId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const run = useCallback(
    async (boardId: string, label?: string): Promise<EnableSyncResult> => {
      if (!userId) {
        void navigate({ to: "/signin" })
        return { ok: false, reason: "signed-out" }
      }
      setPendingId(boardId)
      const stores = await getLocalStores()
      const persistence = new BoardPersistence(boardId, { engine: stores.engine })
      try {
        const result = await enableSync(boardId, {
          signedIn: true,
          ownerId: userId,
          loadContent: () => persistence.load(),
          adopt: (ops) => adoptBoard(boardId, ops, label).then(() => undefined),
          compact: () => persistence.compact(),
          markSynced: (ownerId) =>
            stores.boards.markSynced(boardId, { syncEngine: "v2", ownerId }),
        })
        if (result.ok) {
          await queryClient.invalidateQueries({ queryKey: ["listBoards", userId] })
          toast.success("Sync enabled — this board is now backed up and shareable.")
        } else {
          toast.error("Couldn't enable sync. Please try again.")
        }
        return result
      } finally {
        persistence.close()
        setPendingId(null)
      }
    },
    [userId, navigate, queryClient],
  )

  return { enableSync: run, pendingId }
}
