import { describe, expect, it } from "vitest"
import { asEdgeId, asNodeId } from "@canvas-harness/core"
import { freshStore } from "@/test/canvas"
import type { ToolContext } from "./types"
import { createNote, linkNotes, writeNote } from "./tools"


const parentOf = (store: ReturnType<typeof freshStore>, id: string): string | null | undefined =>
  (store.getNode(asNodeId(id))?.data as { parentId?: string | null } | undefined)?.parentId


const edgeParentOf = (store: ReturnType<typeof freshStore>, id: string): string | null | undefined =>
  (store.getEdge(asEdgeId(id))?.data as { parentId?: string | null } | undefined)?.parentId


describe("agent tools stamp the current layer (parentId) at creation", () => {
  it("create_note is born in the current sub-board (ctx.rootId)", async () => {
    const store = freshStore("c")
    const ctx: ToolContext = { store, rootId: "folder-1" }
    const { id } = (await createNote.run({ title: "In folder" }, ctx)) as { id: string }
    expect(parentOf(store, id)).toBe("folder-1")
  })


  it("create_note at the root layer has no parentId", async () => {
    const store = freshStore("c")
    const { id } = (await createNote.run({ title: "At root" }, { store, rootId: null })) as { id: string }
    expect(parentOf(store, id)).toBeUndefined()
  })


  it("write_note (new note) is born in the current sub-board", async () => {
    const store = freshStore("c")
    const { id } = (await writeNote.run({ content: "body", label: "T" }, { store, rootId: "folder-2" })) as { id: string }
    expect(parentOf(store, id)).toBe("folder-2")
  })


  it("write_note rewrite keeps the note's existing layer (doesn't move it)", async () => {
    const store = freshStore("c")
    const { id } = (await createNote.run({ title: "Orig" }, { store, rootId: "folder-A" })) as { id: string }
    // Rewrite the SAME note while standing in a different layer — it must not move.
    await writeNote.run({ note_id: id, content: "new body" }, { store, rootId: "folder-B" })
    expect(parentOf(store, id)).toBe("folder-A")
  })


  it("link_notes edges are born in the current sub-board", async () => {
    const store = freshStore("c")
    const ctx: ToolContext = { store, rootId: "folder-3" }
    const a = (await createNote.run({ title: "A" }, ctx)) as { id: string }
    const b = (await createNote.run({ title: "B" }, ctx)) as { id: string }
    const { id } = (await linkNotes.run({ sourceId: a.id, targetId: b.id }, ctx)) as { id: string }
    expect(edgeParentOf(store, id)).toBe("folder-3")
  })
})
