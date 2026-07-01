import { beforeEach, describe, expect, it } from "vitest"
import { addNode, freshStore, resetIdb } from "@/test/canvas"
import { BoardPersistence } from "./board-persistence"
import { BoardRegistry, newLocalBoard } from "./board-registry"
import { IndexedDbEngine } from "./indexeddb-engine"


beforeEach(() => {
  resetIdb()
})


describe("BoardRegistry", () => {
  it("creates, gets, and lists local-only boards (no account)", async () => {
    const reg = new BoardRegistry()
    await reg.init()

    const a = newLocalBoard("Ideas", 1000)
    const b = newLocalBoard("Tasks", 2000)
    await reg.createBoard(a)
    await reg.createBoard(b)

    expect((await reg.getBoard(a.id))?.title).toBe("Ideas")
    expect((await reg.listBoards()).map((m) => m.title).sort()).toEqual(["Ideas", "Tasks"])
    expect((await reg.getBoard(a.id))?.kind).toBe("local-only")
    reg.close()
  })


  it("registry survives a reload (new connection sees prior boards)", async () => {
    const reg = new BoardRegistry()
    await reg.init()
    const board = newLocalBoard("Persisted", 1000)
    await reg.createBoard(board)
    reg.close()

    const reg2 = new BoardRegistry()
    await reg2.init()
    expect((await reg2.getBoard(board.id))?.title).toBe("Persisted")
    reg2.close()
  })


  it("deleteBoard cascades: meta + view + content all removed, no orphans", async () => {
    const reg = new BoardRegistry()
    await reg.init()
    const board = newLocalBoard("Doomed", 1000)
    await reg.createBoard(board)
    await reg.saveView(board.id, { camera: { x: 1, y: 2, z: 1 }, selection: [] })

    // write some content
    const p = new BoardPersistence(board.id)
    await p.init()
    const store = freshStore("c")
    p.attach(store)
    addNode(store, "n1")
    await p.flush()
    p.close()

    await reg.deleteBoard(board.id)

    expect(await reg.getBoard(board.id)).toBeUndefined()
    expect(await reg.loadView(board.id)).toBeUndefined()
    // content gone: a fresh persistence loads empty
    const p2 = new BoardPersistence(board.id)
    await p2.init()
    expect((await p2.load()).nodes).toHaveLength(0)
    p2.close()
    reg.close()
  })


  it("deleteBoard cascades to the board's chats and messages, sparing other boards", async () => {
    const engine = await IndexedDbEngine.open()
    const reg = new BoardRegistry({ engine })
    await reg.init()
    const board = newLocalBoard("Doomed", 1000)
    await reg.createBoard(board)

    // Seed two chats (+ a message each) for this board, and one for another board.
    await engine.put("chats", { id: "chat-1", boardId: board.id, updatedAt: 1 })
    await engine.put("chats", { id: "chat-2", boardId: board.id, updatedAt: 2 })
    await engine.put("chats", { id: "chat-x", boardId: "other-board", updatedAt: 3 })
    await engine.put("chat_messages", { chatUid: "chat-1", id: "m1", role: "user", content: { markdown: "hi" }, order: 0 })
    await engine.put("chat_messages", { chatUid: "chat-2", id: "m2", role: "user", content: { markdown: "yo" }, order: 0 })
    await engine.put("chat_messages", { chatUid: "chat-x", id: "mx", role: "user", content: { markdown: "keep" }, order: 0 })

    await reg.deleteBoard(board.id)

    // This board's chats + messages are gone…
    expect(await engine.list("chats", { index: "by-board", range: { lower: board.id, upper: board.id } })).toHaveLength(0)
    expect(await engine.get("chat_messages", ["chat-1", "m1"])).toBeUndefined()
    expect(await engine.get("chat_messages", ["chat-2", "m2"])).toBeUndefined()
    // …but the other board's chat + message survive.
    expect(await engine.get("chats", "chat-x")).toBeDefined()
    expect(await engine.get("chat_messages", ["chat-x", "mx"])).toBeDefined()

    reg.close()
    engine.close()
  })


  it("close() leaves an injected engine open for its owner", async () => {
    const engine = await IndexedDbEngine.open()
    const reg = new BoardRegistry({ engine })
    await reg.init()
    reg.close()
    // The shared engine is still usable after the repo closes.
    await engine.put("boards", newLocalBoard("Still here", 1000))
    expect(await engine.list("boards")).toHaveLength(1)
    engine.close()
  })


  it("view state round-trips and is separate from content", async () => {
    const reg = new BoardRegistry()
    await reg.init()
    const board = newLocalBoard("Viewed", 1000)
    await reg.createBoard(board)

    const view = { camera: { x: 10, y: 20, z: 1.5 }, selection: [] }
    await reg.saveView(board.id, view)
    expect(await reg.loadView(board.id)).toEqual(view)

    // content carries no camera/selection (separation by construction)
    const p = new BoardPersistence(board.id)
    await p.init()
    const content = await p.load()
    expect("camera" in content).toBe(false)
    expect("selection" in content).toBe(false)
    p.close()
    reg.close()
  })
})
