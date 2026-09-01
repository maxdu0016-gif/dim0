import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import {
  configureNativePencil,
  initNativePencilBridge,
  subscribeNativePencilStrokes,
  type NativePencilStroke,
} from "./native-pencil-bridge"


const completedStroke = (): NativePencilStroke => ({
  kind: "dim0.native-pencil.stroke",
  version: 1,
  sessionId: "ad7dbd1d-7235-49c9-854f-c00613504eae",
  contextId: "board:",
  stroke: {
    id: "a".repeat(64),
    tool: "pen",
    color: "#1F1F24",
    width: 4,
    opacity: 1,
    points: [
      { x: 10, y: 20, pressure: 0.4 },
      { x: 30, y: 40, pressure: 0.7 },
    ],
  },
})


describe("native Pencil bridge", () => {
  let dispose: (() => void) | null = null

  beforeEach(() => {
    useBoardAppStore.setState({ tool: "select" })
  })

  afterEach(() => {
    dispose?.()
    dispose = null
    delete window.webkit
  })

  it("toggles the active board tool between eraser and ink", () => {
    dispose = initNativePencilBridge()
    const firstDetail = { handled: false }

    window.dispatchEvent(new CustomEvent("dim0:native-pencil-double-tap", { detail: firstDetail }))

    expect(firstDetail.handled).toBe(true)
    expect(useBoardAppStore.getState().tool).toBe("eraser")

    window.dispatchEvent(new CustomEvent("dim0:native-pencil-double-tap", { detail: { handled: false } }))

    expect(useBoardAppStore.getState().tool).toBe("ink")
  })

  it("stops changing tools after the bridge is disposed", () => {
    dispose = initNativePencilBridge()
    dispose()
    dispose = null

    window.dispatchEvent(new CustomEvent("dim0:native-pencil-double-tap", { detail: { handled: false } }))

    expect(useBoardAppStore.getState().tool).toBe("select")
  })

  it("posts canvas configuration to the native message handler", () => {
    const messages: unknown[] = []
    window.webkit = {
      messageHandlers: {
        dim0NativePencil: { postMessage: (message) => messages.push(message) },
      },
    }

    expect(configureNativePencil({
      enabled: true,
      contextId: "board:",
      rect: { x: 1, y: 2, width: 300, height: 200 },
      color: "#FFFFFF",
      storedColor: "#1F1F24",
      width: 8,
    })).toBe(true)
    expect(messages).toEqual([{
      kind: "dim0.native-pencil.configure",
      version: 1,
      enabled: true,
      contextId: "board:",
      rect: { x: 1, y: 2, width: 300, height: 200 },
      color: "#FFFFFF",
      storedColor: "#1F1F24",
      width: 8,
    }])
  })

  it("acknowledges a valid completed stroke only when the consumer handles it", () => {
    dispose = subscribeNativePencilStrokes(() => true)
    const detail = completedStroke()

    window.dispatchEvent(new CustomEvent("dim0:native-pencil-stroke", { detail }))

    expect(detail.handled).toBe(true)
  })

  it("does not acknowledge malformed native stroke data", () => {
    dispose = subscribeNativePencilStrokes(() => true)
    const detail = { ...completedStroke(), version: 2, handled: false }

    window.dispatchEvent(new CustomEvent("dim0:native-pencil-stroke", { detail }))

    expect(detail.handled).toBe(false)
  })
})
