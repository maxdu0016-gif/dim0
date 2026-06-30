/**
 * The agent's tools (A4) — OURS, executed LOCALLY against the canvas store.
 *
 * Each tool wraps its mutation in `store.batch()` so an agent action is ONE
 * undoable batch (INV-8) and flows through the same persistence + search + sync
 * pipeline as a human edit. No server round-trips for these.
 */
import { asEdgeId, asNodeId } from "@canvas-harness/core"
import type { Node } from "@canvas-harness/core"
import type { DimEdgeData, DimNodeData } from "@/features/board/model"
import type { Tool } from "./types"


/** Fresh SyncMeta stamp for a created/updated entity. */
const meta = (): DimNodeData["meta"] => {
  const t = Date.now()
  return { v: 1, createdAt: t, updatedAt: t }
}


// Coerce loosely-typed tool args to string/number with a fallback.
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback)
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : fallback)


// Map a prompt-level note_type to a canvas node type. Shapes the agent can't
// render distinctly (ellipse/diamond) fall back to the default rectangle.
const NODE_TYPE: Record<string, string> = {
  rectangle: "rect",
  rect: "rect",
  sheet: "sheet",
  "mini-app": "mini-app",
  widget: "widget",
  "code-sandbox": "code-sandbox",
}
const toNodeType = (t: string): string => NODE_TYPE[t] ?? "rect"


export const createNote: Tool = {
  name: "create_note",
  description: "Create a note on the board with a title and optional body.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Optional explicit id" },
      title: { type: "string" },
      body: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
    },
  },
  async run(args, ctx) {
    const id = asNodeId(str(args.id) || ctx.store.generateId())
    ctx.store.batch(() => {
      ctx.store.addNode({
        id,
        type: "rect",
        x: num(args.x),
        y: num(args.y),
        w: 240,
        h: 120,
        angle: 0,
        groups: [],
        content: str(args.body),
        data: { label: str(args.title), meta: meta() } satisfies DimNodeData,
      })
    })
    return { id: String(id) }
  },
}


export const updateNote: Tool = {
  name: "update_note",
  description: "Update a note's title and/or body.",
  parameters: {
    type: "object",
    properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
    required: ["id"],
  },
  async run(args, ctx) {
    const id = asNodeId(str(args.id))
    const node = ctx.store.getNode(id)
    if (!node) return { error: "note not found" }
    const patch: Partial<Node> = {}
    if (typeof args.body === "string") patch.content = args.body
    if (typeof args.title === "string") {
      patch.data = { ...(node.data as DimNodeData | undefined), label: args.title, meta: meta() }
    }
    ctx.store.batch(() => ctx.store.updateNode(id, patch))
    return { id: String(id) }
  },
}


export const linkNotes: Tool = {
  name: "link_notes",
  description: "Create a directed link from one note to another.",
  parameters: {
    type: "object",
    properties: { sourceId: { type: "string" }, targetId: { type: "string" }, label: { type: "string" } },
    required: ["sourceId", "targetId"],
  },
  async run(args, ctx) {
    const id = asEdgeId(ctx.store.generateId())
    ctx.store.batch(() => {
      ctx.store.addEdge({
        id,
        source: { nodeId: asNodeId(str(args.sourceId)), localOffset: { x: 0, y: 0 } },
        target: { nodeId: asNodeId(str(args.targetId)), localOffset: { x: 0, y: 0 } },
        pathStyle: "bezier",
        groups: [],
        data: { label: str(args.label) || undefined, meta: meta() } satisfies DimEdgeData,
      })
    })
    return { id: String(id) }
  },
}


