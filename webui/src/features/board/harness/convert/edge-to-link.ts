import type { Edge, EdgeEnd } from "@canvas-harness/core"
import type { Link } from "@/features/board/types/link"
import { canvasEdgeStyleToDim0Link } from "./style"
import type { LinkEdgeData } from "./link-to-edge"


type FlatEnd = {
  /** Empty string when the endpoint is free-floating (the '' sentinel — see §3.5). */
  nodeId: string
  position?: { x: number; y: number }
  /**
   * True when `position` is a node-local offset (attached endpoint).
   * False when `position` is an absolute world coord (free endpoint).
   * Always set so the wire format is explicit — see backend
   * `PositionProperty.is_local_offset`.
   */
  isLocalOffset: boolean
}


/** Flatten an EdgeEnd into the Link wire format for `start_point`/`end_point`. */
const flattenEnd = (end: EdgeEnd): FlatEnd => {
  if ("nodeId" in end) {
    return {
      nodeId: end.nodeId as unknown as string,
      position: { x: end.localOffset.x, y: end.localOffset.y },
      isLocalOffset: true,
    }
  }
  return {
    nodeId: "",
    position: end.worldPoint,
    isLocalOffset: false,
  }
}


/**
 * Convert a canvas-harness Edge back to a Dim0 Link. Inverse of `linkToEdge`.
 * Always emits the new local-offset wire format for attached endpoints;
 * legacy edges loaded with world coords get upgraded on first save.
 */
export const edgeToLink = (edge: Edge): Link => {
  const data = (edge.data ?? {}) as Partial<LinkEdgeData>
  const sourceFlat = flattenEnd(edge.source)
  const targetFlat = flattenEnd(edge.target)
  const groupIds = edge.groups as unknown as string[]
  const controlPos = edge.control?.[0]

  return {
    id: edge.id as unknown as string,
    type: "link",
    version: data.version ?? 1,
    source: sourceFlat.nodeId,
    target: targetFlat.nodeId,
    label: edge.content ? { markdown: edge.content } : undefined,
    style: canvasEdgeStyleToDim0Link(edge.style, {
      angle: 0,
      groupIds,
      pathStyle: edge.pathStyle,
    }),
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt,
    deletedAt: data.deletedAt,
    graphUid: data.graphUid ?? "",
    parentId: data.parentId,
    properties: {
      edgeControlPoint: controlPos
        ? { type: "position", position: controlPos }
        : { type: "position" },
      startPoint: sourceFlat.position
        ? {
            type: "position",
            position: sourceFlat.position,
            isLocalOffset: sourceFlat.isLocalOffset,
          }
        : undefined,
      endPoint: targetFlat.position
        ? {
            type: "position",
            position: targetFlat.position,
            isLocalOffset: targetFlat.isLocalOffset,
          }
        : undefined,
    },
  }
}
