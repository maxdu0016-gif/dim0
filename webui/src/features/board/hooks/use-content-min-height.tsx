import { useEffect, useMemo } from 'react'
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
  const nodeType = nodeData.style.type
  const markdown = nodeData.content?.markdown ?? nodeData.label?.markdown ?? ''
  const supportsMinHeight = supportsContentMinHeight(nodeType)
  const shouldComputeMinHeight = supportsMinHeight && (shouldRecomputeContentMinHeight || cachedMinHeight == null)

  const computedMinH = useMemo(() => {
    if (!shouldComputeMinHeight) {
      return cachedMinHeight ?? 20
    }

    return computeNodeContentMinHeight({
      nodeType,
      markdown,
      width,
      fontFamily: nodeData.style.fontFamily,
      fontSize: nodeData.style.fontSize,
      textStyle: nodeData.style.textStyle,
    })
  }, [
    cachedMinHeight,
    markdown,
    nodeData.style.fontFamily,
    nodeData.style.fontSize,
    nodeData.style.textStyle,
    nodeType,
    shouldComputeMinHeight,
    width,
  ])

  useEffect(() => {
    if (!supportsMinHeight) return
    if (!shouldRecomputeContentMinHeight) return

    setNodeContentMinHeight(nodeId, computedMinH)
  }, [computedMinH, nodeId, setNodeContentMinHeight, shouldRecomputeContentMinHeight, supportsMinHeight])

  useEffect(() => {
    if (supportsMinHeight) return

    clearNodeContentMinHeight(nodeId)
  }, [clearNodeContentMinHeight, nodeId, supportsMinHeight])

  useEffect(() => {
    const selector = `.react-flow__node[data-id="${CSS?.escape ? CSS.escape(nodeId) : nodeId}"]`
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return

    if (!supportsMinHeight || cachedMinHeight == null) {
      el.style.removeProperty('min-height')
      return
    }

    el.style.minHeight = `${cachedMinHeight}px`
  }, [cachedMinHeight, nodeId, supportsMinHeight])

  return cachedMinHeight ?? computedMinH
}