export const writeNote: Tool = {
  name: "write_note",
  description: "Create a new note, or fully rewrite an existing one when note_id is given. note_type: rectangle | sheet | mini-app | widget.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string" },
      label: { type: "string", description: "Short title" },
      note_type: { type: "string", description: "rectangle | sheet | mini-app | widget" },
      note_id: { type: "string", description: "Set to rewrite an existing note" },
    },
    required: ["content"],
  },
  async run(args, ctx) {
    const nodeType = toNodeType(str(args.note_type))
    const existingId = str(args.note_id)

    if (existingId) {
      const id = asNodeId(existingId)
      const node = ctx.store.getNode(id)
      if (node) {
        const prev = node.data as DimNodeData | undefined
        ctx.store.batch(() =>
          ctx.store.updateNode(id, {
            type: nodeType,
            content: str(args.content),
            data: { ...prev, label: str(args.label) || prev?.label || "", meta: meta() },
          }),
        )
        return { id: String(id) }
      }
    }

    const id = asNodeId(existingId || ctx.store.generateId())
    ctx.store.batch(() => {
      ctx.store.addNode({
        id,
        type: nodeType,
        x: 0,
        y: 0,
        w: 240,
        h: 120,
        angle: 0,
        groups: [],
        content: str(args.content),
        data: { label: str(args.label), meta: meta() } satisfies DimNodeData,
      })
    })
    return { id: String(id) }
  },
}


export const getNote: Tool = {
  name: "get_note",
  description: "Read an existing note's label, content, and type.",
  parameters: { type: "object", properties: { note_id: { type: "string" } }, required: ["note_id"] },
  async run(args, ctx) {
    const id = asNodeId(str(args.note_id))
    const node = ctx.store.getNode(id)
    if (!node) return { error: "note not found" }
    return {
      id: String(id),
      label: (node.data as DimNodeData | undefined)?.label ?? "",
      content: node.content ?? "",
      note_type: node.type,
    }
  },
}


export const editNote: Tool = {
  name: "edit_note",
  description: "Targeted edit: replace `old` with `new` in a note's content or label. Fails unless `old` is unique (or replace_all).",
  parameters: {
    type: "object",
    properties: {
      note_id: { type: "string" },
      field: { type: "string", description: "content | label" },
      old: { type: "string" },
      new: { type: "string" },
      replace_all: { type: "boolean" },
    },
    required: ["note_id", "field", "old", "new"],
  },
  async run(args, ctx) {
    const id = asNodeId(str(args.note_id))
    const node = ctx.store.getNode(id)
    if (!node) return { error: "note not found" }

    const field = str(args.field) === "label" ? "label" : "content"
    const oldStr = str(args.old)
    const prev = node.data as DimNodeData | undefined
    const current = field === "label" ? prev?.label ?? "" : node.content ?? ""

    const occurrences = oldStr ? current.split(oldStr).length - 1 : 0
    if (occurrences === 0) return { error: "`old` not found in field" }
    if (occurrences > 1 && args.replace_all !== true) {
      return { error: "`old` occurs multiple times; expand it for uniqueness or set replace_all" }
    }
    const updated = args.replace_all === true ? current.split(oldStr).join(str(args.new)) : current.replace(oldStr, str(args.new))

    ctx.store.batch(() =>
      field === "label"
        ? ctx.store.updateNode(id, { data: { ...prev, label: updated, meta: meta() } })
        : ctx.store.updateNode(id, { content: updated }),
    )
    return { id: String(id) }
  },
}


export const searchNotes: Tool = {
  name: "search_notes",
  description: "Full-text search notes on the board. Returns matching ids + titles.",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  async run(args, ctx) {
    if (!ctx.search) return { results: [] }
    const ids = await ctx.search.query(str(args.query))
    const results = ids.map((id) => {
      const node = ctx.store.getNode(asNodeId(id))
      return { id, title: (node?.data as DimNodeData | undefined)?.label ?? "" }
    })
    return { results }
  },
}


export const listBoards: Tool = {
  name: "list_boards",
  description: "List the user's boards.",
  parameters: { type: "object", properties: {} },
  async run(_args, ctx) {
    if (!ctx.registry) return { boards: [] }
    const boards = await ctx.registry.listBoards()
    return { boards: boards.map((b) => ({ id: b.id, title: b.title })) }
  },
}


export const localTools: Tool[] = [createNote, updateNote, linkNotes, searchNotes, listBoards]


/** The note-building tools the chat agent uses (matches the system prompt's vocabulary). */
export const agentBuildTools: Tool[] = [writeNote, editNote, getNote, linkNotes]
