import { describe, expect, it } from "vitest"
import { readInkProperty } from "../ink/ink-geometry"
import { createBoardStore } from "../store/create-board-store"
import { applyNativeInkSnapshot } from "./apply-native-snapshot"
import type { NativeInkSnapshot } from "./wire"


const snapshot = (strokeIds: string[], revision = 1): NativeInkSnapshot => ({
  kind: "dim0.native-ink.snapshot",
  version: 1,
  sessionId: "ad7dbd1d-7235-49c9-854f-c00613504eae",
  revision,
  strokes: strokeIds.map((id, index) => ({
    id,
    tool: index % 2 === 0 ? "pen" : "highlighter",
    color: index % 2 === 0 ? "#1F1F24" : "#FACC15",
    width: index % 2 === 0 ? 4 : 14,
    opacity: index % 2 === 0 ? 1 : 0.35,
    points: [
      { x: index * 20, y: 0, pressure: 0.4 },
      { x: index * 20 + 10, y: 10, pressure: 0.7 },
    ],
  })),
})


describe("applyNativeInkSnapshot", () => {
  it("adds formal ink nodes and is idempotent for a repeated snapshot", () => {
    const store = createBoardStore()
    const first = applyNativeInkSnapshot(store, snapshot(["a".repeat(64), "b".repeat(64)]), "board", null)

    expect(first).toEqual({ added: 2, removed: 0, total: 2 })
    expect(store.getNodeCount()).toBe(2)
    expect(store.getAllNodes().every((node) => readInkProperty(node) !== null)).toBe(true)

    const repeated = applyNativeInkSnapshot(store, snapshot(["a".repeat(64), "b".repeat(64)], 2), "board", null)
    expect(repeated).toEqual({ added: 0, removed: 0, total: 2 })
    expect(store.getNodeCount()).toBe(2)
  })

  it("removes strokes erased on iPad without touching ordinary board nodes", () => {
    const store = createBoardStore()
    applyNativeInkSnapshot(store, snapshot(["a".repeat(64), "b".repeat(64)]), "board", null)
    store.addNode({
      id: "ordinary" as never,
      type: "rect",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      angle: 0,
      groups: [],
    })

    const result = applyNativeInkSnapshot(store, snapshot(["b".repeat(64)], 2), "board", null)
    expect(result).toEqual({ added: 0, removed: 1, total: 1 })
    expect(store.getNodeCount()).toBe(2)
    expect(store.getAllNodes().some((node) => node.id === "ordinary")).toBe(true)
  })
})
