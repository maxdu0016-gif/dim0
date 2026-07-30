import { beforeEach, describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import type { Edge } from "@canvas-harness/core"
import type { DimNodeData } from "@/features/board/model"
import { BoardRegistry, newLocalBoard } from "@/features/board/persist/local/board-registry"
import { LocalSearchIndex } from "@/features/board/search/local-index"
import { addNode, freshStore, resetIdb } from "@/test/canvas"
import { ScriptedLlm, toolTurn } from "@/test/llm"
import { z } from "zod"
import { executeToolCall, runAgent } from "./agent-loop"
import { defineTool } from "./types"
import type { AgentEvent, LlmClient, LlmMessage, Tool, ToolContext } from "./types"
import { createNote, editNote, getNote, linkNotes, listBoards, localTools, searchNotes, updateNote, writeNote } from "./tools"
import { learnGenerateMiniApp, skillTools } from "./skills"


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


  it("reports a throwing tool as a tool error and keeps the run going", async () => {
    const store = freshStore("c")
    const exploding = defineTool({
      name: "explode",
      description: "always throws",
      parameters: z.object({}),
      run: async () => {
        throw new Error("boom")
      },
    })
    const llm = new ScriptedLlm([
      toolTurn("explode", {}),
      { kind: "text", text: "recovered without the tool" },
    ])

    const events = await drain(runAgent({ userMessage: "go", tools: [exploding], llm, ctx: { store } }))

    expect(events.find((e) => e.type === "tool_result")).toMatchObject({
      type: "tool_result",
      toolName: "explode",
      result: { ok: false, error: "tool_error", tool: "explode", message: expect.stringContaining("boom") },
    })
    expect(events.some((e) => e.type === "assistant_text" && e.text === "recovered without the tool")).toBe(true)
    expect(events.at(-1)).toEqual({ type: "done" })
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
    expect(result).toMatchObject({ result: { ok: false, error: "unknown_tool", tool: "nope" } })
  })
})


