import { useEffect } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import {
  adaptEdgeColors,
  applyColorsToEdgeStyle,
  type StoredEdgeColors,
} from "../theme/color-adapter"
import { getBoardThemeMode } from "../theme/theme-mode-ref"


/**
 * Dim0 LinkStyle canonical-light defaults — mirror
 * `backend/topix/datatypes/note/style.py:LinkStyle`. Used as the
 * `_storedColors` fallback when a freshly-drawn edge has no prior
 * stamp. We CAN'T read from `op.edge.style.*` because the arrow
 * tool's defaults in dark mode are already theme-adapted (display
 * values, not canonical), and stamping those as if they were
 * canonical poisons the cross-theme sync (a light-mode peer would
 * adapt them as identity and see the dark hex).
 */
const CANONICAL_EDGE_COLORS: StoredEdgeColors = {
  strokeColor: "#292524",
  textColor: "#000000",
}


/**
 * Stamp identity + dark-mode bookkeeping onto edges created by the
 * lib's arrow tool. Canvas-harness's `useArrowTool` calls
 * `store.addEdge` with no `data` field, which means newly-drawn edges
 * have no parent_id when persisted (so an edge drawn inside a
 * sub-folder would appear at the root board) and no `_storedColors`
 * (so a theme toggle later wouldn't have a source-of-truth to project
 * from).
 *
 * This subscriber:
 *  - sets `version` / `createdAt` / `graphUid` / `parentId`
 *  - captures the edge's freshly-applied style (which arrowDefaults
 *    seeded from sticky style memory) as `_storedColors` — what the
 *    user picked
 *  - in dark mode, replaces `edge.style.{stroke,text}Color` with the
 *    dark-adapted projection so the new edge paints consistently
 *
 * Hydrated edges already carry `version` via the convert layer, so we
 * skip them.
 *
 * Mirrors prod's [line-placement.ts](dim0/.../line-placement.ts)
 * which sets `parentId: rootId` directly at construction time.
 */
export const useStampNewEdges = (
  store: CanvasStore,
  boardId: string | null,
  rootId: string | null,
): void => {
  useEffect(() => {
    if (!boardId) return
    return store.subscribe("change", (batch) => {
      if (batch.origin !== "local") return
      for (const op of batch.ops) {
        if (op.type !== "edge.add") continue
        const data = (op.edge.data ?? {}) as Record<string, unknown>
        // Skip edges already stamped by the convert layer (hydration /
        // applyBatch from an agent) — they always carry `version`.
        if (data.version !== undefined) continue

        const style = op.edge.style ?? {}
        // If the edge already carries `_storedColors` (e.g., the user
        // picked colors via the style panel before drawing — the
        // picker writes canonical values directly), trust them.
        // Otherwise fall back to Dim0 LinkStyle canonical defaults —
        // never read from `style.*`, since the arrow tool's dark-mode
        // defaults are theme-adapted display values that look canonical
        // to `pickStoredEdgeColors` but aren't.
        const existingStored = data._storedColors as StoredEdgeColors | undefined
        const storedColors: StoredEdgeColors = existingStored ?? CANONICAL_EDGE_COLORS
        const mode = getBoardThemeMode()
        const displayColors =
          mode === "dark" ? adaptEdgeColors(storedColors, "dark") : storedColors
        const nextStyle = applyColorsToEdgeStyle(style, displayColors)

        store.updateEdge(op.edge.id, {
          style: nextStyle,
          data: {
            ...data,
            version: 1,
            createdAt: new Date().toISOString(),
            graphUid: boardId,
            parentId: rootId ?? undefined,
            _storedColors: storedColors,
          },
        })
      }
    })
  }, [store, boardId, rootId])
}
