import type { BoardMeta } from "@/features/board/model"
import type { BoardListItem } from "@/features/board/api/list-boards"


export type PartitionedBoards = {
  onDevice: BoardMeta[]
  synced: BoardListItem[]
}


/**
 * Split the two board sources into the dashboard's groups, newest first.
 *
 * A promoted board lives in BOTH the local registry (its replica) and the
 * backend list; it must render once, under "Synced". So any local board whose
 * id appears in the synced list is dropped from "On this device" — the synced
 * list is authoritative for it. `synced` may be undefined (signed out / not yet
 * loaded), in which case every local board shows on-device.
 */
export const partitionBoards = (
  local: BoardMeta[],
  synced: BoardListItem[] | undefined,
): PartitionedBoards => {
  const syncedList = synced ?? []
  const syncedIds = new Set(syncedList.map((b) => b.uid))
  const onDevice = local
    .filter((b) => !syncedIds.has(b.id))
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
