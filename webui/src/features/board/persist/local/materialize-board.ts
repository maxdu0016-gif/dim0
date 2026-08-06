import { getLocalStores } from "@/features/local-stores"
import { getWholeBoard } from "@/features/board/api/get-board"
import { graphToContent } from "@/features/board/harness/persist/snapshot-load"
import { BoardPersistence } from "./board-persistence"
import type { StorageEngine } from "./engine"
import type { OplogRecord, SnapshotRecord } from "./idb"


/**
 * Make a synced board available offline: fetch its WHOLE graph (all layers) and
 * write it as the local base.
 *
 * Used both on first open (auto, from the sync coordinator — which passes its own
 * mounted `persistence` so there's a single writer) and by the on-demand
 * "download for offline" action (headless — creates a transient instance).
 *
 * Seeds whenever the replica is **fully synced** (no snapshot yet, and no UNSENT
 * local edit in the oplog): every oplog entry then is an acked-local or remote
 * op, so it's already in the server's whole-board fetch, and the fetch is the
 * complete truth. We write it as the base and fold the (redundant) oplog away.
 * It only bails when there's an unsent local edit — truncating that would lose an
 * edit not yet on the server; that case waits on the serverSeq follow-up. (This
 * is the fix for "an edited synced board can never go offline": a non-empty but
 * all-acked oplog no longer blocks it.) Requires network (the fetch); a rejection
 * means "couldn't materialize" — callers treat it as best-effort.
 *
 * Concurrent calls for the same board (e.g. the coordinator's auto-seed on open
 * racing an on-demand "download" click) share one in-flight run, so the whole
 * board is fetched at most once. Returns whether a base was actually written.
 */
export function materializeBoardOffline(
  boardId: string,
  opts: { engine?: StorageEngine; persistence?: BoardPersistence } = {},
): Promise<boolean> {
  const running = inFlight.get(boardId)
  if (running) return running
  const run = doMaterialize(boardId, opts).finally(() => inFlight.delete(boardId))
  inFlight.set(boardId, run)
  return run
}


/** De-dupes concurrent materialize runs per board (see `materializeBoardOffline`). */
const inFlight = new Map<string, Promise<boolean>>()


async function doMaterialize(
  boardId: string,
  opts: { engine?: StorageEngine; persistence?: BoardPersistence },
): Promise<boolean> {
  const engine = opts.engine ?? (await getLocalStores()).engine

  // Already have a base → nothing to do.
  if (await engine.get<SnapshotRecord>("snapshots", boardId)) return false
  const oplog = await engine.list<OplogRecord>("oplog", {
    range: { lower: [boardId, 0], upper: [boardId, Number.MAX_SAFE_INTEGER] },
  })
  // Defer if any local edit is still unsent (no serverSeq): it isn't in the
  // server's whole-board fetch, so folding it away below would drop it. Remote
  // ops and acked-local ops are on the server → safe to fold. Pending unflushed
  // edits aren't in this read; they land at a seq above `uptoSeq` and survive.
  const hasUnsentLocal = oplog.some((e) => e.batch.origin !== "remote" && e.serverSeq === undefined)
  if (hasUnsentLocal) return false

  const graph = await getWholeBoard(boardId)
  // Reuse the coordinator's mounted, already-loaded persistence when given (one
  // writer); else a transient one for a headless download.
  const persistence = opts.persistence ?? new BoardPersistence(boardId, { engine })
  // Write the fetch as the base and truncate the oplog up to the max seq we saw
  // — those entries are all on the server (in the fetch), so folding them away
  // neither loses nor double-applies. Entries appended during the fetch (seq >
  // uptoSeq) survive and replay on top. Empty oplog → seq 0, truncates nothing.
  const uptoSeq = oplog.length > 0 ? oplog[oplog.length - 1].seq : 0
  await persistence.foldBase(graphToContent(graph), uptoSeq)
  return true
}
