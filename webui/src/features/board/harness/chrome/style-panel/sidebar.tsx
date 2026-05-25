import { useCallback, useMemo } from "react"
import type { Node, Style as CanvasStyle } from "@canvas-harness/core"
import { useCanvasStore, useNodes, useSelection } from "@canvas-harness/react"
import { useTheme } from "@/components/theme-provider"
import type { NoteNodeData } from "../../convert/note-to-node"
import {
  adaptNodeColors,
  applyColorsToStyle,
  type StoredColors,
} from "../../theme/color-adapter"
import { StylePanel } from "./panel"


/** The three color fields that round-trip through `data._storedColors`. */
const COLOR_FIELDS = ["strokeColor", "backgroundColor", "textColor"] as const
type ColorField = (typeof COLOR_FIELDS)[number]


/** Lift stored colors off a Node, falling back to `node.style` for legacy nodes. */
const storedColorsOf = (n: Node): StoredColors => {
  const data = n.data as Partial<NoteNodeData> | undefined
  return (
    data?._storedColors ?? {
      backgroundColor: n.style?.backgroundColor,
      strokeColor: n.style?.strokeColor,
      textColor: n.style?.textColor,
    }
  )
}


/**
 * Reads the current selection from canvas-harness, derives a single
 * representative style from the first selected non-frame node, and
 * dispatches style changes back to all selected nodes in one undoable
 * batch.
 *
 * Color fields are special: the panel works in the user's stored
 * color space (what they actually picked). On commit we write the
 * picked value back to `data._storedColors` AND project it for the
 * current theme mode before assigning to `node.style` — that keeps
 * the displayed paint in sync without ever touching the source of
 * truth on the wrong path.
 */
export function StyleSidebar() {
  const selection = useSelection()
  const allNodes = useNodes()
  const store = useCanvasStore()
  const { resolvedTheme } = useTheme()

  const selectedNodes = useMemo<Node[]>(() => {
    if (selection.length === 0) return []
    const ids = new Set(selection as string[])
    return allNodes.filter((n) => ids.has(n.id as unknown as string) && n.type !== "frame")
  }, [selection, allNodes])

  // Build the style we hand to the panel out of stored colors (so the
  // picker shows the user's pick, not its dark-mode shadow) layered on
  // top of the rest of the displayed style.
  const representativeStyle = useMemo<CanvasStyle | undefined>(() => {
    const first = selectedNodes[0]
    if (!first?.style) return undefined
    return applyColorsToStyle(first.style, storedColorsOf(first))
  }, [selectedNodes])

  const handleStyleChange = useCallback(
    (patch: Partial<CanvasStyle>) => {
      // Split patch into color fields (need stored+displayed split) and
      // everything else (passes through unchanged).
      const colorPatch: Partial<StoredColors> = {}
      const rest: Partial<CanvasStyle> = { ...patch }
      for (const k of COLOR_FIELDS) {
        if (k in patch) {
          colorPatch[k] = patch[k as ColorField] ?? undefined
          delete rest[k]
        }
      }
      const hasColor = Object.keys(colorPatch).length > 0
      const hasRest = Object.keys(rest).length > 0

      store.batch(() => {
        for (const n of selectedNodes) {
          const prevStored = storedColorsOf(n)
          const nextStored: StoredColors = hasColor
            ? { ...prevStored, ...colorPatch }
            : prevStored
          const displayColors =
            resolvedTheme === "dark" ? adaptNodeColors(nextStored, "dark") : nextStored
          const baseStyle = hasRest ? { ...n.style, ...rest } : n.style ?? {}
          const nextStyle = hasColor
            ? applyColorsToStyle(baseStyle, displayColors)
            : baseStyle
          const nextData: NoteNodeData = {
            ...((n.data ?? {}) as NoteNodeData),
            _storedColors: nextStored,
          }
          store.updateNode(n.id, { style: nextStyle, data: nextData })
        }
      })
    },
    [store, selectedNodes, resolvedTheme],
  )

  if (selectedNodes.length === 0 || !representativeStyle) return null

  return (
    <div className="pointer-events-auto absolute left-3 top-1/2 z-50 w-[160px] -translate-y-1/2">
      <StylePanel style={representativeStyle} onStyleChange={handleStyleChange} />
    </div>
  )
}
