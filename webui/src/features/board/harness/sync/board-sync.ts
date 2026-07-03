/**
 * Board sync coordinator (E1.3) — the offline-first client.
 *
 * Ties the live store, local persistence, the outbox, and a `RelayConnection`
 * into one loop:
 *   - local edits are persisted (outbox) and pumped to the relay when connected;
 *   - the relay's `op-applied` advances the durable synced cursor;
 *   - `peer-op` / `welcome` batches are persisted (`recordRemote`) and applied to
 *     the store as `remote` (via `attachSync`), so a reload reconstructs the
 *     converged state;
 *   - on reconnect the outbox replays (idempotent at the relay by `batch.id`) and
 *     `hello { since_seq }` fetches missed remote ops.
 *
 * The send source is the outbox, not `attachSync.sendBatch` (which only pumps) —
 * so a batch is only ever sent with a known oplog seq, and acks map cleanly to
 * the cursor. Transport-agnostic: the same code runs against the in-memory relay
 * (tests) and the real WebSocket (E1.5).
 */
import { attachSync } from "@canvas-harness/core"
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
  const batchListeners = new Set<(b: OpBatch) => void>()
  const presenceListeners = new Set<(id: ClientId, s: PresenceState | null) => void>()

  let connection: RelayConnection | null = null
  let clientSeq = 0
  let lastServerSeq = 0
  const inFlight = new Map<number, number>() // client_seq → oplog seq (awaiting ack)
  const rejected = new Set<number>() // oplog seqs the relay refused (don't resend)

  // Serialize async work so `settle()` can await a quiescent state in tests.
  let work: Promise<void> = Promise.resolve()
  const enqueue = (fn: () => Promise<void> | void): void => {
    work = work.then(fn)
  }

  const applyRemote = (batch: OpBatch): void => {
    enqueue(() => opts.persistence.recordRemote(batch)) // persist (durable across reload)
    for (const cb of batchListeners) cb(batch) // apply to store as `remote` via attachSync
  }

  const pump = async (): Promise<void> => {
    if (!connection) return
    await opts.persistence.flush() // ensure fresh local edits are in the oplog
    const pending = await outbox.pending()
    const inFlightSeqs = new Set(inFlight.values())
    for (const rec of pending) {
      if (rejected.has(rec.seq) || inFlightSeqs.has(rec.seq)) continue
      clientSeq += 1
      inFlight.set(clientSeq, rec.seq)
      inFlightSeqs.add(rec.seq)
      connection.send({ kind: "op", client_seq: clientSeq, batch: rec.batch })
    }
  }

  const handle = (msg: InboundMessage): void => {
    switch (msg.kind) {
      case "welcome":
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        for (const b of msg.batches) applyRemote(b)
        enqueue(pump)
        break
      case "peer-op":
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        applyRemote(msg.batch)
        break
      case "op-applied": {
        lastServerSeq = Math.max(lastServerSeq, msg.seq)
        const seq = inFlight.get(msg.client_seq)
        inFlight.delete(msg.client_seq)
        if (seq !== undefined) enqueue(() => outbox.markSyncedTo(seq))
        break
      }
      case "op-rejected": {
        const seq = inFlight.get(msg.client_seq)
        inFlight.delete(msg.client_seq)
        if (seq !== undefined) rejected.add(seq) // don't resend a refused op
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
    // Send source is the outbox; a local edit just triggers a pump.
    sendBatch: () => enqueue(pump),
    sendPresence: (patch: PresencePatch) => {
      const state = { ...patch, clientId: opts.clientId } as PresenceState
      connection?.send({ kind: "presence", clientId: opts.clientId, state })
    },
    onBatch: (cb) => {
      batchListeners.add(cb)
      return () => batchListeners.delete(cb)
    },
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
