import type { CanvasStore, Node } from "@canvas-harness/core"
import { getBoard, type BoardRole } from "@/features/board/api/get-board"
import type { Graph } from "@/features/board/types/board"
import { linkToEdge } from "../convert/link-to-edge"
import { noteToNode } from "../convert/note-to-node"


export type HydrateResult = {
  graph: Graph
  canEdit: boolean
  role: BoardRole
}


/**
 * Apply a Graph payload (REST-shaped notes / links) to the canvas-harness
 * store. Two modes:
 *
 *   - `"replace"` (default — used by `hydrateBoardStore` on first load):
 *     nuke the store and replay the snapshot. Undo history is cleared
 *     because a fresh hydration is never undoable.
 *   - `"merge"` (used by the WS welcome handler on reconnect /
 *     authoritative sync): diff against current store state and apply
 *     minimal changes. Empty snapshots are a no-op, NOT a wipe — a
 *     server-side DB hiccup that yields `{}` won't blank the canvas.
 *     Undo history is preserved.
 *
 * The shape conversion (`noteToNode` / `linkToEdge`) is identical in
 * both modes; only the mutation strategy against the existing store
 * differs.
 */
export const applyGraphToStore = (
  store: CanvasStore,
  graph: Graph,
  opts: { mode?: "replace" | "merge" } = {},
): void => {
  const mode = opts.mode ?? "replace"
  const notes = graph.nodes ?? []
  const links = graph.edges ?? []

  const nodes = notes.map(noteToNode)
  const nodesById = new Map<string, Node>(
    nodes.map((n) => [n.id as unknown as string, n]),
  )
  const edges = links.map((l) => linkToEdge(l, nodesById))

  if (mode === "replace") {
    store.batch(() => {
      for (const e of store.getAllEdges()) store.removeEdge(e.id)
      for (const n of store.getAllNodes()) store.removeNode(n.id)
      for (const n of nodes) store.addNode(n)
      for (const e of edges) store.addEdge(e)
    })
    store.clearHistory()
    return
  }

  // Merge mode: empty input is a no-op. Without this guard, a DB hiccup
  // (where the server returns `{}` from `read_snapshot_payload`) would
  // wipe the entire canvas — the symptom we hit in initial 1c.1 rollout.
  if (nodes.length === 0 && edges.length === 0) return

  const incomingNodeIds = new Set(nodes.map((n) => n.id as unknown as string))
  const incomingEdgeIds = new Set(edges.map((e) => e.id as unknown as string))
  const currentNodes = store.getAllNodes()
  const currentEdges = store.getAllEdges()
  const currentNodeMap = new Map(
    currentNodes.map((n) => [n.id as unknown as string, n]),
  )
  const currentEdgeMap = new Map(
    currentEdges.map((e) => [e.id as unknown as string, e]),
  )

  store.batch(() => {
    // Remove edges first (they depend on nodes), then nodes.
    for (const e of currentEdges) {
      if (!incomingEdgeIds.has(e.id as unknown as string)) {
        store.removeEdge(e.id)
      }
    }
    for (const n of currentNodes) {
      if (!incomingNodeIds.has(n.id as unknown as string)) {
        store.removeNode(n.id)
      }
    }
    // Add new nodes; update-in-place existing ones so the canvas-harness
    // store's identity-stable refs survive merge (selection / focus stay
    // attached to the same id).
    for (const n of nodes) {
      const id = n.id as unknown as string
      if (currentNodeMap.has(id)) {
        store.updateNode(n.id, n)
      } else {
        store.addNode(n)
      }
    }
    for (const e of edges) {
      const id = e.id as unknown as string
      if (currentEdgeMap.has(id)) {
        store.updateEdge(e.id, e)
      } else {
        store.addEdge(e)
      }
    }
  })
  // No clearHistory — merge preserves undo state across reconnects.
}


/**
 * Fetch a board from the API and load its nodes / edges into the
 * canvas-harness store. Wrapped in one batch (so the initial paint
 * doesn't trigger N renders) and the history stack is cleared after
 * — first-load is never undoable.
 *
 * Returns the raw graph metadata (label, visibility, canEdit) for the
 * caller to push into the board-app store.
 *
 * `isCancelled` is checked once after the network resolves: if the
 * caller has navigated to a different scope while the fetch was in
 * flight, we skip the store mutation entirely. Without this guard, the
 * shared store would get clobbered by stale content — and the save
 * loop would then persist the wrong board's nodes/edges back to the
 * current board id.
 */
export const hydrateBoardStore = async (
  store: CanvasStore,
  opts: {
    boardId: string
    rootId?: string
    isCancelled?: () => boolean
  },
): Promise<HydrateResult> => {
  const { boardId, rootId, isCancelled } = opts
  const { graph, canEdit, role } = await getBoard(boardId, rootId)

  // Bail before any conversion or store mutation if a newer scope has
  // taken over. We still return the fetched graph so the caller's
  // (also-cancelled) `.then` doesn't NPE in unusual shapes.
  if (isCancelled?.()) return { graph, canEdit, role }

  applyGraphToStore(store, graph)

  return { graph, canEdit, role }
}
