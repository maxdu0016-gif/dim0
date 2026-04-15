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
  const setNodes = useGraphStore(state => state.setNodes)

  const computedMinH = computeNodeContentMinHeight(nodeData, width)

  useEffect(() => {
    if (!supportsContentMinHeight(nodeData.style.type)) return
    if (!nodeData.shouldRecomputeContentMinHeight) return

    setNodes(nodes =>
      nodes.map(node => {
        if (node.id !== nodeId) return node

        const cachedNodeData = node.data as NoteNode['data']
        if (
          cachedNodeData.contentMinHeight === computedMinH &&
          !cachedNodeData.shouldRecomputeContentMinHeight
        ) {
          return node
        }

        return {
          ...node,
          data: {
            ...cachedNodeData,
            contentMinHeight: computedMinH,
            shouldRecomputeContentMinHeight: false,
          },
        }
      }),
    )
  }, [
    computedMinH,
    nodeData.contentMinHeight,
    nodeData.shouldRecomputeContentMinHeight,
    nodeData.style.type,
    nodeId,
    setNodes,
  ])

  useEffect(() => {
    if (!supportsContentMinHeight(nodeData.style.type)) return
    if (nodeData.contentMinHeight == null) return
    const selector = `.react-flow__node[data-id="${CSS?.escape ? CSS.escape(nodeId) : nodeId}"]`
    const el = document.querySelector<HTMLElement>(selector)
    if (el) {
      el.style.minHeight = `${nodeData.contentMinHeight}px`
    }
  }, [nodeData.contentMinHeight, nodeData.style.type, nodeId])

  return nodeData.contentMinHeight ?? computedMinH
}
