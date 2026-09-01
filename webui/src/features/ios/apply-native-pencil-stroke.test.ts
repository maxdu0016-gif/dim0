import { describe, expect, it } from "vitest"
import { readInkProperty } from "@/features/board/harness/ink/ink-geometry"
import { createBoardStore } from "@/features/board/harness/store/create-board-store"
import { applyNativePencilStroke } from "./apply-native-pencil-stroke"
import type { NativePencilStroke } from "./native-pencil-bridge"


const message = (): NativePencilStroke => ({
  kind: "dim0.native-pencil.stroke",
  version: 1,
  sessionId: "ad7dbd1d-7235-49c9-854f-c00613504eae",
  contextId: "board:",
  stroke: {
    id: "a".repeat(64),
    tool: "pen",
    color: "#1F1F24",
    width: 8,
    opacity: 1,
    points: [
      { x: 120, y: 70, pressure: 0.4 },
      { x: 140, y: 90, pressure: 0.7 },
    ],
  },
})


describe("applyNativePencilStroke", () => {
  it("converts screen coordinates and adds one formal ink node", () => {
    const store = createBoardStore()
    store.setCamera({ x: 100, y: 50, z: 2 })

    const result = applyNativePencilStroke(store, message(), "board", null)

    expect(result.handled).toBe(true)
    expect(result.added).toBe(true)
    const node = store.getAllNodes()[0]!
    const ink = readInkProperty(node)!
    expect(node.type).toBe("ink")
    expect(node.x + ink.points[0]![0]).toBeCloseTo(160)
    expect(node.y + ink.points[0]![1]).toBeCloseTo(85)
    expect(ink.size).toBe(4)
  })

  it("deduplicates a retried native stroke by its deterministic node id", () => {
    const store = createBoardStore()
    const first = applyNativePencilStroke(store, message(), "board", "folder")
    const repeated = applyNativePencilStroke(store, message(), "board", "folder")

    expect(first).toEqual({ handled: true, added: true, nodeId: first.nodeId })
    expect(repeated).toEqual({ handled: true, added: false, nodeId: first.nodeId })
    expect(store.getNodeCount()).toBe(1)
  })

  it("emits the ordinary local node-add batch consumed by persistence and sync v2", () => {
    const store = createBoardStore()
    const operationTypes: string[] = []
    const unsubscribe = store.subscribe("change", (batch) => {
      operationTypes.push(...batch.ops.map((operation) => operation.type))
    })

    applyNativePencilStroke(store, message(), "board", null)
    unsubscribe()

    expect(operationTypes).toContain("node.add")
  })
})