describe("runAgent — off-board tool confirmation gate", () => {
  const spyTool = (name: string, ran: { value: boolean }) =>
    defineTool({
      name,
      description: name,
      parameters: z.object({ url: z.string().optional(), code: z.string().optional() }),
      run: async () => {
        ran.value = true
        return { ok: true }
      },
    })

  const resultOf = (events: AgentEvent[]) => events.find((e) => e.type === "tool_result")

  it("runs a gated tool when the user allows", async () => {
    const ran = { value: false }
    const seen: { name: string; args: Record<string, unknown> }[] = []
    const llm = new ScriptedLlm([toolTurn("fetch", { url: "https://x" }), { kind: "text", text: "done" }])
    const events = await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("fetch", ran)],
        llm,
        ctx: { store: freshStore("c"), confirmTool: async (r) => (seen.push(r), true) },
      }),
    )
    expect(seen).toEqual([{ name: "fetch", args: { url: "https://x" } }])
    expect(ran.value).toBe(true)
    expect(resultOf(events)).toMatchObject({ result: { ok: true } })
  })

  it("declines a gated tool and feeds an error back to the model (tool not run)", async () => {
    const ran = { value: false }
    const llm = new ScriptedLlm([toolTurn("fetch", { url: "https://evil/x" }), { kind: "text", text: "ok without it" }])
    const events = await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("fetch", ran)],
        llm,
        ctx: { store: freshStore("c"), confirmTool: async () => false },
      }),
    )
    expect(ran.value).toBe(false)
    expect(resultOf(events)).toMatchObject({
      toolName: "fetch",
      result: { ok: false, error: "user_declined", tool: "fetch", message: expect.stringContaining("declined") },
    })
    expect(events.some((e) => e.type === "assistant_text" && e.text === "ok without it")).toBe(true)
  })

  it("gates code_interpreter too", async () => {
    const ran = { value: false }
    const llm = new ScriptedLlm([toolTurn("code_interpreter", { code: "fetch('x')" }), { kind: "text", text: "d" }])
    await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("code_interpreter", ran)],
        llm,
        ctx: { store: freshStore("c"), confirmTool: async () => false },
      }),
    )
    expect(ran.value).toBe(false)
  })

  it("gates web_search too", async () => {
    const ran = { value: false }
    const llm = new ScriptedLlm([toolTurn("web_search", { query: "secrets on the board" }), { kind: "text", text: "d" }])
    await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("web_search", ran)],
        llm,
        ctx: { store: freshStore("c"), confirmTool: async () => false },
      }),
    )
    expect(ran.value).toBe(false)
  })

  it("runs a gated tool unprompted when no confirmTool is wired (headless/tests)", async () => {
    const ran = { value: false }
    const llm = new ScriptedLlm([toolTurn("fetch", { url: "https://x" }), { kind: "text", text: "d" }])
    await drain(runAgent({ userMessage: "go", tools: [spyTool("fetch", ran)], llm, ctx: { store: freshStore("c") } }))
    expect(ran.value).toBe(true)
  })

  it("a throwing confirmer becomes a tool error, not a run abort", async () => {
    const ran = { value: false }
    const llm = new ScriptedLlm([toolTurn("fetch", { url: "https://x" }), { kind: "text", text: "recovered" }])
    const events = await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("fetch", ran)],
        llm,
        ctx: {
          store: freshStore("c"),
          confirmTool: async () => {
            throw new Error("boom")
          },
        },
      }),
    )
    expect(ran.value).toBe(false)
    expect(resultOf(events)).toMatchObject({
      toolName: "fetch",
      result: { ok: false, error: "tool_error", tool: "fetch", message: expect.stringContaining("boom") },
    })
    expect(events.some((e) => e.type === "assistant_text" && e.text === "recovered")).toBe(true)
  })

  it("does NOT prompt for non-gated tools (note tools auto-run)", async () => {
    const ran = { value: false }
    let prompted = false
    const llm = new ScriptedLlm([toolTurn("noop", {}), { kind: "text", text: "d" }])
    await drain(
      runAgent({
        userMessage: "go",
        tools: [spyTool("noop", ran)],
        llm,
        ctx: { store: freshStore("c"), confirmTool: async () => ((prompted = true), true) },
      }),
    )
    expect(prompted).toBe(false)
    expect(ran.value).toBe(true)
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


  it("write_note creates a typed node (mini-app)", async () => {
    const store = freshStore("c")
    const { id } = (await writeNote.run(
      { note_id: "m1", label: "Chart", content: "function Widget() { return null }", note_type: "mini-app" },
      { store },
    )) as { id: string }
    const node = store.getNode(asNodeId(id))
    expect(node?.type).toBe("mini-app")
    expect(titleOf(node?.data)).toBe("Chart")
    // Custom types must be born with grow-to-fit OFF (mirrors note_to_wire).
    expect(node?.style?.autoFit).toBe(false)
  })


  it("write_note leaves a rectangle's autoFit unset (it should grow-to-fit)", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "r1", content: "hi", note_type: "rectangle" }, { store })
    expect(store.getNode(asNodeId("r1"))?.style?.autoFit).not.toBe(false)
  })


  it("write_note stamps a random Tailwind-200 fill (theme source-of-truth)", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "n1", content: "x", note_type: "rectangle" }, { store })
    const data = store.getNode(asNodeId("n1"))?.data as { _storedColors?: { backgroundColor?: string; textColor?: string } }
    expect(data._storedColors?.backgroundColor).toMatch(/^#/)
    expect(data._storedColors?.textColor).toBe("#000000")
  })


  it("link_notes attaches at node centers (so auto-clip hits the borders)", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "a", content: "a", note_type: "rectangle" }, { store })
    await writeNote.run({ note_id: "b", content: "b", note_type: "rectangle" }, { store })
    await linkNotes.run({ sourceId: "a", targetId: "b" }, { store })

    const a = store.getNode(asNodeId("a"))!
    const edge = store.getAllEdges()[0]
    const src = edge.source
    expect("nodeId" in src && src.localOffset).toEqual({ x: a.w / 2, y: a.h / 2 })
  })


  it("write_note rejects a malformed mini-app without creating a node", async () => {
    const store = freshStore("c")
    const res = await writeNote.run({ note_id: "bad", content: "const x = 1", note_type: "mini-app" }, { store })
    expect(res).toMatchObject({ error: expect.stringContaining("mini-app invalid") })
    expect(store.getNode(asNodeId("bad"))).toBeUndefined()
  })


  it("write_note(note_id) rewrites an existing note", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "n1", content: "v1", note_type: "rectangle" }, { store })
    await writeNote.run({ note_id: "n1", content: "v2", note_type: "sheet" }, { store })
    const node = store.getNode(asNodeId("n1"))
    expect(node?.content).toBe("v2")
    expect(node?.type).toBe("sheet")
    expect(store.getAllNodes()).toHaveLength(1)
  })


  it("get_note reads label, content, and type", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "n1", label: "T", content: "body", note_type: "sheet" }, { store })
    const res = (await getNote.run({ note_id: "n1" }, { store })) as { label: string; content: string; note_type: string }
    expect(res).toMatchObject({ label: "T", content: "body", note_type: "sheet" })
  })


  it("edit_note replaces a unique snippet and rejects ambiguous ones", async () => {
    const store = freshStore("c")
    await writeNote.run({ note_id: "n1", content: "alpha beta alpha", note_type: "rectangle" }, { store })

    expect(await editNote.run({ note_id: "n1", field: "content", old: "alpha", new: "X" }, { store })).toMatchObject({
      error: expect.stringContaining("multiple times"),
    })
    await editNote.run({ note_id: "n1", field: "content", old: "beta", new: "Y" }, { store })
    expect(store.getNode(asNodeId("n1"))?.content).toBe("alpha Y alpha")
  })
})


