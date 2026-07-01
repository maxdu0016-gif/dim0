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
import { pickRandomColorOfShade } from "@/features/board/lib/colors/tailwind"
import { AUTOFIT_DISABLED_TYPES } from "@/features/board/harness/convert/note-to-node"
import { validateMiniAppSource } from "@/features/mini-app/validate"
import type { Tool } from "./types"
import { estimateNoteSize } from "./note-size"


/**
 * A random Tailwind-200 fill per note (mirrors the backend's
 * `random.choice(TAILWIND_200_ADAPTED)` in notes/service.py). Stored as
 * `_storedColors` so the harness theme hooks project the display style for the
 * current mode — without this, agent notes render with the lib's non-theme-aware
 * default (always light). Black text reads on every light-200 swatch; the dark
 * variant is derived on theme flip.
 */
const randomNoteColors = (): DimNodeData["_storedColors"] => ({
  backgroundColor: pickRandomColorOfShade(200)?.hex ?? "#dbeafe",
  strokeColor: "#00000000",
  textColor: "#000000",
})


// Default box size per canvas node type (mirrors backend get_default_note_size).
const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  rect: { w: 320, h: 180 },
  ellipse: { w: 320, h: 320 },
  diamond: { w: 340, h: 340 },
  sheet: { w: 440, h: 440 },
  "mini-app": { w: 720, h: 440 },
  widget: { w: 480, h: 320 },
  "code-sandbox": { w: 560, h: 360 },
}


