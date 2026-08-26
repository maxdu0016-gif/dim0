import { asNodeId, type CanvasStore, type Node } from "@canvas-harness/core"
import { v5 as uuidv5 } from "uuid"
import type { TextProperty } from "@/features/newsfeed/types/properties"
import type { NoteNodeData } from "../convert/note-to-node"
import { createInkNode } from "../ink/ink-geometry"
import { adaptNodeColors } from "../theme/color-adapter"
import { getBoardThemeMode } from "../theme/theme-mode-ref"
import type { NativeInkSnapshot } from "./wire"


const NATIVE_INK_NAMESPACE = "cc744ebb-ea24-5f52-b4a2-bf521678c772"

type NativeInkSource = {
  sessionId: string
  strokeId: string
}

type RelayProperties = Partial<NoteNodeData["properties"]> & {
  native_ink_source?: TextProperty
}


const sourceProperty = (source: NativeInkSource): TextProperty => ({
  type: "text",
  text: JSON.stringify(source),
})


const readSource = (node: Node): NativeInkSource | null => {
  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const properties = (data.properties ?? {}) as RelayProperties
  const raw = properties.nativeInkSource ?? properties.native_ink_source
  if (raw?.type !== "text" || !raw.text) return null

  try {
    const parsed = JSON.parse(raw.text) as Partial<NativeInkSource>
    return typeof parsed.sessionId === "string" && typeof parsed.strokeId === "string"
      ? { sessionId: parsed.sessionId, strokeId: parsed.strokeId }
      : null
  } catch {
    return null
  }
}


const createNativeInkNode = (
  snapshot: NativeInkSnapshot,
  stroke: NativeInkSnapshot["strokes"][number],
  boardId: string,
  parentId: string | null,
): (Omit<Node, "z"> & { z?: number }) | null => {
  const display = getBoardThemeMode() === "dark"
    ? adaptNodeColors({ strokeColor: stroke.color }, "dark").strokeColor
    : stroke.color
  const node = createInkNode({
    id: uuidv5(`${snapshot.sessionId}:${stroke.id}`, NATIVE_INK_NAMESPACE),
    boardId,
    parentId,
    color: stroke.color,
    displayColor: display,
    size: stroke.width,
    samples: stroke.points,
  })
  if (!node) return null

  const data = node.data as NoteNodeData
  return {
    ...node,
    style: {
      ...node.style,
      opacity: Math.round(stroke.opacity * 100),
    },
    data: {
      ...data,
      properties: {
        ...data.properties,
        nativeInkSource: sourceProperty({
          sessionId: snapshot.sessionId,
          strokeId: stroke.id,
        }),
      },
    },
  }
}


export type ApplyNativeSnapshotResult = {
  added: number
  removed: number
  total: number
}


/** Reconcile one iPad's full drawing snapshot as a single undoable board mutation. */
export const applyNativeInkSnapshot = (
  store: CanvasStore,
  snapshot: NativeInkSnapshot,
  boardId: string,
  parentId: string | null,
): ApplyNativeSnapshotResult => {
  const incomingStrokeIds = new Set(snapshot.strokes.map((stroke) => stroke.id))
  const existing = new Map<string, Node>()

  for (const node of store.getAllNodes()) {
    const source = readSource(node)
    if (source?.sessionId === snapshot.sessionId) existing.set(source.strokeId, node)
  }

  const stale = [...existing.entries()]
    .filter(([strokeId]) => !incomingStrokeIds.has(strokeId))
    .map(([, node]) => node)
  const missing = snapshot.strokes
    .filter((stroke) => !existing.has(stroke.id))
    .map((stroke) => createNativeInkNode(snapshot, stroke, boardId, parentId))
    .filter((node): node is Omit<Node, "z"> & { z?: number } => node !== null)

  if (stale.length > 0 || missing.length > 0) {
    store.batch(() => {
      for (const node of stale) store.removeNode(asNodeId(node.id))
      for (const node of missing) store.addNode(node)
    })
  }

  return {
    added: missing.length,
    removed: stale.length,
    total: snapshot.strokes.length,
  }
}