describe("skills", () => {
  it("learn_generate_* tools return their guidance text", async () => {
    const out = (await learnGenerateMiniApp.run({}, { store: freshStore("c") })) as string
    expect(typeof out).toBe("string")
    expect(out.length).toBeGreaterThan(200)
  })

  it("exposes the three skill loaders", () => {
    expect(skillTools.map((t) => t.name).sort()).toEqual([
      "learn_generate_diagram",
      "learn_generate_html_widget",
      "learn_generate_mini_app",
    ])
  })
})


describe("executeToolCall (tool execution choke point)", () => {
  const stubTool = (name: string, run: Tool["run"] = async () => ({ ok: true })): Tool =>
    defineTool({ name, description: name, parameters: z.object({ url: z.string().optional() }), run })

  const ctxWith = (confirmTool?: ToolContext["confirmTool"]): ToolContext =>
    ({ store: freshStore("c"), rootId: null, confirmTool })

  it("returns an unknown_tool failure when the tool isn't in the set", async () => {
    const out = await executeToolCall("nope", {}, [stubTool("fetch")], ctxWith(), new Set())
    expect(out).toMatchObject({ ok: false, error: "unknown_tool", tool: "nope" })
  })

  it("runs a non-gated tool without consulting the confirmer", async () => {
    let asked = false
    const out = await executeToolCall(
      "create_note", {}, [stubTool("create_note", async () => ({ id: "n1" }))],
      ctxWith(async () => ((asked = true), true)), new Set(),
    )
    expect(asked).toBe(false)
    expect(out).toEqual({ id: "n1" })
  })

  it("runs a gated tool when approved", async () => {
    const out = await executeToolCall("fetch", { url: "x" }, [stubTool("fetch")], ctxWith(async () => true), new Set())
    expect(out).toEqual({ ok: true })
  })

  it("returns user_declined and records the tool when refused", async () => {
    const declined = new Set<string>()
    const out = await executeToolCall("fetch", {}, [stubTool("fetch")], ctxWith(async () => false), declined)
    expect(out).toMatchObject({ ok: false, error: "user_declined", tool: "fetch" })
    expect(declined.has("fetch")).toBe(true)
  })

  it("does NOT re-prompt a tool already declined this run (fail closed, no dialog spam)", async () => {
    const declined = new Set<string>(["fetch"])
    let asked = false
    const out = await executeToolCall(
      "fetch", {}, [stubTool("fetch")], ctxWith(async () => ((asked = true), true)), declined,
    )
    expect(asked).toBe(false) // the confirmer was never consulted the second time
    expect(out).toMatchObject({ ok: false, error: "user_declined", tool: "fetch" })
  })

  it("normalizes a thrown tool into a tool_error (never propagates)", async () => {
    const out = await executeToolCall(
      "fetch", {}, [stubTool("fetch", async () => { throw new Error("kaboom") })], ctxWith(async () => true), new Set(),
    )
    expect(out).toMatchObject({ ok: false, error: "tool_error", tool: "fetch" })
    expect((out as { message: string }).message).toContain("kaboom")
  })

  it("gates run without a confirmer wired (headless): the tool runs", async () => {
    let ran = false
    await executeToolCall("fetch", {}, [stubTool("fetch", async () => ((ran = true), { ok: true }))], ctxWith(), new Set())
    expect(ran).toBe(true)
  })
})


describe("runAgent — declined off-board tool is not re-prompted across turns", () => {
  it("prompts once, then auto-declines a retry of the same tool in the same run", async () => {
    let prompts = 0
    const ran = { value: false }
    const spy = defineTool({
      name: "web_search",
      description: "web_search",
      parameters: z.object({ query: z.string().optional() }),
      run: async () => ((ran.value = true), { ok: true }),
    })
    // The model tries web_search, is declined, then stubbornly tries it again.
    const llm = new ScriptedLlm([
      toolTurn("web_search", { query: "a" }),
      toolTurn("web_search", { query: "b" }),
      { kind: "text", text: "fine, answering without it" },
    ])
    const events = await drain(
      runAgent({
        userMessage: "go",
        tools: [spy],
        llm,
        ctx: { store: freshStore("c"), rootId: null, confirmTool: async () => (prompts += 1, false) },
      }),
    )
    expect(prompts).toBe(1) // dialog shown once, not on the retry
    expect(ran.value).toBe(false)
    const declines = events.filter(
      (e) => e.type === "tool_result" && (e.result as { error?: string }).error === "user_declined",
    )
    expect(declines).toHaveLength(2) // both attempts get a clean declined result
  })
})
