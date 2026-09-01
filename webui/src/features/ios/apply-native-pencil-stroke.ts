import { asNodeId, screenToWorld, type CanvasStore, type Node } from "@canvas-harness/core"
import { v5 as uuidv5 } from "uuid"
import type { NoteNodeData } from "@/features/board/harness/convert/note-to-node"
import { createInkNode } from "@/features/board/harness/ink/ink-geometry"
import { adaptNodeColors } from "@/features/board/harness/theme/color-adapter"
import { getBoardThemeMode } from "@/features/board/harness/theme/theme-mode-ref"
import type { TextProperty } from "@/features/newsfeed/types/properties"
import type { NativePencilStroke } from "./native-pencil-bridge"


const NATIVE_INK_NAMESPACE = "cc744ebb-ea24-5f52-b4a2-bf521678c772"


/** Persists the native source identity in the backend-compatible note envelope. */
const sourceProperty = (message: NativePencilStroke): TextProperty => ({
  type: "text",
  text: JSON.stringify({
    sessionId: message.sessionId,
    strokeId: message.stroke.id,
  }),
})


export type ApplyNativePencilStrokeResult = {
  handled: boolean
  added: boolean
  nodeId: string
}


/** Converts one completed native screen-space stroke into one idempotent formal ink node. */
export const applyNativePencilStroke = (
  store: CanvasStore,
  message: NativePencilStroke,
  boardId: string,
  parentId: string | null,
): ApplyNativePencilStrokeResult => {
  const nodeId = uuidv5(`${message.sessionId}:${message.stroke.id}`, NATIVE_INK_NAMESPACE)
  if (store.getNode(asNodeId(nodeId))) {
    return { handled: true, added: false, nodeId }
  }

  const camera = store.getCamera()
  const samples = message.stroke.points.map((point) => ({
    ...screenToWorld({ x: point.x, y: point.y }, camera),
    pressure: point.pressure,
  }))
  const displayColor = getBoardThemeMode() === "dark"
    ? (adaptNodeColors({ strokeColor: message.stroke.color }, "dark").strokeColor ?? message.stroke.color)
    : message.stroke.color
  const node = createInkNode({
    id: nodeId,
    boardId,
    parentId,
    color: message.stroke.color,
    displayColor,
    size: message.stroke.width / camera.z,
    samples,
  })
  if (!node) return { handled: false, added: false, nodeId }

  const data = node.data as NoteNodeData
  const formalNode: Omit<Node, "z"> & { z?: number } = {
    ...node,
    style: {
      ...node.style,
      opacity: Math.round(message.stroke.opacity * 100),
    },
    data: {
      ...data,
      properties: {
        ...data.properties,
        nativeInkSource: sourceProperty(message),
      },
    },
  }
  store.addNode(formalNode)
  return { handled: true, added: true, nodeId }
}
