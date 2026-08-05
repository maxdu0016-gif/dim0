import { getLocalStores } from "@/features/local-stores"
import { getWholeBoard } from "@/features/board/api/get-board"
import { graphToContent } from "@/features/board/harness/persist/snapshot-load"
import { BoardPersistence } from "./board-persistence"
import type { SnapshotRecord } from "./idb"


/**
 * Make a synced board available offline: fetch its WHOLE graph (all layers) and
 * seed it as the local base via `writeInitialBase`.
 *
 * Used both on first open (auto, from the sync coordinator) and by the on-demand
 * "download for offline" action. Idempotent and cheap when already offline — a
 * pre-check skips the whole-board fetch if a local snapshot already exists. For a
 * board that has an oplog but no base (rare), `load()` syncs the seq cursor so
 * `writeInitialBase`'s pristine guard is accurate (a fresh instance would report
 * seq 0 and could double-apply over existing local edits).
 *
 * Requires network (the whole-board fetch); a rejection means "couldn't
 * materialize" — callers treat it as best-effort. Returns whether a base was
 * written.
 */
export async function materializeBoardOffline(boardId: string): Promise<boolean> {
  const { engine } = await getLocalStores()
  // Fast path: a local base already exists → offline-ready, skip the fetch.
  if (await engine.get<SnapshotRecord>("snapshots", boardId)) return false

  const persistence = new BoardPersistence(boardId, { engine })
  await persistence.load() // sync the seq cursor for writeInitialBase's guard
  const graph = await getWholeBoard(boardId)
  await persistence.writeInitialBase(() => graphToContent(graph))
  return true
}
