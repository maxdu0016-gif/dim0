import type { BoardMeta } from "@/features/board/model"
import type { BoardListItem } from "@/features/board/api/list-boards"


export type PartitionedBoards = {
  onDevice: BoardMeta[]
  synced: BoardListItem[]
}


/**
 * Split the two board sources into the dashboard's groups, newest first.
 *
 * A promoted board lives in BOTH the local registry (its replica, now flagged
 * `kind: "synced"` and owned by a user) and the backend list; it must render
 * once, under "Synced". "On this device" is therefore local-only boards whose
 * id is NOT in the synced list — two independent guards:
 *  - `kind === "local-only"` keeps a promoted replica out even when the synced
 *    list is empty (signed out, or a different account) — otherwise a board that
 *    belongs to a user account leaks into the logged-out local view.
 *  - the id/uid exclusion covers the window where the backend already adopted the
 *    board but the local `kind` flip hasn't landed yet (avoids a transient double).
 */
export const partitionBoards = (
  local: BoardMeta[],
  synced: BoardListItem[] | undefined,
): PartitionedBoards => {
  const syncedList = synced ?? []
  const syncedIds = new Set(syncedList.map((b) => b.uid))
  const onDevice = local
    .filter((b) => b.kind === "local-only" && !syncedIds.has(b.id))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  const sortedSynced = [...syncedList].sort(
    (a, b) => syncedTime(b) - syncedTime(a),
  )
  return { onDevice, synced: sortedSynced }
}


/** Epoch ms for a synced board's sort key (ISO strings from the backend). */
const syncedTime = (b: BoardListItem): number => {
  const raw = b.updatedAt ?? b.createdAt
  return raw ? new Date(raw).getTime() : 0
}
