import { describe, expect, it } from "vitest"
import { asBatchId, asClientId, asNodeId, type OpBatch } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"
import { addEdge, addNode, freshStore } from "@/test/canvas"
import type { DimNodeData } from "@/features/board/model"
import { MemoryRelay } from "@/test/sync-relay"
import { InMemoryEngine } from "@/features/board/persist/local/in-memory-engine"
import { BoardOutbox } from "@/features/board/persist/local/board-outbox"
import { BoardPersistence } from "@/features/board/persist/local/board-persistence"
import { attachBoardSync } from "./board-sync"
import type { InboundMessage, RelayConnection } from "./wire"


const BOARD = "b"


/**
 * A client wired to a hand-driven connection, so a test can push arbitrary
 * inbound relay messages (snapshot welcome, kick, …) and observe the coordinator.
 */
const makeControlled = (
  id: string,
  opts: { onSnapshot?: (s: unknown, seq: number) => void; normalizeRemote?: (b: OpBatch) => void } = {},
) => {
  const engine = new InMemoryEngine()
  const persistence = new BoardPersistence(BOARD, { engine })
  const store = freshStore(id)
  persistence.attach(store)
  const state = { deliver: null as ((m: InboundMessage) => void) | null, closed: false }
  const conn: RelayConnection = {
    send: () => {},
    onMessage: (cb) => {
      state.deliver = cb
      return () => {
        state.deliver = null
      }
    },
    close: () => {
      state.closed = true
    },
  }
  const sync = attachBoardSync({
    store,
    persistence,
    engine,
    boardId: BOARD,
    clientId: asClientId(id),
    connect: () => conn,
    onSnapshot: opts.onSnapshot,
    normalizeRemote: opts.normalizeRemote,
  })
  return { store, sync, push: (m: InboundMessage) => state.deliver?.(m), get closed() { return state.closed } }
}


/** A full offline-first client: own engine (replica) + persistence + store + sync. */
const makeClient = (relay: MemoryRelay, id: string, opts: { canEdit?: boolean } = {}) => {
  const engine = new InMemoryEngine()
  const persistence = new BoardPersistence(BOARD, { engine })
  const store = freshStore(id)
  persistence.attach(store)
  const sync = attachBoardSync({
    store,
    persistence,
    engine,
    boardId: BOARD,
    clientId: asClientId(id),
    connect: (sinceSeq) => relay.connect(asClientId(id), { ...opts, sinceSeq }),
  })
  return { engine, persistence, store, sync }
}


const ids = (store: ReturnType<typeof freshStore>): string[] =>
  store.getAllNodes().map((n) => n.id).sort()


const edgeIds = (store: CanvasStore): string[] =>
  store.getAllEdges().map((e) => e.id).sort()


const labelOf = (store: CanvasStore, id: string): string | undefined =>
  (store.getAllNodes().find((n) => n.id === id)?.data as DimNodeData | undefined)?.label


const xOf = (store: CanvasStore, id: string): number | undefined =>
  store.getAllNodes().find((n) => n.id === id)?.x


/** Update a node's label in place, preserving the rest of its data. */
const setLabel = (store: CanvasStore, id: string, label: string): void => {
  const node = store.getAllNodes().find((n) => n.id === id)
  if (!node) throw new Error(`no node ${id}`)
  store.updateNode(asNodeId(id), { data: { ...(node.data as DimNodeData), label } })
}


