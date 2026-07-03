/**
 * In-memory relay for sync tests — a deterministic stand-in for the FastAPI/
 * Cloudflare relay, speaking the real wire protocol (`wire.ts`). It assigns a
 * monotonic per-board `seq`, keeps an op-log, acks the sender (`op-applied`),
 * fans ops out to peers (`peer-op`), answers `hello` with catch-up (`welcome`),
 * dedups by `batch.id` (idempotent replay), and rejects ops from viewers.
 *
 * `connect()` returns a `RelayConnection` — the same interface the real
 * WebSocket will implement — so the sync coordinator is exercised end-to-end.
 * Synchronous by design, so tests are deterministic and inspectable.
 */
import type { ClientId, OpBatch } from "@canvas-harness/core"
import type { InboundMessage, OutboundMessage, RelayConnection } from "@/features/board/harness/sync/wire"


type Conn = { canEdit: boolean; cb: ((m: InboundMessage) => void) | null }


export class MemoryRelay {
  private seq = 0
  /** The authoritative op-log (seq-ordered). Inspectable in tests. */
  readonly log: { seq: number; batch: OpBatch }[] = []
  private readonly conns = new Map<ClientId, Conn>()


  /** Current accepted-op count (the relay's monotonic seq). */
  get currentSeq(): number {
    return this.seq
  }


  /** Connect a client; returns a RelayConnection wired to this relay. */
  connect(clientId: ClientId, opts: { canEdit?: boolean } = {}): RelayConnection {
    const conn: Conn = { canEdit: opts.canEdit ?? true, cb: null }
    this.conns.set(clientId, conn)
    return {
      send: (msg) => this.handle(clientId, msg),
      onMessage: (cb) => {
        conn.cb = cb
        return () => {
          if (conn.cb === cb) conn.cb = null
        }
      },
      close: () => {
        this.conns.delete(clientId)
      },
    }
  }


  private deliver(clientId: ClientId, msg: InboundMessage): void {
    this.conns.get(clientId)?.cb?.(msg)
  }


  private broadcast(exceptId: ClientId, msg: InboundMessage): void {
    for (const [id, c] of this.conns) if (id !== exceptId) c.cb?.(msg)
  }


  private handle(clientId: ClientId, msg: OutboundMessage): void {
    const conn = this.conns.get(clientId)
    if (!conn) return

    switch (msg.kind) {
      case "op": {
        if (!conn.canEdit) {
          this.deliver(clientId, { kind: "op-rejected", client_seq: msg.client_seq, reason: "read-only" })
          return
        }
        // Idempotent: a replayed batch (same id) is acked at its original seq,
        // never re-logged or re-broadcast.
        const existing = this.log.find((e) => e.batch.id === msg.batch.id)
        if (existing) {
          this.deliver(clientId, { kind: "op-applied", seq: existing.seq, client_seq: msg.client_seq })
          return
        }
        this.seq += 1
        this.log.push({ seq: this.seq, batch: msg.batch })
        this.deliver(clientId, { kind: "op-applied", seq: this.seq, client_seq: msg.client_seq })
        this.broadcast(clientId, { kind: "peer-op", seq: this.seq, batch: msg.batch })
        return
      }
      case "hello": {
        // Catch-up: ops after `since_seq`, excluding the joiner's own (no self-echo).
        // Each carries its relay `seq` so the client can order it per-field LWW.
        const batches = this.log
          .filter((e) => e.seq > msg.since_seq && e.batch.clientId !== clientId)
          .map((e) => ({ seq: e.seq, batch: e.batch }))
        this.deliver(clientId, { kind: "welcome", seq: this.seq, batches })
        return
      }
      case "presence": {
        this.broadcast(clientId, { kind: "presence", clientId, state: msg.state })
        return
      }
    }
  }
}
