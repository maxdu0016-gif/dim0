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
  /**
   * Client-side marker — `true` when this endpoint was loaded with the
   * legacy world-coord interpretation (`isLocalOffset` was falsy on the
   * wire). Used by the persist diff to cascade-resave the edge when its
   * attached node moves, which upgrades it to the new local-offset
   * format. Never sent to the server; rewritten on every load.
   */
  sourceLegacyOffset?: boolean
  targetLegacyOffset?: boolean
}


type ResolveResult = {
  end: EdgeEnd
  /** True iff this endpoint was attached AND came in with world coords (legacy format). */
  legacy: boolean
}


/**
 * Resolve a Link end (source or target side) into an `EdgeEnd`. Picks
 * between local-offset (new format) and world-coord (legacy) based on
 * the `isLocalOffset` flag.
 *
 *  - Attached + isLocalOffset=true             → localOffset = position as-is.
 *  - Attached + isLocalOffset falsy + position → localOffset = position - node.x/y (legacy math).
 *  - Attached + no position                    → localOffset = node center.
 *  - Unresolved node + position                → free worldPoint.
 *  - Both fail                                  → fall back to (0, 0) free worldPoint.
 *
 * See migration-canvas-harness.md §3.2 for the schema rationale.
 */
const resolveEnd = (
  nodeId: string,
  position: { x: number; y: number } | undefined,
  isLocalOffset: boolean | undefined,
  nodes: Map<string, Node>,
): ResolveResult => {
  const node = nodeId ? nodes.get(nodeId) : undefined
  if (node) {
    if (position) {
      if (isLocalOffset) {
        return {
          end: { nodeId: node.id, localOffset: { x: position.x, y: position.y } },
          legacy: false,
        }
      }
      return {
        end: {
          nodeId: node.id,
          localOffset: { x: position.x - node.x, y: position.y - node.y },
        },
        legacy: true,
      }
    }
    return {
      end: { nodeId: node.id, localOffset: { x: node.w / 2, y: node.h / 2 } },
      legacy: false,
    }
  }
  if (position) return { end: { worldPoint: position }, legacy: false }
  return { end: { worldPoint: { x: 0, y: 0 } }, legacy: false }
}


/**
 * Convert a Dim0 Link to a canvas-harness Edge. `nodes` is a lookup of
 * the freshly-converted Nodes (built from the same scene) — used to
 * resolve attachment endpoints.
 */
export const linkToEdge = (link: Link, nodes: Map<string, Node>): Edge => {
  const sourceResolved = resolveEnd(
    link.source,
    link.properties?.startPoint?.position,
    link.properties?.startPoint?.isLocalOffset,
    nodes,
  )
  const targetResolved = resolveEnd(
    link.target,
    link.properties?.endPoint?.position,
    link.properties?.endPoint?.isLocalOffset,
    nodes,
  )
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
  if (sourceResolved.legacy) data.sourceLegacyOffset = true
  if (targetResolved.legacy) data.targetLegacyOffset = true

  return {
    id: asEdgeId(link.id),
    source: sourceResolved.end,
    target: targetResolved.end,
    pathStyle: link.style.pathStyle,
    control,
    z: 0,
    groups: (link.style.groupIds ?? []).map(asGroupId),
    content: link.label?.markdown ?? "",
    style: dim0LinkStyleToCanvas(link.style),
    data,
  }
}
