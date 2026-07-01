/**
 * Per-layer (subspace) projection of board content.
 *
 * Mirrors the backend `get_graph(root_id)`: a board is a tree of layers linked by
 * `parentId`, and only one layer is visible at a time. The root layer is
 * `parentId == null`; entering a folder scopes to `parentId == folderId`.
 *
 * This is a *projection* for the live canvas store only — persistence stays
 * whole-board (the oplog/snapshot cover every layer), so filtering here can never
 * drop other layers.
 */
import type { BoardContent } from "."


/** Normalise a parentId to its layer key (null = root layer). */
const layerOf = (parentId: string | null | undefined): string | null => parentId ?? null


/**
 * Keep only the nodes/edges in `rootId`'s layer (root layer when `rootId` is
 * null). Groups and frameOrder pass through unchanged — they're layout metadata,
 * not layer-scoped.
 */
export const filterContentByLayer = (content: BoardContent, rootId: string | null): BoardContent => {
  const target = rootId ?? null
  return {
    ...content,
    nodes: content.nodes.filter((n) => layerOf(n.data?.parentId) === target),
    edges: content.edges.filter((e) => layerOf(e.data?.parentId) === target),
  }
}
