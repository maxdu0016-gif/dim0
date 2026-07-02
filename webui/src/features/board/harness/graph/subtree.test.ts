import { afterEach, describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import { addEdge, freshStore } from "@/test/canvas"
import type { DimNode } from "@/features/board/model"
import { BoardPersistence } from "@/features/board/persist/local/board-persistence"
import { InMemoryEngine } from "@/features/board/persist/local/in-memory-engine"
import { setBoardPersistenceRef } from "@/features/board/persist/local/board-persistence-ref"
import { collectSubtreeIds, removeNodeSubtree, removeNodesSubtreeAsync } from "./subtree"


afterEach(() => {
  // The persistence ref is a module singleton — isolate tests.
  setBoardPersistenceRef(null)
})


// Minimal DimNode for the pure BFS (only id + data.parentId are read).
const node = (id: string, parentId?: string): DimNode =>
  ({ id: asNodeId(id), data: { parentId, meta: { v: 1, createdAt: 0, updatedAt: 0 } } }) as unknown as DimNode


// Add a rect node carrying a parentId (test/canvas addNode has no parentId).
const addChild = (store: ReturnType<typeof freshStore>, id: string, parentId?: string): void => {
  store.addNode({
    id: asNodeId(id),
    type: "rect",
    x: 0, y: 0, w: 100, h: 50, angle: 0, groups: [],
    data: { meta: { v: 1, createdAt: 0, updatedAt: 0 }, parentId },
  })
}


describe("collectSubtreeIds", () => {
  it("collects a node and its transitive descendants", () => {
    // A → B → C, A → D, plus unrelated E.
    const nodes = [node("A"), node("B", "A"), node("C", "B"), node("D", "A"), node("E")]
    const ids = collectSubtreeIds(nodes, [asNodeId("A")])
    expect([...ids].sort()).toEqual(["A", "B", "C", "D"])
  })


  it("scopes to the given root (a mid-tree node)", () => {
    const nodes = [node("A"), node("B", "A"), node("C", "B"), node("D", "A")]
    expect([...collectSubtreeIds(nodes, [asNodeId("B")])].sort()).toEqual(["B", "C"])
  })


  it("returns just the node when it has no children", () => {
    expect([...collectSubtreeIds([node("A"), node("B")], [asNodeId("A")])]).toEqual(["A"])
  })


  it("de-dupes overlapping roots", () => {
    const nodes = [node("A"), node("B", "A"), node("C", "B")]
    // B is a descendant of A; passing both must not double-count.
    expect([...collectSubtreeIds(nodes, [asNodeId("A"), asNodeId("B")])].sort()).toEqual(["A", "B", "C"])
  })


  it("is cycle-safe (a mutual parent loop terminates)", () => {
    const nodes = [node("A", "B"), node("B", "A")]
    expect([...collectSubtreeIds(nodes, [asNodeId("A")])].sort()).toEqual(["A", "B"])
  })
})


describe("removeNodeSubtree", () => {
  it("removes a folder, its whole subtree, and their incident edges in one undo", () => {
    const store = freshStore("c")
    addChild(store, "F") // folder
    addChild(store, "c1", "F") // child of F
    addChild(store, "c2", "c1") // grandchild
    addChild(store, "s") // unrelated sibling (top-level)
    addEdge(store, "e1", "c1", "s") // edge crossing the subtree boundary

    removeNodeSubtree(store, asNodeId("F"))

    expect(store.getAllNodes().map((n) => n.id).sort()).toEqual(["s"])
    expect(store.getAllEdges()).toHaveLength(0) // incident edge cascaded out

    // One batch → one undo restores the entire subtree + edge.
    store.undo()
    expect(store.getAllNodes().map((n) => n.id).sort()).toEqual(["F", "c1", "c2", "s"])
    expect(store.getAllEdges().map((e) => e.id)).toEqual(["e1"])
  })


  it("removes only the node when it is a leaf", () => {
    const store = freshStore("c")
    addChild(store, "a")
    addChild(store, "b")
    removeNodeSubtree(store, asNodeId("a"))
    expect(store.getAllNodes().map((n) => n.id)).toEqual(["b"])
  })


  it("cascades to descendants in deeper (unloaded) layers via persistence", async () => {
    const engine = new InMemoryEngine()
    const persistence = new BoardPersistence("b", { engine })

    // Seed the WHOLE board (all layers) into the oplog via a full store.
    const full = freshStore("seed")
    const unsub = persistence.attach(full)
    addChild(full, "F") // folder at root
    addChild(full, "c1", "F") // child — a deeper layer
    addChild(full, "c2", "c1") // grandchild — deeper still
    addChild(full, "s") // sibling at root
    await persistence.flush()
    unsub()

    // Simulate the live ROOT-layer store: only F + s are loaded (children are deeper).
    const live = freshStore("live")
    addChild(live, "F")
    addChild(live, "s")
    persistence.attach(live)
    setBoardPersistenceRef(persistence)

    await removeNodesSubtreeAsync(live, [asNodeId("F")])

    // Loaded layer: F gone from the live store, sibling remains.
    expect(live.getAllNodes().map((n) => n.id).sort()).toEqual(["s"])
    // Whole board: the deeper descendants were swept from the oplog too.
    expect((await persistence.load()).nodes.map((n) => n.id).sort()).toEqual(["s"])
  })
})
