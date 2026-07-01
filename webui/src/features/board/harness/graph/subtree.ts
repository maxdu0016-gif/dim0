/**
 * Descendant-cascade node removal — the local analog of the backend
 * `GraphStore.delete_node`.
 *
 * `parentId` (on our `node.data`) is a Dim0 concept the canvas store knows
 * nothing about, so we BFS the subtree ourselves. `store.removeNode` already
 * cascade-removes a node's incident edges; wrapping the whole subtree in one
 * `store.batch()` makes a single undo restore the node, its descendants, and
 * every edge that pointed at any of them.
 */
import type { CanvasStore, NodeId } from "@canvas-harness/core"
import type { DimNode } from "@/features/board/model"


/**
 * Collect `roots` plus every transitive descendant (via `data.parentId`) as a
 * de-duplicated id set. Cycle-safe: a node is visited at most once.
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


/** Remove nodes and all their descendants in one batch (one undo restores all). */
export const removeNodesSubtree = (store: CanvasStore, roots: NodeId[]): void => {
  if (roots.length === 0) return
  const ids = collectSubtreeIds(store.getAllNodes() as DimNode[], roots)
  if (ids.size === 0) return
  store.batch(() => {
    for (const id of ids) store.removeNode(id)
  })
}


/** Remove one node and all its descendants (its subtree) in a single batch. */
export const removeNodeSubtree = (store: CanvasStore, root: NodeId): void => {
  removeNodesSubtree(store, [root])
}
