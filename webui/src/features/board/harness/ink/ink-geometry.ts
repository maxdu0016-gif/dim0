import {
  asNodeId,
  buildInkOutline,
  createInkGeometry,
  readInkData,
  type InkSample,
  type Node,
} from "@canvas-harness/core"
import type { InkNodeFactoryInput } from "@canvas-harness/react"
import type { InkProperty } from "@/features/newsfeed/types/properties"
import type { NoteNodeData } from "../convert/note-to-node"


export { hitTestInkWorld } from "@canvas-harness/core"


type InkProperties = Partial<NoteNodeData["properties"]> & {
  ink_data?: InkProperty
}


const readStoredInkProperty = (node: Node): InkProperty | null => {
  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const properties = (data.properties ?? {}) as InkProperties
  const raw = properties.inkData ?? properties.ink_data
  if (!raw || raw.type !== "ink" || !Array.isArray(raw.points)) return null

  const relayRaw = raw as InkProperty & {
    intrinsic_width?: number
    intrinsic_height?: number
  }
  const intrinsicWidth = relayRaw.intrinsicWidth ?? relayRaw.intrinsic_width
  const intrinsicHeight = relayRaw.intrinsicHeight ?? relayRaw.intrinsic_height
  if (!Number.isFinite(intrinsicWidth) || !Number.isFinite(intrinsicHeight)) return null

  const outline = Array.isArray(raw.outline)
    ? raw.outline
    : buildInkOutline(
        raw.points.map(([x, y, pressure]) => ({ x, y, pressure })),
        raw.size,
      )
  return { ...raw, outline, intrinsicWidth, intrinsicHeight }
}


/**
 * Return the backend-compatible ink envelope. New strokes are rendered from
 * Canvas Harness' `data.ink`; the outline here exists only for the current
 * Dim0 REST schema and can be removed after that schema accepts engine data.
 */
export const readInkProperty = (node: Node): InkProperty | null => {
  const stored = readStoredInkProperty(node)
  if (stored) return stored

  const ink = readInkData(node)
  if (!ink) return null
  return {
    type: "ink",
    version: 1,
    size: ink.size,
    points: ink.points.map(([x, y, pressure]) => [x, y, pressure]),
    outline: buildInkOutline(
      ink.points.map(([x, y, pressure]) => ({ x, y, pressure })),
      ink.size,
    ),
    intrinsicWidth: ink.intrinsicWidth,
    intrinsicHeight: ink.intrinsicHeight,
  }
}


/** Upgrade persisted pre-engine ink nodes before they enter the store. */
export const withCanvasHarnessInkData = (node: Node): Node => {
  if (node.type !== "ink" || readInkData(node)) return node
  const legacy = readStoredInkProperty(node)
  if (!legacy) return node

  return {
    ...node,
    data: {
      ...(node.data ?? {}),
      ink: {
        type: "ink",
        version: 1,
        size: legacy.size,
        points: legacy.points,
        intrinsicWidth: legacy.intrinsicWidth,
        intrinsicHeight: legacy.intrinsicHeight,
      },
    },
  }
}


export type Dim0InkNodeContext = {
  boardId: string
  parentId: string | null
  color: string
  displayColor?: string
}


/** Product metadata adapter used by Canvas Harness' bottom-layer ink factory. */
export const createDim0InkNode = (
  input: InkNodeFactoryInput,
  context: Dim0InkNodeContext,
): (Omit<Node, "z"> & { z?: number }) => {
  const { geometry, samples, size } = input
  const outline = buildInkOutline(samples, size)
  const inkData: InkProperty = {
    type: "ink",
    version: 1,
    size,
    points: geometry.ink.points.map(([x, y, pressure]) => [x, y, pressure]),
    outline: outline.map(([x, y]) => [x - geometry.x, y - geometry.y]),
    intrinsicWidth: geometry.ink.intrinsicWidth,
    intrinsicHeight: geometry.ink.intrinsicHeight,
  }
  const now = new Date().toISOString()
  const data: NoteNodeData & { ink: typeof geometry.ink } = {
    ...(input.data ?? {}),
    ink: geometry.ink,
    noteType: "note",
    styleType: "ink",
    version: 1,
    createdAt: now,
    graphUid: context.boardId,
    parentId: context.parentId ?? undefined,
    properties: { inkData },
    _storedColors: { strokeColor: context.color },
  }

  return {
    id: input.id,
    type: "ink",
    x: geometry.x,
    y: geometry.y,
    w: geometry.w,
    h: geometry.h,
    angle: 0,
    groups: [],
    style: {
      ...input.style,
      strokeColor: context.displayColor ?? input.style.strokeColor ?? context.color,
      backgroundColor: "transparent",
      autoFit: false,
    },
    data,
  }
}


/** Convert an iPad-native stroke through the same engine geometry path. */
export const createInkNode = ({
  id,
  boardId,
  parentId,
  color,
  displayColor = color,
  size,
  samples,
}: {
  id: string
  boardId: string
  parentId: string | null
  color: string
  displayColor?: string
  size: number
  samples: ReadonlyArray<InkSample>
}): (Omit<Node, "z"> & { z?: number }) | null => {
  const geometry = createInkGeometry(samples, size)
  if (!geometry) return null
  return createDim0InkNode(
    {
      id: asNodeId(id),
      geometry,
      samples,
      size,
      style: { strokeColor: displayColor },
    },
    { boardId, parentId, color, displayColor },
  )
}
