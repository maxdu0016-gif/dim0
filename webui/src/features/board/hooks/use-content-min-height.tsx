import { useEffect } from 'react'
import { useGraphStore } from '../store/graph-store'
import type { NoteNode } from '../types/flow'
import {
  computeNodeContentMinHeight,
  supportsContentMinHeight,
} from '../utils/compute-node-content-min-height'

/**
 * Keeps a frontend-only cached content floor for mounted text and shape-based nodes.
 * Nodes recompute when their visible layout inputs change or when a caller marks them dirty.
 */
export function useContentMinHeight(
  nodeId: string,
  nodeData: NoteNode['data'],
  width?: number,
) {
  const cachedMinHeight = useGraphStore(state => state.contentMinHeightByNodeId.get(nodeId))
  const shouldRecomputeContentMinHeight = useGraphStore(
    state => state.dirtyContentMinHeightNodeIds.has(nodeId),
  )
  const clearNodeContentMinHeight = useGraphStore(state => state.clearNodeContentMinHeight)
  const setNodeContentMinHeight = useGraphStore(state => state.setNodeContentMinHeight)

  const computedMinH = computeNodeContentMinHeight(nodeData, width)

  useEffect(() => {
    if (!supportsContentMinHeight(nodeData.style.type)) return
    if (!shouldRecomputeContentMinHeight) return

    setNodeContentMinHeight(nodeId, computedMinH)
  }, [computedMinH, nodeData.style.type, nodeId, setNodeContentMinHeight, shouldRecomputeContentMinHeight])

  useEffect(() => {
    if (supportsContentMinHeight(nodeData.style.type)) return

    clearNodeContentMinHeight(nodeId)
  }, [clearNodeContentMinHeight, nodeData.style.type, nodeId])

  useEffect(() => {
    const selector = `.react-flow__node[data-id="${CSS?.escape ? CSS.escape(nodeId) : nodeId}"]`
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return

    if (!supportsContentMinHeight(nodeData.style.type) || cachedMinHeight == null) {
      el.style.removeProperty('min-height')
      return
    }

    el.style.minHeight = `${cachedMinHeight}px`
  }, [cachedMinHeight, nodeData.style.type, nodeId])

  return cachedMinHeight ?? computedMinH
}
