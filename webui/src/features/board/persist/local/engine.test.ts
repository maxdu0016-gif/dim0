import { beforeEach, describe, expect, it } from "vitest"
import { resetIdb } from "@/test/canvas"
import { isKeyRange } from "./engine"
import type { Key, KeyRange } from "./engine"
import { IndexedDbEngine, toIdbRange } from "./indexeddb-engine"


beforeEach(() => {
  resetIdb()
})


// Minimal records shaped only to satisfy each store's key path.
const board = (id: string, title = id) => ({ id, title })
const chat = (id: string, boardId: string, updatedAt = 0) => ({ id, boardId, updatedAt })
const oplog = (boardId: string, seq: number) => ({ boardId, seq, batch: { id: `${boardId}-${seq}` } })


describe("isKeyRange", () => {
  it("treats scalars and compound keys as plain keys", () => {
    expect(isKeyRange("b1")).toBe(false)
    expect(isKeyRange(7)).toBe(false)
    expect(isKeyRange(["b", 1])).toBe(false)
  })


  it("treats a bounds object as a range", () => {
    expect(isKeyRange({ lower: "a" })).toBe(true)
    expect(isKeyRange({ lower: "a", upper: "z", upperOpen: true })).toBe(true)
  })
})


describe("toIdbRange", () => {
  it("builds bounded, lower-only and upper-only ranges", () => {
    expect(toIdbRange({ lower: "a", upper: "z" })).toBeInstanceOf(IDBKeyRange)
    expect(toIdbRange({ lower: "a" }).upper).toBeUndefined()
    expect(toIdbRange({ upper: "z" }).lower).toBeUndefined()
  })


  it("honours open bounds", () => {
    const r = toIdbRange({ lower: "a", upper: "z", lowerOpen: true, upperOpen: true })
    expect(r.lowerOpen).toBe(true)
    expect(r.upperOpen).toBe(true)
  })


  it("throws when no bound is given", () => {
    expect(() => toIdbRange({})).toThrow(/at least one/)
  })
})


describe("IndexedDbEngine", () => {
  it("round-trips a value on a key-path store", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1", "Hello"))
    expect(await e.get("boards", "b1")).toEqual(board("b1", "Hello"))
    e.close()
  })


  it("returns undefined for a missing key", async () => {
    const e = await IndexedDbEngine.open()
    expect(await e.get("boards", "nope")).toBeUndefined()
    e.close()
  })


  it("round-trips with an explicit (out-of-line) key", async () => {
    const e = await IndexedDbEngine.open()
    const view = { camera: { x: 1, y: 2, z: 3 }, selection: [] }
    await e.put("views", view, "b1")
    expect(await e.get("views", "b1")).toEqual(view)
    e.close()
  })


  it("put replaces an existing value", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1", "one"))
    await e.put("boards", board("b1", "two"))
    expect(await e.get<{ title: string }>("boards", "b1")).toMatchObject({ title: "two" })
    e.close()
  })


  it("lists every value in a store", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1"))
    await e.put("boards", board("b2"))
    const all = await e.list<{ id: string }>("boards")
    expect(all.map((b) => b.id).sort()).toEqual(["b1", "b2"])
    e.close()
  })


  it("lists in reverse key order when order=desc", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1"))
    await e.put("boards", board("b2"))
    await e.put("boards", board("b3"))
    const desc = await e.list<{ id: string }>("boards", { order: "desc" })
    expect(desc.map((b) => b.id)).toEqual(["b3", "b2", "b1"])
    e.close()
  })


  it("lists a compound-key range", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("oplog", oplog("a", 1))
    await e.put("oplog", oplog("a", 2))
    await e.put("oplog", oplog("b", 1))
    const range: KeyRange = { lower: ["a", 0], upper: ["a", Number.MAX_SAFE_INTEGER] }
    const rows = await e.list<{ seq: number }>("oplog", { range })
    expect(rows.map((r) => r.seq)).toEqual([1, 2])
    e.close()
  })


  it("lists via a secondary index", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("chats", chat("c1", "board-a"))
    await e.put("chats", chat("c2", "board-b"))
    await e.put("chats", chat("c3", "board-a"))
    const rows = await e.list<{ id: string }>("chats", { index: "by-board", range: { lower: "board-a", upper: "board-a" } })
    expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c3"])
    e.close()
  })


  it("deletes a single key", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1"))
    await e.delete("boards", "b1")
    expect(await e.get("boards", "b1")).toBeUndefined()
    e.close()
  })


  it("deletes every key in a range", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("oplog", oplog("a", 1))
    await e.put("oplog", oplog("a", 2))
    await e.put("oplog", oplog("b", 1))
    await e.delete("oplog", { lower: ["a", 0], upper: ["a", Number.MAX_SAFE_INTEGER] })
    expect(await e.list("oplog")).toHaveLength(1) // only ["b", 1] remains
    e.close()
  })


  it("commits a multi-store transaction atomically and returns the callback value", async () => {
    const e = await IndexedDbEngine.open()
    const n = await e.tx(["boards", "views"], async (t) => {
      await t.put("boards", board("b1"))
      await t.put("views", { camera: { x: 0, y: 0, z: 1 }, selection: [] }, "b1")
      return 42
    })
    expect(n).toBe(42)
    expect(await e.get("boards", "b1")).toBeDefined()
    expect(await e.get("views", "b1")).toBeDefined()
    e.close()
  })


  it("rolls back every write when the transaction throws", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("existing"))
    await expect(
      e.tx(["boards"], async (t) => {
        await t.put("boards", board("b1"))
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    // The write inside the aborted tx must not have persisted.
    expect(await e.get("boards", "b1")).toBeUndefined()
    // Pre-existing data is untouched.
    expect(await e.get("boards", "existing")).toBeDefined()
    e.close()
  })


  it("reads back within the same transaction", async () => {
    const e = await IndexedDbEngine.open()
    await e.put("boards", board("b1", "seed"))
    const title = await e.tx(["boards"], async (t) => {
      const prev = await t.get<{ title: string }>("boards", "b1")
      await t.put("boards", board("b1", `${prev?.title ?? ""}-edited`))
      const now = await t.get<{ title: string }>("boards", "b1")
      return now?.title
    })
    expect(title).toBe("seed-edited")
    e.close()
  })
})


// Type-level sanity: Key includes scalars and compound keys.
const _keys: Key[] = ["s", 1, ["a", 2]]
void _keys
