import { beforeEach, describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import type { Edge } from "@canvas-harness/core"
import type { DimNodeData } from "@/features/board/model"
import { BoardRegistry, newLocalBoard } from "@/features/board/persist/local/board-registry"
import { LocalSearchIndex } from "@/features/board/search/local-index"
import { addNode, freshStore, resetIdb } from "@/test/canvas"
import { ScriptedLlm, toolTurn } from "@/test/llm"
import { runAgent } from "./agent-loop"
import type { AgentEvent, LlmClient, LlmMessage } from "./types"
import { createNote, listBoards, localTools, searchNotes, updateNote } from "./tools"


const drain = async (gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> => {
  const out: AgentEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}


const endNode = (end: Edge["source"]): string => ("nodeId" in end ? String(end.nodeId) : "free")


const titleOf = (data: unknown): string => (data as DimNodeData | undefined)?.label ?? ""


beforeEach(() => {
  resetIdb()
})


describe("runAgent (scripted LLM)", () => {
  it("creates 3 notes and links them into a chain", async () => {
    const store = freshStore("c")
    const llm = new ScriptedLlm([
      toolTurn("create_note", { id: "n1", title: "A" }),
      toolTurn("create_note", { id: "n2", title: "B" }),
      toolTurn("create_note", { id: "n3", title: "C" }),
      toolTurn("link_notes", { sourceId: "n1", targetId: "n2" }),
      toolTurn("link_notes", { sourceId: "n2", targetId: "n3" }),
      { kind: "text", text: "Created 3 linked notes." },
    ])

    const events = await drain(runAgent({ userMessage: "build it", tools: localTools, llm, ctx: { store } }))

    expect(store.getAllNodes().map((n) => titleOf(n.data)).sort()).toEqual(["A", "B", "C"])
    const pairs = store.getAllEdges().map((e) => `${endNode(e.source)}->${endNode(e.target)}`).sort()
    expect(pairs).toEqual(["n1->n2", "n2->n3"])
    expect(events.at(-1)).toEqual({ type: "done" })
    expect(events.some((e) => e.type === "assistant_text")).toBe(true)
  })


  it("INV-8: an agent action is one undoable batch", async () => {
    const store = freshStore("c")
    const llm = new ScriptedLlm([toolTurn("create_note", { id: "n1", title: "A" }), { kind: "text", text: "ok" }])

    await drain(runAgent({ userMessage: "x", tools: localTools, llm, ctx: { store } }))
    expect(store.getAllNodes()).toHaveLength(1)
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(store.getAllNodes()).toHaveLength(0)
  })


  it("prepends prior history before the new user message", async () => {
    const store = freshStore("c")
    let seen: LlmMessage[] = []
    const llm: LlmClient = {
      async complete(messages) {
        seen = [...messages]
        return { kind: "text", text: "ok" }
      },
    }
    const history: LlmMessage[] = [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]

    await drain(runAgent({ userMessage: "follow up", history, tools: localTools, llm, ctx: { store } }))

    expect(seen.map((m) => m.role)).toEqual(["user", "assistant", "user"])
    expect(seen.map((m) => ("content" in m ? m.content : ""))).toEqual([
      "first question",
      "first answer",
      "follow up",
    ])
  })


  it("reports unknown tools without crashing the loop", async () => {
    const store = freshStore("c")
    const llm = new ScriptedLlm([toolTurn("nope", {}), { kind: "text", text: "done" }])
    const events = await drain(runAgent({ userMessage: "x", tools: localTools, llm, ctx: { store } }))
    const result = events.find((e) => e.type === "tool_result")
    expect(result).toMatchObject({ result: { error: "unknown tool: nope" } })
  })
})


describe("tools", () => {
  it("create_note then update_note changes title and body", async () => {
    const store = freshStore("c")
    await createNote.run({ id: "n1", title: "old", body: "b1" }, { store })
    await updateNote.run({ id: "n1", title: "new", body: "b2" }, { store })

    const node = store.getNode(asNodeId("n1"))
    expect(titleOf(node?.data)).toBe("new")
    expect(node?.content).toBe("b2")
  })


  it("update_note on a missing note returns an error", async () => {
    const store = freshStore("c")
    expect(await updateNote.run({ id: "ghost" }, { store })).toEqual({ error: "note not found" })
  })


  it("search_notes finds notes via the local index", async () => {
    const store = freshStore("c")
    const search = new LocalSearchIndex()
    search.attach(store)
    addNode(store, "n1", "hello world")
    await search.idle()

    const res = (await searchNotes.run({ query: "hello" }, { store, search })) as { results: { id: string }[] }
    expect(res.results.map((r) => r.id)).toContain("n1")
  })


  it("list_boards lists from the registry", async () => {
    const registry = new BoardRegistry()
    await registry.init()
    await registry.createBoard(newLocalBoard("Ideas", 1000))
    const store = freshStore("c")

    const res = (await listBoards.run({}, { store, registry })) as { boards: { title: string }[] }
    expect(res.boards.map((b) => b.title)).toEqual(["Ideas"])
    registry.close()
  })
})
