import { getLocalStores } from "@/features/local-stores"
import { getWholeBoard } from "@/features/board/api/get-board"
import { graphToContent } from "@/features/board/harness/persist/snapshot-load"
import { BoardPersistence } from "./board-persistence"
import type { StorageEngine } from "./engine"
import type { OplogRecord, SnapshotRecord } from "./idb"


/**
 * Make a synced board available offline: fetch its WHOLE graph (all layers) and
 * seed it as the local base via `writeInitialBase`.
 *
 * Used both on first open (auto, from the sync coordinator — which passes its own
 * mounted `persistence` so there's a single writer) and by the on-demand
 * "download for offline" action (headless — creates a transient instance).
 *
 * Only seeds a **pristine** replica: it bails (no fetch) if a local snapshot
 * already exists or the oplog is non-empty, so it never overwrites edits and
 * never pays the whole-board fetch when it can't seed. `writeInitialBase` empty-
 * guards the result. Requires network (the fetch); a rejection means "couldn't
 * materialize" — callers treat it as best-effort.
 *
 * Returns whether a base was actually written.
 */
export async function materializeBoardOffline(
  boardId: string,
  opts: { engine?: StorageEngine; persistence?: BoardPersistence } = {},
): Promise<boolean> {
  const engine = opts.engine ?? (await getLocalStores()).engine

  // Bail before the network fetch when this replica can't/shouldn't be seeded.
  if (await engine.get<SnapshotRecord>("snapshots", boardId)) return false
  const oplog = await engine.list<OplogRecord>("oplog", {
    range: { lower: [boardId, 0], upper: [boardId, Number.MAX_SAFE_INTEGER] },
  })
  if (oplog.length > 0) return false

  const graph = await getWholeBoard(boardId)
  // Reuse the coordinator's mounted, already-loaded persistence when given (one
  // writer, its append-queue serializes with the seed); else a transient one for
  // a headless download — safe because the pre-checks above proved it pristine.
  const persistence = opts.persistence ?? new BoardPersistence(boardId, { engine })
  return persistence.writeInitialBase(() => graphToContent(graph))
}
