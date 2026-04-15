import type { NoteNode } from '../types/flow'
import type { NodeType } from '../types/style'
import { estimateMarkdownContentHeight } from './markdown-height-estimate'
import { getShapeContentScale } from './shape-content-scale'

const SUPPORTED_NODE_TYPES = new Set<NodeType>([
  'text',
  'rectangle',
  'ellipse',
  'diamond',
  'soft-diamond',
  'tag',
  'layered-circle',
  'layered-rectangle',
  'thought-cloud',
  'capsule',
  'layered-diamond',
])

const MIN_NODE_HEIGHT = 20
const TEXT_VERTICAL_PADDING = 16
const SHAPE_OUTER_PADDING = 8
const SHAPE_HORIZONTAL_PADDING = 16
const SHAPE_VERTICAL_PADDING = 16
const DESCENDER_ALLOWANCE = 4

export function supportsContentMinHeight(nodeType: NodeType) {
  return SUPPORTED_NODE_TYPES.has(nodeType)
}

export function computeNodeContentMinHeight(
  node: NoteNode['data'],
  width?: number,
) {
  const nodeType = node.style.type
  if (!supportsContentMinHeight(nodeType)) return MIN_NODE_HEIGHT

  const safeWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width ?? 0)) : null
  if (!safeWidth) return MIN_NODE_HEIGHT

  const markdown = node.content?.markdown ?? node.label?.markdown ?? ''
  if (!markdown.trim()) return MIN_NODE_HEIGHT
  if (markdown.includes('$$')) {
    return MIN_NODE_HEIGHT
  }

  const contentScale: number = getShapeContentScale(nodeType)
  const outerPadding = nodeType === 'text' ? 0 : SHAPE_OUTER_PADDING
  const horizontalPadding = nodeType === 'text' ? 0 : SHAPE_HORIZONTAL_PADDING
  const verticalPadding = nodeType === 'text' ? TEXT_VERTICAL_PADDING : SHAPE_VERTICAL_PADDING

  const scaledWidth = Math.floor(safeWidth * Math.min(1, contentScale))
  const innerContentWidth = Math.max(1, scaledWidth - outerPadding - horizontalPadding)
  const estimatedContentHeight = estimateMarkdownContentHeight({
    text: markdown,
    width: innerContentWidth,
    fontFamily: node.style.fontFamily,
    fontSize: node.style.fontSize,
    textStyle: node.style.textStyle,
  })

  const scaledMinHeight =
    estimatedContentHeight + outerPadding + verticalPadding - DESCENDER_ALLOWANCE

  return Math.max(
    MIN_NODE_HEIGHT,
    Math.ceil(scaledMinHeight / Math.max(contentScale, 0.0001)),
  )
}