describe("board sync coordinator", () => {
  it("propagates a local edit to the other client (no self-echo, no dupes)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")

    addNode(a.store, "n1", "hello")
    await a.sync.settle()

    expect(ids(a.store)).toEqual(["n1"]) // sender keeps exactly one
    expect(ids(b.store)).toEqual(["n1"]) // peer converges
    expect(relay.log).toHaveLength(1)
    a.sync.detach()
    b.sync.detach()
  })


  it("converges concurrent edits both ways", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")

    addNode(a.store, "a1")
    addNode(b.store, "b1")
    await a.sync.settle()
    await b.sync.settle()

    expect(ids(a.store)).toEqual(["a1", "b1"])
    expect(ids(b.store)).toEqual(["a1", "b1"])
    a.sync.detach()
    b.sync.detach()
  })


  it("fans out to all peers (3 clients)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    const c = makeClient(relay, "C")

    addNode(a.store, "n1")
    await a.sync.settle()

    expect(ids(b.store)).toEqual(["n1"])
    expect(ids(c.store)).toEqual(["n1"])
    a.sync.detach()
    b.sync.detach()
    c.sync.detach()
  })


  it("replays offline edits and converges on reconnect", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    await a.sync.settle()
    await b.sync.settle()

    a.sync.disconnect()
    addNode(a.store, "offA", "made offline")
    await a.sync.settle() // pump no-ops; offA sits in the outbox

    addNode(b.store, "onlB")
    await b.sync.settle() // B is online

    expect(ids(a.store)).toEqual(["offA"]) // A hasn't seen onlB
    expect(ids(b.store)).toEqual(["onlB"]) // B hasn't seen offA

    a.sync.reconnect()
    await a.sync.settle() // catch up onlB (welcome) + replay offA (outbox)
    await b.sync.settle()

    expect(ids(a.store)).toEqual(["offA", "onlB"])
    expect(ids(b.store)).toEqual(["offA", "onlB"])
    a.sync.detach()
    b.sync.detach()
  })


  it("catches a late joiner up via welcome", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    addNode(a.store, "a1")
    addNode(a.store, "a2")
    await a.sync.settle()

    const b = makeClient(relay, "B") // joins after the edits
    await b.sync.settle()

    expect(ids(b.store)).toEqual(["a1", "a2"])
    a.sync.detach()
    b.sync.detach()
  })


  it("advances the synced cursor and drains the outbox on ack", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    makeClient(relay, "B")

    addNode(a.store, "n1")
    await a.sync.settle()

    const outbox = new BoardOutbox(a.engine, BOARD)
    expect(await outbox.pending()).toHaveLength(0)
    expect(await outbox.syncedSeq()).toBeGreaterThan(0)
    a.sync.detach()
  })


  it("a reload reconstructs the converged state (local + remote)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")

    addNode(a.store, "a1")
    await a.sync.settle()
    addNode(b.store, "b1")
    await b.sync.settle()
    await a.sync.settle() // A persists b1 via recordRemote

    const reloaded = new BoardPersistence(BOARD, { engine: a.engine })
    expect((await reloaded.load()).nodes.map((n) => n.id).sort()).toEqual(["a1", "b1"])
    a.sync.detach()
    b.sync.detach()
  })


  it("rejects a viewer's edits — they never reach peers", async () => {
    const relay = new MemoryRelay()
    const editor = makeClient(relay, "E")
    const viewer = makeClient(relay, "V", { canEdit: false })

    addNode(viewer.store, "v1")
    await viewer.sync.settle()
    await editor.sync.settle()

    expect(ids(editor.store)).toEqual([]) // never broadcast
    expect(relay.log).toHaveLength(0)
    expect(ids(viewer.store)).toEqual([]) // optimistic node rolled back on reject
    // the rollback is durable — a reload doesn't resurrect it
    const reloaded = new BoardPersistence(BOARD, { engine: viewer.engine })
    expect((await reloaded.load()).nodes).toEqual([])
    editor.sync.detach()
    viewer.sync.detach()
  })
})


describe("E1.4 conflict resolution", () => {
  it("same-field concurrent edits converge on the highest-seq writer", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1", "base")
    await a.sync.settle()
    await b.sync.settle() // both hold n1 = "base"

    setLabel(a.store, "n1", "AAA") // concurrent, same field
    setLabel(b.store, "n1", "BBB")
    await a.sync.settle() // A's op is sequenced first
    await b.sync.settle() // B's op gets the higher seq → wins
    await a.sync.settle()

    expect(labelOf(a.store, "n1")).toBe("BBB")
    expect(labelOf(b.store, "n1")).toBe("BBB")
    a.sync.detach()
    b.sync.detach()
  })


  it("disjoint-field concurrent edits both survive (commute)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1", "base")
    await a.sync.settle()
    await b.sync.settle()

    setLabel(a.store, "n1", "renamed") // A renames
    b.store.updateNode(asNodeId("n1"), { x: 250 }) // B moves — different field
    await a.sync.settle()
    await b.sync.settle()
    await a.sync.settle()

    for (const s of [a.store, b.store]) {
      expect(labelOf(s, "n1")).toBe("renamed")
      expect(xOf(s, "n1")).toBe(250)
    }
    a.sync.detach()
    b.sync.detach()
  })


  it("delete wins over a concurrent update (no zombie)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1", "base")
    await a.sync.settle()
    await b.sync.settle()

    a.store.removeNode(asNodeId("n1")) // A deletes
    setLabel(b.store, "n1", "edited") // B edits the same node concurrently
    await a.sync.settle()
    await b.sync.settle()
    await a.sync.settle()

    expect(ids(a.store)).toEqual([]) // gone on both
    expect(ids(b.store)).toEqual([])
    a.sync.detach()
    b.sync.detach()
  })


  it("a reload after a same-field conflict matches the live winner", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1", "base")
    await a.sync.settle()
    await b.sync.settle()

    setLabel(a.store, "n1", "AAA")
    setLabel(b.store, "n1", "BBB") // B's op gets the higher seq
    await a.sync.settle()
    await b.sync.settle()
    await a.sync.settle()

    // Live winner is BBB on both; a reload of A must replay in relay order and
    // land on BBB too (not A's local-append order, which would give AAA).
    const reloaded = new BoardPersistence(BOARD, { engine: a.engine })
    const content = await reloaded.load()
    expect(content.nodes.find((n) => n.id === "n1")?.data?.label).toBe("BBB")
    a.sync.detach()
    b.sync.detach()
  })


  it("drops an edge whose endpoint was concurrently deleted", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1")
    addNode(a.store, "n2")
    await a.sync.settle()
    await b.sync.settle() // both hold n1, n2

    a.store.removeNode(asNodeId("n2")) // A deletes an endpoint
    addEdge(b.store, "e1", "n1", "n2") // B links to it concurrently
    await a.sync.settle()
    await b.sync.settle()
    await a.sync.settle()

    for (const s of [a.store, b.store]) {
      expect(ids(s)).toEqual(["n1"]) // n2 gone
      expect(edgeIds(s)).toEqual([]) // dangling edge dropped
    }

    // The dropped edge stays dropped after a reload of the client that made it.
    const reloaded = new BoardPersistence(BOARD, { engine: b.engine })
    const content = await reloaded.load()
    expect(content.edges).toEqual([])
    a.sync.detach()
    b.sync.detach()
  })


  it("offline field edit wins on reconnect (reconnect-order-wins)", async () => {
    const relay = new MemoryRelay()
    const a = makeClient(relay, "A")
    const b = makeClient(relay, "B")
    addNode(a.store, "n1", "base")
    await a.sync.settle()
    await b.sync.settle()

    a.sync.disconnect()
    setLabel(a.store, "n1", "offline-A") // sits in the outbox, applied optimistically
    await a.sync.settle()

    setLabel(b.store, "n1", "online-B") // gets sequenced while A is away
    await b.sync.settle()
    expect(labelOf(b.store, "n1")).toBe("online-B")

    a.sync.reconnect() // welcome delivers online-B; A replays offline-A (higher seq)
    await a.sync.settle()
    await b.sync.settle() // B receives offline-A at the higher seq → it wins

    expect(labelOf(a.store, "n1")).toBe("offline-A")
    expect(labelOf(b.store, "n1")).toBe("offline-A")
    a.sync.detach()
    b.sync.detach()
  })
})


