import { asEdgeId, asGroupId } from "@canvas-harness/core"
import type { Edge, EdgeEnd, Node, Vec2 } from "@canvas-harness/core"
import type { Link } from "@/features/board/types/link"
import { dim0LinkStyleToCanvas } from "./style"


/** Payload on `Edge.data` that preserves Dim0 Link fields not lifted to Edge primitives. */
export type LinkEdgeData = {
  version: number
  createdAt: string
  updatedAt?: string
  deletedAt?: string
  graphUid: string
  parentId?: string
}


/**
 * Resolve a Link end (source or target side) into an `EdgeEnd`.
 *
 *  - Resolved node + no world point   → attach at node center.
 *  - Resolved node + world point      → attach with local offset (worldPoint - node.x/y).
 *  - Unresolved node (empty / missing) + world point → free world point.
 *  - Both fail                        → fall back to (0, 0) world point so the edge survives.
 *
 * See migration-canvas-harness.md §3.2 for the schema rationale.
 */
const resolveEnd = (
  nodeId: string,
  worldPoint: { x: number; y: number } | undefined,
  nodes: Map<string, Node>,
): EdgeEnd => {
  const node = nodeId ? nodes.get(nodeId) : undefined
  if (node) {
    if (worldPoint) {
      return {
        nodeId: node.id,
        localOffset: { x: worldPoint.x - node.x, y: worldPoint.y - node.y },
      }
    }
    return {
      nodeId: node.id,
      localOffset: { x: node.w / 2, y: node.h / 2 },
    }
  }
  if (worldPoint) return { worldPoint }
  return { worldPoint: { x: 0, y: 0 } }
}


/**
 * Convert a Dim0 Link to a canvas-harness Edge. `nodes` is a lookup of
 * the freshly-converted Nodes (built from the same scene) — used to
 * resolve attachment endpoints.
 */
export const linkToEdge = (link: Link, nodes: Map<string, Node>): Edge => {
  const source = resolveEnd(link.source, link.properties?.startPoint?.position, nodes)
  const target = resolveEnd(link.target, link.properties?.endPoint?.position, nodes)
  const controlPos = link.properties?.edgeControlPoint?.position
  const control: Vec2[] | undefined = controlPos ? [controlPos] : undefined

  const data: LinkEdgeData = {
    version: link.version,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    deletedAt: link.deletedAt,
    graphUid: link.graphUid,
    parentId: link.parentId,
  }

  return {
    id: asEdgeId(link.id),
    source,
    target,
    pathStyle: link.style.pathStyle,
    control,
    z: 0,
    groups: (link.style.groupIds ?? []).map(asGroupId),
    content: link.label?.markdown ?? "",
    style: dim0LinkStyleToCanvas(link.style),
    data,
  }
}
