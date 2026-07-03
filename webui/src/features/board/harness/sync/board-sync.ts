/**
 * Board sync coordinator (E1.3) — the offline-first client.
 *
 * Ties the live store, local persistence, the outbox, and a `RelayConnection`
 * into one loop:
 *   - local edits are persisted (outbox) and pumped to the relay when connected;
 *   - the relay's `op-applied` advances the durable synced cursor and stamps the
 *     batch's `serverSeq` (its position in the shared total order);
 *   - `peer-op` / `welcome` batches are persisted (`recordRemote`, with their
 *     relay `seq`) and applied via a rebase (see below), so a reload reconstructs
 *     the converged state;
 *   - on reconnect the outbox replays (idempotent at the relay by `batch.id`) and
 *     `hello { since_seq }` fetches missed remote ops.
 *
 * Conflict resolution (E1.4) — server-sequenced per-field LWW. A remote op isn't
 * applied naively: local edits are applied optimistically, so arrival order can
 * differ from relay order. We *rebase* — undo the unacked local batches, apply
 * the remote op onto the confirmed base, then replay the local batches on top —
 * so a local edit always lands after (higher seq than) everything it hasn't yet
 * been sequenced against. Combined with `serverSeq`-ordered replay at load, live
 * and reloaded state converge identically. A referential-integrity pass then
 * drops any edge left dangling by a concurrent node delete.
 *
 * The send source is the outbox, not `attachSync.sendBatch` (which only pumps) —
 * so a batch is only ever sent with a known oplog seq, and acks map cleanly to
 * the cursor. Transport-agnostic: the same code runs against the in-memory relay
 * (tests) and the real WebSocket (E1.5).
 */
import { attachSync, inverseBatch } from "@canvas-harness/core"
import type {
  CanvasStore,
  ClientId,
  OpBatch,
  PresencePatch,
  PresenceState,
  SyncAdapter,
} from "@canvas-harness/core"
import { BoardOutbox } from "@/features/board/persist/local/board-outbox"
import type { BoardPersistence } from "@/features/board/persist/local/board-persistence"
import type { StorageEngine } from "@/features/board/persist/local/engine"
import { pruneDanglingEdges } from "@/features/board/persist/local/integrity"
import type { InboundMessage, RelayConnection } from "./wire"


export type BoardSyncOptions = {
  store: CanvasStore
  /** Already attached to `store` by the caller (records local batches). */
  persistence: BoardPersistence
  engine: StorageEngine
  boardId: string
  clientId: ClientId
  /** Opens a fresh connection to the relay (called on attach + each reconnect). */
  connect: () => RelayConnection
}


export type BoardSyncHandle = {
  /** Detach sync + persistence wiring and close the connection. */
  detach: () => void
  /** Simulate going offline (close connection; keep editing locally). */
  disconnect: () => void
  /** Reconnect: replay the outbox and catch up on missed remote ops. */
  reconnect: () => void
  /** Resolve once all queued async work (persist, ack, pump) has settled. */
  settle: () => Promise<void>
}


