/**
 * Sync wire protocol — the transport-agnostic contract between a client and the
 * relay. A `RelayConnection` is anything that can carry these messages: the
 * in-memory relay (tests) and the real WebSocket (E1.5) both implement it, so the
 * sync coordinator is written once and runs against either.
 *
 * A focused subset of the production protocol (enough for offline convergence);
 * snapshot-in-welcome, presence-leave and kick land with the real transport.
 */
import type { ClientId, OpBatch, PresenceState, Unsubscribe } from "@canvas-harness/core"


export type OutboundMessage =
  | { kind: "op"; client_seq: number; batch: OpBatch }
  | { kind: "hello"; clientId: ClientId; since_seq: number }
  | { kind: "presence"; clientId: ClientId; state: PresenceState }


/** A relay-sequenced batch (its position in the shared total order). */
export type SeqBatch = { seq: number; batch: OpBatch }


export type InboundMessage =
  | { kind: "welcome"; seq: number; batches: SeqBatch[] }
  | { kind: "peer-op"; seq: number; batch: OpBatch }
  | { kind: "op-applied"; seq: number; client_seq: number }
  | { kind: "op-rejected"; client_seq: number; reason?: string }
  | { kind: "presence"; clientId: ClientId; state: PresenceState }


/** A live connection to the relay for one board. */
export interface RelayConnection {
  send(msg: OutboundMessage): void
  onMessage(cb: (msg: InboundMessage) => void): Unsubscribe
  close(): void
}
