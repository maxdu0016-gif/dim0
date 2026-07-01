import { describe, expect, it } from "vitest"
import { asNodeId } from "@canvas-harness/core"
import type { BoardContent, DimEdge, DimNode } from "."
import { filterContentByLayer } from "./layer"


const node = (id: string, parentId?: string | null): DimNode =>
  ({ id: asNodeId(id), data: { parentId, meta: { v: 1, createdAt: 0, updatedAt: 0 } } }) as unknown as DimNode


const edge = (id: string, parentId?: string | null): DimEdge =>
  ({ id, data: { parentId, meta: { v: 1, createdAt: 0, updatedAt: 0 } } }) as unknown as DimEdge


const content = (nodes: DimNode[], edges: DimEdge[] = []): BoardContent =>
  ({ schemaVersion: 1, nodes, edges, groups: [{ id: "g1" }], frameOrder: [asNodeId("f1")] }) as unknown as BoardContent


describe("filterContentByLayer", () => {
  it("keeps only root-layer nodes/edges when rootId is null", () => {
    const c = content(
      [node("a"), node("b", null), node("child", "folder1")],
      [edge("e-root", null), edge("e-child", "folder1")],
    )
    const out = filterContentByLayer(c, null)
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "b"]) // undefined + null parentId = root
    expect(out.edges.map((e) => e.id)).toEqual(["e-root"])
  })


  it("keeps only the folder's layer when rootId is a folder id", () => {
    const c = content(
      [node("root"), node("c1", "folder1"), node("c2", "folder1"), node("other", "folder2")],
      [edge("e1", "folder1"), edge("e2", "folder2")],
    )
    const out = filterContentByLayer(c, "folder1")
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["c1", "c2"])
    expect(out.edges.map((e) => e.id)).toEqual(["e1"])
  })


  it("passes groups and frameOrder through unchanged", () => {
    const c = content([node("a")])
    const out = filterContentByLayer(c, null)
    expect(out.groups).toEqual(c.groups)
    expect(out.frameOrder).toEqual(c.frameOrder)
  })


  it("is a no-op shape for a flat board (all root)", () => {
    const c = content([node("a"), node("b"), node("c")])
    expect(filterContentByLayer(c, null).nodes).toHaveLength(3)
  })
})
