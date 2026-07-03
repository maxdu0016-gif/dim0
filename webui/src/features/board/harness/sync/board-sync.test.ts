import { describe, expect, it } from "vitest"
import { asBatchId, asClientId, type OpBatch } from "@canvas-harness/core"
import { addNode, freshStore } from "@/test/canvas"
import { MemoryRelay } from "@/test/sync-relay"
import { InMemoryEngine } from "@/features/board/persist/local/in-memory-engine"
import { BoardOutbox } from "@/features/board/persist/local/board-outbox"
import { BoardPersistence } from "@/features/board/persist/local/board-persistence"
import { attachBoardSync } from "./board-sync"


const BOARD = "b"


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
    connect: () => relay.connect(asClientId(id), opts),
  })
  return { engine, persistence, store, sync }
}


const ids = (store: ReturnType<typeof freshStore>): string[] =>
  store.getAllNodes().map((n) => n.id).sort()


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
    // viewer keeps its optimistic node (rollback lands in E1.6)
    expect(ids(viewer.store)).toEqual(["v1"])
    editor.sync.detach()
    viewer.sync.detach()
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
