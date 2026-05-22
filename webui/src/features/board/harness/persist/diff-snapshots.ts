import type { Edge, Node } from "@canvas-harness/core"
import type { Link } from "@/features/board/types/link"
import type { Note } from "@/features/board/types/note"
import { edgeToLink } from "../convert/edge-to-link"
import { nodeToNote } from "../convert/node-to-note"


/** Snapshot of the canvas-harness scene at a point in time — only the slices we persist. */
export type Snapshot = {
  nodes: ReadonlyArray<Node>
  edges: ReadonlyArray<Edge>
}


/** A REST call queued for the next flush. Each maps 1:1 onto an api/ helper. */
export type ApiCall =
  | { kind: "addNote"; note: Note }
  | { kind: "updateNote"; note: Note }
  | { kind: "removeNote"; noteId: string }
  | { kind: "addLink"; link: Link }
  | { kind: "updateLink"; link: Link }
  | { kind: "removeLink"; linkId: string }


/**
 * Empty snapshot. Use as the initial `lastSaved` when there's no prior
 * server state — the first flush then writes every node and edge in
 * one batch of `addNote` / `addLink` calls.
 */
export const EMPTY_SNAPSHOT: Snapshot = { nodes: [], edges: [] }


// JSON-stringify is good enough for Node/Edge equality — both are plain
// data with no methods, Dates, or Maps in deserialized form.
const sameSerialized = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)


/**
 * Diff two snapshots and return the minimal set of REST calls needed
 * to migrate the server from `prev` → `next`. Adds and removes are
 * detected by id-set difference; updates by serialized inequality on
 * matching ids.
 */
export const diffSnapshots = (prev: Snapshot, next: Snapshot): ApiCall[] => {
  const calls: ApiCall[] = []

  const nextNodes = new Map<string, Node>(
    next.nodes.map((n) => [n.id as unknown as string, n]),
  )
  const prevNodes = new Map<string, Node>(
    prev.nodes.map((n) => [n.id as unknown as string, n]),
  )
  const nextEdges = new Map<string, Edge>(
    next.edges.map((e) => [e.id as unknown as string, e]),
  )
  const prevEdges = new Map<string, Edge>(
    prev.edges.map((e) => [e.id as unknown as string, e]),
  )

  for (const [id] of prevEdges) {
    if (!nextEdges.has(id)) calls.push({ kind: "removeLink", linkId: id })
  }
  for (const [id] of prevNodes) {
    if (!nextNodes.has(id)) calls.push({ kind: "removeNote", noteId: id })
  }
  for (const [id, node] of nextNodes) {
    if (!prevNodes.has(id)) calls.push({ kind: "addNote", note: nodeToNote(node) })
  }
  for (const [id, edge] of nextEdges) {
    if (!prevEdges.has(id)) {
      calls.push({ kind: "addLink", link: edgeToLink(edge, nextNodes) })
    }
  }
  for (const [id, nextNode] of nextNodes) {
    const prevNode = prevNodes.get(id)
    if (prevNode && !sameSerialized(prevNode, nextNode)) {
      calls.push({ kind: "updateNote", note: nodeToNote(nextNode) })
    }
  }
  for (const [id, nextEdge] of nextEdges) {
    const prevEdge = prevEdges.get(id)
    if (prevEdge && !sameSerialized(prevEdge, nextEdge)) {
      calls.push({ kind: "updateLink", link: edgeToLink(nextEdge, nextNodes) })
    }
  }

  return calls
}