/** Wire a board's store to the relay with an offline-durable outbox. */
export const attachBoardSync = (opts: BoardSyncOptions): BoardSyncHandle => {
  const outbox = new BoardOutbox(opts.engine, opts.boardId)
  const presenceListeners = new Set<(id: ClientId, s: PresenceState | null) => void>()

  let connection: RelayConnection | null = null
  let clientSeq = 0
  let lastServerSeq = 0
  const inFlight = new Map<number, { seq: number; batchId: string }>() // client_seq → oplog seq + batch id
  const rejected = new Set<number>() // oplog seqs the relay refused (don't resend)
  // Unacked local batches, in commit order — the rebase set (applied on top of
  // every remote op so local edits stay "latest"). Keyed by batch id; Map keeps
  // insertion order for undo (reverse) / replay (forward).
  const pending = new Map<string, OpBatch>()

  // Serialize async work so `settle()` can await a quiescent state in tests.
  let work: Promise<void> = Promise.resolve()
  const enqueue = (fn: () => Promise<void> | void): void => {
    work = work.then(fn)
  }

  /**
   * Apply a relay batch via rebase: undo unacked local ops, apply the remote op
   * onto the confirmed base, replay the local ops on top, prune dangling edges,
   * then persist the remote op with its `serverSeq`. All store writes use
   * `origin: "remote"` so nothing echoes back to the relay or re-persists.
   */
  const applyRemote = (batch: OpBatch, serverSeq: number): void => {
    const pend = [...pending.values()]
    for (let i = pend.length - 1; i >= 0; i--) {
      opts.store.applyBatch({ ...pend[i], ops: inverseBatch(pend[i]), origin: "remote" })
    }
    opts.store.applyBatch({ ...batch, origin: "remote" })
    for (const p of pend) opts.store.applyBatch({ ...p, origin: "remote" })
    pruneDanglingEdges(opts.store)
    enqueue(() => opts.persistence.recordRemote(batch, serverSeq)) // durable across reload
  }

  /**
   * Roll back a rejected local batch: undo all unacked local ops, drop the
   * rejected one, replay the rest (same rebase machinery), so the optimistic
   * edit disappears while other pending edits are preserved. Store writes use
   * `origin: "remote"` so nothing re-sends or re-persists.
   */
  const rollbackPending = (batchId: string): void => {
    const pend = [...pending.values()]
    for (let i = pend.length - 1; i >= 0; i--) {
      opts.store.applyBatch({ ...pend[i], ops: inverseBatch(pend[i]), origin: "remote" })
    }
    pending.delete(batchId)
    for (const p of pending.values()) opts.store.applyBatch({ ...p, origin: "remote" })
    pruneDanglingEdges(opts.store)
  }

  const pump = async (): Promise<void> => {
    if (!connection) return
    await opts.persistence.flush() // ensure fresh local edits are in the oplog
    const unacked = await outbox.pending()
    const inFlightSeqs = new Set([...inFlight.values()].map((r) => r.seq))
    for (const rec of unacked) {
      if (rejected.has(rec.seq) || inFlightSeqs.has(rec.seq)) continue
      clientSeq += 1
      inFlight.set(clientSeq, { seq: rec.seq, batchId: rec.batch.id })
      inFlightSeqs.add(rec.seq)
      connection.send({ kind: "op", client_seq: clientSeq, batch: rec.batch })
    }
  }

  const handle = (msg: InboundMessage): void => {
    switch (msg.kind) {
      case "welcome":
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        for (const b of msg.batches) applyRemote(b.batch, b.seq)
        enqueue(pump)
        break
      case "peer-op":
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        applyRemote(msg.batch, msg.seq)
        break
      case "op-applied": {
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        const rec = inFlight.get(msg.client_seq)
        inFlight.delete(msg.client_seq)
        if (rec) {
          pending.delete(rec.batchId) // acked → no longer rebased on top
          enqueue(async () => {
            await outbox.markSyncedTo(rec.seq)
            await opts.persistence.setServerSeq(rec.seq, msg.seq) // reload replays in relay order
          })
        }
        break
      }
      case "op-rejected": {
        const rec = inFlight.get(msg.client_seq)
        inFlight.delete(msg.client_seq)
        if (rec) {
          rejected.add(rec.seq) // don't resend a refused op
          if (pending.has(rec.batchId)) rollbackPending(rec.batchId) // revert optimistic edit
          enqueue(() => opts.persistence.removeBatch(rec.seq)) // don't resurrect on reload
        }
        break
      }
      case "presence":
        for (const cb of presenceListeners) cb(msg.clientId, msg.state)
        break
    }
  }

  const openConnection = (): void => {
    connection = opts.connect()
    connection.onMessage(handle)
    connection.send({ kind: "hello", clientId: opts.clientId, since_seq: lastServerSeq })
    enqueue(pump)
  }

  const adapter: SyncAdapter = {
    capabilities: { causalOrdering: true },
    // A local commit: track it as unacked (rebase set) and trigger a pump. The
    // send source is the outbox, so the batch itself is only used for rebase.
    sendBatch: (batch: OpBatch) => {
      pending.set(batch.id, batch)
      enqueue(pump)
    },
    sendPresence: (patch: PresencePatch) => {
      const state = { ...patch, clientId: opts.clientId } as PresenceState
      connection?.send({ kind: "presence", clientId: opts.clientId, state })
    },
    // Remote batches are applied by `applyRemote` (rebase), not through this cb —
    // attachSync's default apply is intentionally left unwired.
    onBatch: () => () => {},
    onPresence: (cb) => {
      presenceListeners.add(cb)
      return () => presenceListeners.delete(cb)
    },
  }

  const detachSync = attachSync(opts.store, adapter)
  openConnection()

  return {
    detach: () => {
      detachSync()
      connection?.close()
      connection = null
    },
    disconnect: () => {
      connection?.close()
      connection = null
      inFlight.clear() // un-acked ops re-pump on reconnect
    },
    reconnect: openConnection,
    settle: async () => {
      // Drain until the work chain stops growing (acks/pumps enqueue more work).
      let seen: Promise<void>
      do {
        seen = work
        await seen
      } while (seen !== work)
      await opts.persistence.flush() // make recordRemote'd batches durable
    },
  }
}