describe("E1.5 protocol handlers", () => {
  it("hydrates from a snapshot-mode welcome via onSnapshot", async () => {
    let captured: { snapshot: unknown; seq: number } | null = null
    const c = makeControlled("A", { onSnapshot: (snapshot, seq) => { captured = { snapshot, seq } } })

    c.push({ kind: "welcome", mode: "snapshot", seq: 7, snapshot: { hello: "world" } })
    await c.sync.settle()

    expect(captured).toEqual({ snapshot: { hello: "world" }, seq: 7 })
    c.sync.detach()
  })


  it("closes the connection on kick", async () => {
    const c = makeControlled("A")
    expect(c.closed).toBe(false)

    c.push({ kind: "kick", reason: "room-full" })

    expect(c.closed).toBe(true)
    c.sync.detach()
  })


  it("applies a normalized copy to the store but persists the raw batch", async () => {
    // normalizeRemote appends " (themed)" to a node's label — stand-in for real
    // theme/geometry normalization. The store must see the normalized value; the
    // batch object handed in must stay raw (so persistence keeps it theme-free).
    const c = makeControlled("A", {
      normalizeRemote: (b) => {
        for (const op of b.ops) {
          if (op.type === "node.add") {
            const data = op.node.data as DimNodeData
            data.label = `${data.label} (themed)`
          }
        }
      },
    })
    const raw: OpBatch = {
      id: asBatchId("r1"),
      clientId: asClientId("B"),
      ts: 0,
      origin: "remote",
      ops: [{
        type: "node.add",
        node: {
          id: asNodeId("n1"), type: "rect", x: 0, y: 0, z: 0, w: 100, h: 50, angle: 0,
          groups: [], data: { label: "raw", meta: { v: 1, createdAt: 0, updatedAt: 0 } },
        },
      }],
    }
    c.push({ kind: "peer-op", seq: 1, batch: raw })
    await c.sync.settle()

    const label = (c.store.getAllNodes().find((n) => n.id === "n1")?.data as DimNodeData | undefined)?.label
    expect(label).toBe("raw (themed)") // store got the normalized copy
    expect((raw.ops[0] as { node: { data: DimNodeData } }).node.data.label).toBe("raw") // input untouched
    c.sync.detach()
  })
})


describe("relay idempotency", () => {
  const mkBatch = (id: string): OpBatch => ({
    id: asBatchId(id),
    clientId: asClientId("A"),
    ts: 0,
    origin: "local",
    ops: [],
  })


  it("dedups a replayed batch by id (acks at the original seq, logs once)", () => {
    const relay = new MemoryRelay()
    const acks: number[] = []
    const conn = relay.connect(asClientId("A"))
    conn.onMessage((m) => {
      if (m.kind === "op-applied") acks.push(m.seq)
    })

    const batch = mkBatch("dup")
    conn.send({ kind: "op", client_seq: 1, batch })
    conn.send({ kind: "op", client_seq: 2, batch }) // replay

    expect(relay.log).toHaveLength(1)
    expect(acks).toEqual([1, 1]) // both acked at the same seq
  })
})
