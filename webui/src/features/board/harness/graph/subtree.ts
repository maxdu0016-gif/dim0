/**
 * Descendant-cascade node removal — the local analog of the backend
 * `GraphStore.delete_node` (BFS over `parent_id`).
 *
 * Two-part, because a local board renders only ONE layer at a time:
 *   1. Loaded layer — remove the node + any descendants present in the live
 *      store, in one batch (so a single undo restores them, edges included).
 *   2. Deeper layers — a folder's children live in a deeper layer that isn't in
 *      the store. Sweep them from the WHOLE board via persistence (the oplog
 *      covers every layer), recording their removal so they don't orphan.
 *
 * On backend boards there's no local persistence ref, so only step 1 runs and the
 * server performs its own cascade (unchanged behaviour).
 */
import { asBatchId } from "@canvas-harness/core"
import type { CanvasStore, NodeId, Op } from "@canvas-harness/core"
import type { DimNode } from "@/features/board/model"
import { getBoardPersistenceRef } from "@/features/board/persist/local/board-persistence-ref"


/**
 * Collect `roots` plus every transitive descendant (via `data.parentId`) as a
 * de-duplicated id set. Cycle-safe: a node is visited at most once. Works even
 * when a root isn't in `nodes` (its children still resolve via `parentId`).
 */
export const collectSubtreeIds = (nodes: DimNode[], roots: NodeId[]): Set<NodeId> => {
  const childrenByParent = new Map<string, NodeId[]>()
  for (const node of nodes) {
    const parentId = node.data?.parentId
    if (!parentId) continue
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(node.id)
    childrenByParent.set(parentId, siblings)
  }

  const collected = new Set<NodeId>()
  const queue: NodeId[] = [...roots]
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined || collected.has(id)) continue
    collected.add(id)
    for (const child of childrenByParent.get(id) ?? []) {
      if (!collected.has(child)) queue.push(child)
    }
  }
  return collected
}


/** The node id an edge end points at (canvas-harness end is `{ nodeId }`, or a bare id). */
const edgeEndId = (end: unknown): string | undefined => {
  if (typeof end === "string") return end
  if (end && typeof end === "object" && "nodeId" in end) return String((end as { nodeId: unknown }).nodeId)
  return undefined
}


/**
 * Remove descendants that live in deeper (unloaded) layers, straight from the
 * whole-board oplog. Best-effort: a failure leaves orphans (prior behaviour) but
 * never throws into the click handler.
 */
const sweepDeepDescendants = async (store: CanvasStore, roots: NodeId[], loaded: Set<NodeId>): Promise<void> => {
  const persistence = getBoardPersistenceRef()
  if (!persistence) return // backend board / nothing else loaded — server cascades

  try {
    await persistence.flush() // make the loaded-layer removal durable first
    const content = await persistence.load() // whole board (every layer)
    const all = collectSubtreeIds(content.nodes, roots)
    const deep = new Set<string>()
    for (const id of all) if (!loaded.has(id)) deep.add(id)
    if (deep.size === 0) return

    const removeNodes = content.nodes.filter((n) => deep.has(n.id))
    const removeEdges = content.edges.filter((e) => {
      const s = edgeEndId(e.source)
      const t = edgeEndId(e.target)
      return (s !== undefined && deep.has(s)) || (t !== undefined && deep.has(t))
    })

    const ops: Op[] = [
      ...removeEdges.map((edge) => ({ type: "edge.remove", edge }) as Op),
      ...removeNodes.map((node) => ({ type: "node.remove", node }) as Op),
    ]
    persistence.record({
      id: asBatchId(store.generateId()),
      clientId: store.clientId,
      ts: Date.now(),
      origin: "local",
      ops,
    })
    await persistence.flush()
  } catch (err) {
    console.warn("[harness] deep subtree cascade failed", err)
  }
}


/**
 * Remove nodes and all their descendants. Synchronously clears the loaded layer
 * (immediate UI + one undo), then sweeps deeper layers via persistence.
 */
export const removeNodesSubtreeAsync = async (store: CanvasStore, roots: NodeId[]): Promise<void> => {
  if (roots.length === 0) return
  const loaded = collectSubtreeIds(store.getAllNodes() as DimNode[], roots)
  if (loaded.size > 0) {
    store.batch(() => {
      for (const id of loaded) store.removeNode(id)
    })
  }
  await sweepDeepDescendants(store, roots, loaded)
}


/** Fire-and-forget variant for click handlers (the loaded-layer removal is sync). */
export const removeNodesSubtree = (store: CanvasStore, roots: NodeId[]): void => {
  void removeNodesSubtreeAsync(store, roots)
}


/** Remove one node and all its descendants (its subtree). */
export const removeNodeSubtree = (store: CanvasStore, root: NodeId): void => {
  removeNodesSubtree(store, [root])
}