/** Content-fit size for a note, falling back to the type's default box. */
const noteGeometry = (nodeType: string, content: string): { w: number; h: number } => {
  const base = DEFAULT_SIZE[nodeType] ?? { w: 320, h: 180 }
  const fitted = estimateNoteSize(nodeType, base.w, content)
  return fitted ? { w: fitted.width, h: fitted.height } : base
}


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
      id: { type: "string", description: "Optional explicit id; omit to auto-generate." },
      title: { type: "string", description: "Short note title (the heading, stored separately from the body)." },
      body: { type: "string", description: "The note body — prose or markdown." },
      x: { type: "number", description: "Optional x canvas position; defaults to 0 (auto-arranged after the turn)." },
      y: { type: "number", description: "Optional y canvas position; defaults to 0 (auto-arranged after the turn)." },
    },
  },
  async run(args, ctx) {
    const id = asNodeId(str(args.id) || ctx.store.generateId())
    const body = str(args.body)
    const { w, h } = noteGeometry("rect", body)
    ctx.store.batch(() => {
      ctx.store.addNode({
        id,
        type: "rect",
        x: num(args.x),
        y: num(args.y),
        w,
        h,
        angle: 0,
        groups: [],
        content: body,
        data: { label: str(args.title), parentId: ctx.rootId ?? undefined, meta: meta(), _storedColors: randomNoteColors() } satisfies DimNodeData,
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
    properties: {
      id: { type: "string", description: "Id of the note to update." },
      title: { type: "string", description: "New title; omit to leave unchanged." },
      body: { type: "string", description: "New body; omit to leave unchanged." },
    },
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
    properties: {
      sourceId: { type: "string", description: "Exact id of the note the arrow starts from." },
      targetId: { type: "string", description: "Exact id of the note the arrow points to." },
      label: { type: "string", description: "Optional short label on the edge, e.g. 'yes', 'no', 'then', 'reads', 'causes'." },
    },
    required: ["sourceId", "targetId"],
  },
  async run(args, ctx) {
    const id = asEdgeId(ctx.store.generateId())
    const sourceId = asNodeId(str(args.sourceId))
    const targetId = asNodeId(str(args.targetId))
    // Attach at each node's CENTER (local frame is from top-left). canvas-harness
    // auto-clips the center→center line to each node's border, so the endpoint
    // lands at the border facing the peer — the backend's _edge_anchor_offset,
    // for free, and it re-clips live as `arrangeCreatedNodes` moves the nodes.
    const center = (nodeId: typeof sourceId): { x: number; y: number } => {
      const node = ctx.store.getNode(nodeId)
      return node ? { x: node.w / 2, y: node.h / 2 } : { x: 0, y: 0 }
    }
    ctx.store.batch(() => {
      ctx.store.addEdge({
        id,
        source: { nodeId: sourceId, localOffset: center(sourceId) },
        target: { nodeId: targetId, localOffset: center(targetId) },
        pathStyle: "bezier",
        groups: [],
        data: { label: str(args.label) || undefined, parentId: ctx.rootId ?? undefined, meta: meta() } satisfies DimEdgeData,
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
      content: { type: "string", description: "The complete note body after this write — prose, markdown, code, or widget source." },
      label: { type: "string", description: "Optional short title, stored separately from the body." },
      note_type: { type: "string", description: "Visual note type: rectangle | sheet | mini-app | widget." },
      note_id: { type: "string", description: "Existing note id to fully rewrite; omit to create a new note." },
    },
    required: ["content"],
  },
  async run(args, ctx) {
    const nodeType = toNodeType(str(args.note_type))
    const content = str(args.content)

    // Custom types render only a preview of `content`, so disable the lib's
    // grow-to-fit AT CREATION (mirrors backend note_to_wire_node). Setting it
    // here — not just via the reactive stamp hook — means the node is born with
    // autoFit off and the lib never grows it before the flag lands.
    const autoFitStyle = AUTOFIT_DISABLED_TYPES.has(nodeType) ? { autoFit: false } : undefined

    // Validate a mini-app before persisting, so a malformed one is rejected with
    // line/col for the agent to fix this turn (not a silently-broken note).
    if (nodeType === "mini-app") {
      const v = validateMiniAppSource(content)
      if (!v.ok) {
        return { error: `mini-app invalid: ${v.message}${v.line ? ` (line ${v.line}:${v.column})` : ""}` }
      }
    }

    const existingId = str(args.note_id)

    if (existingId) {
      const id = asNodeId(existingId)
      const node = ctx.store.getNode(id)
      if (node) {
        const prev = node.data as DimNodeData | undefined
        ctx.store.batch(() =>
          ctx.store.updateNode(id, {
            type: nodeType,
            content,
            data: { ...prev, label: str(args.label) || prev?.label || "", meta: meta() },
            ...(autoFitStyle ? { style: { ...(node.style ?? {}), ...autoFitStyle } } : {}),
          }),
        )
        return { id: String(id) }
      }
    }

    const id = asNodeId(existingId || ctx.store.generateId())
    const { w, h } = noteGeometry(nodeType, content)
    ctx.store.batch(() => {
      ctx.store.addNode({
        id,
        type: nodeType,
        x: 0,
        y: 0,
        w,
        h,
        angle: 0,
        groups: [],
        content,
        ...(autoFitStyle ? { style: autoFitStyle } : {}),
        data: { label: str(args.label), parentId: ctx.rootId ?? undefined, meta: meta(), _storedColors: randomNoteColors() } satisfies DimNodeData,
      })
    })
    return { id: String(id) }
  },
}


export const getNote: Tool = {
  name: "get_note",
  description: "Read an existing note's label, content, and type.",
  parameters: { type: "object", properties: { note_id: { type: "string", description: "Id of the note to read." } }, required: ["note_id"] },
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
      note_id: { type: "string", description: "Id of the note to edit." },
      field: { type: "string", description: "Which field to edit: content | label." },
      old: { type: "string", description: "Exact substring to find; must be unique unless replace_all is set." },
      new: { type: "string", description: "Replacement text for `old`." },
      replace_all: { type: "boolean", description: "When true, replace every occurrence of `old` instead of requiring uniqueness." },
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
  parameters: { type: "object", properties: { query: { type: "string", description: "Full-text query matched against note titles and bodies." } }, required: ["query"] },
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
