import type { Edge, EdgeEnd, Node } from "@canvas-harness/core"
import type { Link } from "@/features/board/types/link"
import { canvasEdgeStyleToDim0Link } from "./style"
import type { LinkEdgeData } from "./link-to-edge"


type FlatEnd = {
  /** Empty string when the endpoint is free-floating (the '' sentinel — see §3.5). */
  nodeId: string
  /** Only set when the endpoint isn't at the attached node's center, or when it's free. */
  worldPoint?: { x: number; y: number }
}


/** Flatten an EdgeEnd to (nodeId, optional worldPoint) for Link storage. */
const flattenEnd = (end: EdgeEnd, nodes: Map<string, Node>): FlatEnd => {
  if ("nodeId" in end) {
    const id = end.nodeId as unknown as string
    const node = nodes.get(id)
    if (!node) {
      return { nodeId: "", worldPoint: { x: end.localOffset.x, y: end.localOffset.y } }
    }
    const isCenter = end.localOffset.x === node.w / 2 && end.localOffset.y === node.h / 2
    return {
      nodeId: id,
      worldPoint: isCenter
        ? undefined
        : { x: node.x + end.localOffset.x, y: node.y + end.localOffset.y },
    }
  }
  return { nodeId: "", worldPoint: end.worldPoint }
}


/**
 * Convert a canvas-harness Edge back to a Dim0 Link. Inverse of `linkToEdge`.
 * `nodes` is the map used for resolving attachments (same one used on load).
 */
export const edgeToLink = (edge: Edge, nodes: Map<string, Node>): Link => {
  const data = (edge.data ?? {}) as Partial<LinkEdgeData>
  const sourceFlat = flattenEnd(edge.source, nodes)
  const targetFlat = flattenEnd(edge.target, nodes)
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
      startPoint: sourceFlat.worldPoint
        ? { type: "position", position: sourceFlat.worldPoint }
        : undefined,
      endPoint: targetFlat.worldPoint
        ? { type: "position", position: targetFlat.worldPoint }
        : undefined,
    },
  }
}
